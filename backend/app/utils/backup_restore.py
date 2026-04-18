from __future__ import annotations

import os
import json
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from fastapi import UploadFile

from app.bootstrap import ensure_tenant_admin_users
from app.config import settings
from app.database import Base, dispose_tenant_engine, init_tenant_db
from app.models import clinica_models, models  # noqa: F401


@dataclass
class BackupInfo:
    filename: str
    path: Path
    size_bytes: int
    created_at: datetime


@dataclass
class BackupHealthSummary:
    total_usuarios: int
    usuarios_activos: int
    admins_activos: int
    total_clientes: int
    total_presupuestos: int
    total_ventas: int


def backups_root() -> Path:
    root = Path(__file__).resolve().parents[2] / "backups"
    root.mkdir(parents=True, exist_ok=True)
    return root


def tenant_backup_dir(tenant_slug: str) -> Path:
    directory = backups_root() / tenant_slug
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def list_backups(tenant_slug: str) -> list[BackupInfo]:
    directory = tenant_backup_dir(tenant_slug)
    backups = []
    for path in sorted(directory.glob("*.dump"), key=lambda item: item.stat().st_mtime, reverse=True):
        stat = path.stat()
        backups.append(
            BackupInfo(
                filename=path.name,
                path=path,
                size_bytes=stat.st_size,
                created_at=datetime.fromtimestamp(stat.st_mtime),
            )
        )
    return backups


def resolve_pg_binary(binary_name: str) -> str:
    candidate = shutil.which(binary_name)
    if candidate:
        return candidate

    versions = ["18", "17", "16", "15", "14", "13"]
    for version in versions:
        path = Path(rf"C:\Program Files\PostgreSQL\{version}\bin\{binary_name}.exe")
        if path.exists():
            return str(path)

    raise RuntimeError(
        f"No se encontró {binary_name}. Instala PostgreSQL client tools o agrega {binary_name} al PATH."
    )


def get_tenant_database_url(tenant_slug: str) -> str:
    return settings.get_tenant_db_url(tenant_slug)


def get_tenant_database_name(tenant_slug: str) -> str:
    return urlparse(get_tenant_database_url(tenant_slug)).path.lstrip("/")


def create_backup(tenant_slug: str) -> BackupInfo:
    db_url = get_tenant_database_url(tenant_slug)
    parsed = urlparse(db_url)
    filename = f"{tenant_slug}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.dump"
    output_path = tenant_backup_dir(tenant_slug) / filename
    health = _validate_backup_source(parsed)

    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = parsed.password

    result = subprocess.run(
        [
            resolve_pg_binary("pg_dump"),
            "-h", parsed.hostname or "localhost",
            "-p", str(parsed.port or 5432),
            "-U", parsed.username or "postgres",
            "-F", "c",
            "-f", str(output_path),
            parsed.path.lstrip("/"),
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "No se pudo generar el backup.")

    _validate_backup_dump(parsed, output_path, env)
    _write_backup_manifest(output_path, tenant_slug, health)

    stat = output_path.stat()
    return BackupInfo(
        filename=output_path.name,
        path=output_path,
        size_bytes=stat.st_size,
        created_at=datetime.fromtimestamp(stat.st_mtime),
    )


def restore_backup(tenant_slug: str, filename: str) -> BackupInfo:
    backup_path = tenant_backup_dir(tenant_slug) / filename
    if not backup_path.exists():
        raise RuntimeError("El backup seleccionado no existe.")
    return _restore_backup_path(tenant_slug, backup_path)


def restore_uploaded_backup(tenant_slug: str, upload: UploadFile) -> BackupInfo:
    original_name = (upload.filename or "").strip()
    if not original_name:
        raise RuntimeError("Debes seleccionar un archivo de backup.")
    if not original_name.lower().endswith(".dump"):
        raise RuntimeError("Solo se permiten archivos .dump de PostgreSQL.")

    safe_name = Path(original_name).name
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    destination = tenant_backup_dir(tenant_slug) / f"importado_{timestamp}_{safe_name}"

    try:
        with destination.open("wb") as output:
            shutil.copyfileobj(upload.file, output)
    finally:
        upload.file.close()

    return _restore_backup_path(tenant_slug, destination)


def _restore_backup_path(tenant_slug: str, backup_path: Path) -> BackupInfo:
    if not backup_path.exists():
        raise RuntimeError("El backup seleccionado no existe.")

    db_url = get_tenant_database_url(tenant_slug)
    parsed = urlparse(db_url)
    db_name = parsed.path.lstrip("/")

    dispose_tenant_engine(tenant_slug)
    _terminate_database_connections(parsed, db_name)
    _reset_public_schema(parsed, db_name)

    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = parsed.password

    _run_pg_restore(
        parsed=parsed,
        db_name=db_name,
        backup_path=backup_path,
        env=env,
        extra_args=["--section=pre-data"],
        error_message="No se pudo restaurar la estructura base del backup.",
    )
    _run_pg_restore(
        parsed=parsed,
        db_name=db_name,
        backup_path=backup_path,
        env=env,
        extra_args=["--data-only"],
        error_message="No se pudieron restaurar los datos del backup.",
    )
    _cleanup_orphan_rows(parsed, db_name)
    _run_pg_restore(
        parsed=parsed,
        db_name=db_name,
        backup_path=backup_path,
        env=env,
        extra_args=["--section=post-data"],
        error_message="No se pudieron aplicar los constraints finales del backup.",
    )
    dispose_tenant_engine(tenant_slug)
    init_tenant_db(tenant_slug)
    ensure_tenant_admin_users(tenant_slug)

    stat = backup_path.stat()
    return BackupInfo(
        filename=backup_path.name,
        path=backup_path,
        size_bytes=stat.st_size,
        created_at=datetime.fromtimestamp(stat.st_mtime),
    )


def _run_pg_restore(*, parsed, db_name: str, backup_path: Path, env: dict, extra_args: list[str], error_message: str) -> None:
    result = subprocess.run(
        [
            resolve_pg_binary("pg_restore"),
            "--no-owner",
            "--no-privileges",
            "-h", parsed.hostname or "localhost",
            "-p", str(parsed.port or 5432),
            "-U", parsed.username or "postgres",
            "-d", db_name,
            *extra_args,
            str(backup_path),
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or error_message)


def _validate_backup_source(parsed) -> BackupHealthSummary:
    db_name = parsed.path.lstrip("/")
    conn = psycopg2.connect(
        dbname=db_name,
        user=parsed.username or "postgres",
        password=parsed.password or "",
        host=parsed.hostname or "localhost",
        port=parsed.port or 5432,
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'usuarios'
                )
                """
            )
            has_usuarios = bool(cursor.fetchone()[0])
            if not has_usuarios:
                raise RuntimeError(
                    "No se puede generar el backup porque la tabla de usuarios no existe en este tenant."
                )

            cursor.execute(
                """
                SELECT
                    COUNT(*) AS total_usuarios,
                    COUNT(*) FILTER (WHERE activo IS TRUE) AS usuarios_activos,
                    COUNT(*) FILTER (WHERE activo IS TRUE AND UPPER(COALESCE(rol, '')) = 'ADMIN') AS admins_activos
                FROM usuarios
                """
            )
            total_usuarios, usuarios_activos, admins_activos = cursor.fetchone()

            if total_usuarios <= 0:
                raise RuntimeError(
                    "No se puede generar el backup porque no existen usuarios en el sistema."
                )
            if usuarios_activos <= 0:
                raise RuntimeError(
                    "No se puede generar el backup porque no hay usuarios activos en el sistema."
                )
            if admins_activos <= 0:
                raise RuntimeError(
                    "No se puede generar el backup porque no hay ningun administrador activo en el sistema."
                )

            total_clientes = _count_table_rows(cursor, "clientes")
            total_presupuestos = _count_table_rows(cursor, "presupuestos")
            total_ventas = _count_table_rows(cursor, "ventas")

            return BackupHealthSummary(
                total_usuarios=int(total_usuarios),
                usuarios_activos=int(usuarios_activos),
                admins_activos=int(admins_activos),
                total_clientes=total_clientes,
                total_presupuestos=total_presupuestos,
                total_ventas=total_ventas,
            )
    finally:
        conn.close()


def _count_table_rows(cursor, table_name: str) -> int:
    cursor.execute(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = %s
        )
        """,
        (table_name,),
    )
    if not bool(cursor.fetchone()[0]):
        return 0

    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
    return int(cursor.fetchone()[0])


def _validate_backup_dump(parsed, backup_path: Path, env: dict) -> None:
    result = subprocess.run(
        [
            resolve_pg_binary("pg_restore"),
            "--list",
            str(backup_path),
        ],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        try:
            backup_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise RuntimeError(
            result.stderr.strip() or "No se pudo validar internamente el backup generado."
        )

    toc = result.stdout.lower()
    required_entries = [
        "table public usuarios",
        "table data public usuarios",
    ]
    missing_entries = [entry for entry in required_entries if entry not in toc]
    if missing_entries:
        try:
            backup_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise RuntimeError(
            "El backup generado no incluye correctamente la tabla de usuarios. "
            "Se canceló la operación para evitar un respaldo incompleto."
        )


def _write_backup_manifest(backup_path: Path, tenant_slug: str, health: BackupHealthSummary) -> None:
    manifest_path = backup_path.with_suffix(".json")
    manifest = {
        "tenant_slug": tenant_slug,
        "backup_filename": backup_path.name,
        "generated_at": datetime.now().isoformat(),
        "checks": {
            "total_usuarios": health.total_usuarios,
            "usuarios_activos": health.usuarios_activos,
            "admins_activos": health.admins_activos,
            "total_clientes": health.total_clientes,
            "total_presupuestos": health.total_presupuestos,
            "total_ventas": health.total_ventas,
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")


def _cleanup_orphan_rows(parsed, db_name: str) -> None:
    conn = psycopg2.connect(
        dbname=db_name,
        user=parsed.username or "postgres",
        password=parsed.password or "",
        host=parsed.hostname or "localhost",
        port=parsed.port or 5432,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                """
            )
            schema_columns: dict[str, set[str]] = {}
            for table_name, column_name in cursor.fetchall():
                schema_columns.setdefault(table_name, set()).add(column_name)

            changed = True
            while changed:
                changed = False
                for table in Base.metadata.sorted_tables:
                    for foreign_key in table.foreign_keys:
                        child_column = foreign_key.parent
                        parent_column = foreign_key.column
                        if child_column.table.name != table.name:
                            continue
                        child_columns = schema_columns.get(table.name)
                        parent_columns = schema_columns.get(parent_column.table.name)
                        if (
                            not child_columns
                            or not parent_columns
                            or child_column.name not in child_columns
                            or parent_column.name not in parent_columns
                        ):
                            continue

                        delete_sql = f"""
                            DELETE FROM {table.name} AS child
                            WHERE child.{child_column.name} IS NOT NULL
                              AND NOT EXISTS (
                                  SELECT 1
                                  FROM {parent_column.table.name} AS parent
                                  WHERE parent.{parent_column.name} = child.{child_column.name}
                              )
                        """
                        cursor.execute(delete_sql)
                        if cursor.rowcount > 0:
                            changed = True
    finally:
        conn.close()


def _reset_public_schema(parsed, db_name: str) -> None:
    conn = psycopg2.connect(
        dbname=db_name,
        user=parsed.username or "postgres",
        password=parsed.password or "",
        host=parsed.hostname or "localhost",
        port=parsed.port or 5432,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cursor:
            cursor.execute("DROP SCHEMA IF EXISTS public CASCADE")
            cursor.execute("CREATE SCHEMA public")
            cursor.execute("GRANT ALL ON SCHEMA public TO CURRENT_USER")
            cursor.execute("GRANT ALL ON SCHEMA public TO public")
    finally:
        conn.close()


def _terminate_database_connections(parsed, db_name: str) -> None:
    maintenance_db = "postgres"
    conn = psycopg2.connect(
        dbname=maintenance_db,
        user=parsed.username or "postgres",
        password=parsed.password or "",
        host=parsed.hostname or "localhost",
        port=parsed.port or 5432,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = %s
                  AND pid <> pg_backend_pid()
                """,
                (db_name,),
            )
    finally:
        conn.close()
