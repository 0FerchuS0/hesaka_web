from __future__ import annotations

import os
from datetime import datetime

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from psycopg2 import sql

from app.config import settings
from app.database import init_admin_db, init_tenant_db, get_session_for_tenant
from app.models.admin_models import Tenant
from app.models.models import Usuario
from app.utils.auth import hash_password


SOURCE_DB = os.getenv("HESAKA_SOURCE_DB", "sistema_optica")
TARGET_DB = os.getenv("HESAKA_TARGET_DB", "hesaka_demo")
TENANT_SLUG = os.getenv("HESAKA_TENANT_SLUG", "demo")
TENANT_NAME = os.getenv("HESAKA_TENANT_NAME", "Demo HESAKA")
TENANT_EMAIL = os.getenv("HESAKA_TENANT_EMAIL", "demo@hesaka.com")
TENANT_PHONE = os.getenv("HESAKA_TENANT_PHONE", "")
TENANT_PLAN = os.getenv("HESAKA_TENANT_PLAN", "FULL")

ADMIN_EMAIL = os.getenv("HESAKA_ADMIN_EMAIL", "admin@hesaka.com")
ADMIN_PASSWORD = os.getenv("HESAKA_ADMIN_PASSWORD", "admin123")
ADMIN_NAME = os.getenv("HESAKA_ADMIN_NAME", "Admin HESAKA")


def _maintenance_connection():
    conn = psycopg2.connect(
        dbname="postgres",
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    return conn


def _terminate_connections(cursor, db_name: str):
    cursor.execute(
        """
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = %s AND pid <> pg_backend_pid();
        """,
        (db_name,),
    )


def _database_exists(cursor, db_name: str) -> bool:
    cursor.execute(
        "SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s",
        (db_name,),
    )
    return cursor.fetchone() is not None


def _quote_ident(value: str):
    return sql.Identifier(value)


def refresh_demo_from_main():
    print("=" * 70)
    print("REFRESCO DE TENANT DEMO DESDE BASE PRINCIPAL")
    print("=" * 70)
    print(f"Origen : {SOURCE_DB}")
    print(f"Destino: {TARGET_DB}")
    print(f"Tenant : {TENANT_SLUG}")

    maint_conn = _maintenance_connection()
    maint_cursor = maint_conn.cursor()

    if not _database_exists(maint_cursor, SOURCE_DB):
        raise RuntimeError(f"No existe la base origen '{SOURCE_DB}'.")

    backup_db = None
    if _database_exists(maint_cursor, TARGET_DB):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_db = f"{TARGET_DB}_backup_{timestamp}"
        print(f"[1/5] Respaldando {TARGET_DB} como {backup_db}...")
        _terminate_connections(maint_cursor, TARGET_DB)
        maint_cursor.execute(
            sql.SQL("ALTER DATABASE {} RENAME TO {}").format(
                _quote_ident(TARGET_DB),
                _quote_ident(backup_db),
            )
        )
    else:
        print(f"[1/5] No existía {TARGET_DB}; se creará desde cero.")

    print(f"[2/5] Clonando {SOURCE_DB} -> {TARGET_DB}...")
    _terminate_connections(maint_cursor, SOURCE_DB)
    maint_cursor.execute(
        sql.SQL("CREATE DATABASE {} WITH TEMPLATE {}").format(
            _quote_ident(TARGET_DB),
            _quote_ident(SOURCE_DB),
        )
    )

    maint_cursor.close()
    maint_conn.close()

    print("[3/5] Asegurando base admin y registro del tenant...")
    init_admin_db()
    admin_session = None
    try:
        from app.database import get_admin_session

        admin_session = get_admin_session()
        tenant = admin_session.query(Tenant).filter(Tenant.slug == TENANT_SLUG).first()
        if not tenant:
            tenant = Tenant(
                nombre=TENANT_NAME,
                slug=TENANT_SLUG,
                email_contacto=TENANT_EMAIL,
                telefono=TENANT_PHONE,
                plan=TENANT_PLAN,
                activo=True,
                tiene_clinica=True,
            )
            admin_session.add(tenant)
        else:
            tenant.nombre = TENANT_NAME
            tenant.email_contacto = TENANT_EMAIL
            tenant.telefono = TENANT_PHONE
            tenant.plan = TENANT_PLAN
            tenant.activo = True
            tenant.tiene_clinica = True
        admin_session.commit()
    finally:
        if admin_session:
            admin_session.close()

    print("[4/5] Aplicando esquema web faltante en el tenant demo...")
    init_tenant_db(TENANT_SLUG)

    print("[5/5] Creando/actualizando usuario admin web...")
    tenant_session = get_session_for_tenant(TENANT_SLUG)
    try:
        admin_user = tenant_session.query(Usuario).filter(Usuario.email == ADMIN_EMAIL).first()
        if not admin_user:
            admin_user = Usuario(
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                nombre_completo=ADMIN_NAME,
                rol="ADMIN",
                activo=True,
            )
            tenant_session.add(admin_user)
        else:
            admin_user.hashed_password = hash_password(ADMIN_PASSWORD)
            admin_user.nombre_completo = ADMIN_NAME
            admin_user.rol = "ADMIN"
            admin_user.activo = True
        tenant_session.commit()
    finally:
        tenant_session.close()

    print("=" * 70)
    print("REFRESCO COMPLETADO")
    print("=" * 70)
    if backup_db:
        print(f"Respaldo generado: {backup_db}")
    print(f"Tenant listo : {TENANT_SLUG}")
    print(f"Usuario web  : {ADMIN_EMAIL}")
    print("Clave web    : la definida en HESAKA_ADMIN_PASSWORD o admin123")


if __name__ == "__main__":
    refresh_demo_from_main()
