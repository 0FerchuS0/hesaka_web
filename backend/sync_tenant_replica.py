"""
Sincroniza una BD tenant principal hacia una replica PostgreSQL local.

Uso:
    python sync_tenant_replica.py --tenant demo
    python sync_tenant_replica.py --tenant demo --full-resync
"""
from __future__ import annotations

import argparse
import logging
from datetime import datetime
from typing import Iterable
from urllib.parse import urlparse

import psycopg2
from sqlalchemy import MetaData, create_engine, delete, select, text, tuple_
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.database import Base, ensure_tenant_schema
from app.models import clinica_models, models  # noqa: F401


logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
logger = logging.getLogger("sync_tenant_replica")


SYNC_TABLES = [
    {"name": "categorias", "mode": "incremental"},
    {"name": "atributos", "mode": "incremental"},
    {"name": "categoria_atributos", "mode": "replace"},
    {"name": "proveedores", "mode": "incremental"},
    {"name": "marcas", "mode": "incremental"},
    {"name": "productos", "mode": "incremental"},
    {"name": "producto_atributos", "mode": "replace"},
    {"name": "referidores", "mode": "incremental"},
    {"name": "vendedores", "mode": "incremental"},
    {"name": "canales_venta", "mode": "incremental"},
    {"name": "clientes", "mode": "incremental"},
    {"name": "bancos", "mode": "incremental"},
    {"name": "categorias_gasto", "mode": "incremental"},
    {"name": "configuracion_caja", "mode": "incremental"},
    {"name": "configuracion_empresa", "mode": "incremental"},
    {"name": "presupuesto_grupos", "mode": "incremental"},
    {"name": "presupuestos", "mode": "incremental"},
    {"name": "presupuesto_items", "mode": "incremental"},
    {"name": "ventas", "mode": "incremental"},
    {"name": "pagos", "mode": "incremental"},
    {"name": "ajustes_venta", "mode": "incremental"},
    {"name": "ajustes_venta_items", "mode": "incremental"},
    {"name": "comisiones", "mode": "incremental"},
    {"name": "movimientos_banco", "mode": "incremental"},
    {"name": "gastos_operativos", "mode": "incremental"},
    {"name": "movimientos_caja", "mode": "incremental"},
    {"name": "compras", "mode": "incremental"},
    {"name": "compra_detalles", "mode": "incremental"},
    {"name": "compra_ventas", "mode": "incremental"},
    {"name": "pagos_compras", "mode": "incremental"},
]


def ensure_database_exists(db_url: str) -> None:
    parsed = urlparse(db_url)
    db_name = parsed.path.lstrip("/")
    maintenance_db = "postgres"
    conn = psycopg2.connect(
        dbname=maintenance_db,
        user=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
            if cursor.fetchone():
                return
            raise RuntimeError(
                f"ALARMA: la base de replica local '{db_name}' no existe. "
                "Creala manualmente o corrige REPLICA_TENANT_DB_PREFIX / REPLICA_POSTGRES_HOST antes de sincronizar."
            )
    finally:
        conn.close()


def ensure_sync_state_table(engine) -> None:
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_metadata (
                table_name VARCHAR(150) PRIMARY KEY,
                last_synced_at TIMESTAMP NULL,
                last_full_sync_at TIMESTAMP NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))


def get_last_synced_at(engine, table_name: str) -> datetime | None:
    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT last_synced_at FROM sync_metadata WHERE table_name = :table_name"),
            {"table_name": table_name},
        ).mappings().first()
    return row["last_synced_at"] if row else None


def update_sync_state(engine, table_name: str, last_synced_at: datetime | None, full_sync: bool) -> None:
    with engine.begin() as connection:
        connection.execute(text("""
            INSERT INTO sync_metadata (table_name, last_synced_at, last_full_sync_at, updated_at)
            VALUES (:table_name, :last_synced_at, :last_full_sync_at, NOW())
            ON CONFLICT (table_name)
            DO UPDATE SET
                last_synced_at = EXCLUDED.last_synced_at,
                last_full_sync_at = EXCLUDED.last_full_sync_at,
                updated_at = NOW()
        """), {
            "table_name": table_name,
            "last_synced_at": last_synced_at,
            "last_full_sync_at": datetime.utcnow() if full_sync else None,
        })


def row_to_dict(row, columns: Iterable[str]) -> dict:
    return {column: row._mapping[column] for column in columns}


def upsert_rows(replica_engine, table, rows: list[dict]) -> None:
    if not rows:
        return

    pk_columns = [column.name for column in table.primary_key.columns]
    stmt = insert(table).values(rows)
    update_columns = {
        column.name: getattr(stmt.excluded, column.name)
        for column in table.columns
        if column.name not in pk_columns
    }

    stmt = stmt.on_conflict_do_update(
        index_elements=pk_columns,
        set_=update_columns,
    )
    with replica_engine.begin() as connection:
        connection.execute(stmt)


def fetch_all_rows(source_engine, table, columns: list[str]) -> list[dict]:
    with source_engine.connect() as connection:
        rows = connection.execute(select(table)).fetchall()
    return [row_to_dict(row, columns) for row in rows]


def sync_replace_table(source_engine, replica_engine, metadata: MetaData, table_name: str) -> None:
    table = metadata.tables[table_name]
    columns = [column.name for column in table.columns]
    rows = fetch_all_rows(source_engine, table, columns)

    with replica_engine.begin() as connection:
        connection.execute(delete(table))
        if rows:
            connection.execute(table.insert(), rows)

    update_sync_state(replica_engine, table_name, datetime.utcnow(), full_sync=True)
    logger.info("Tabla %s sincronizada en modo replace (%s filas).", table_name, len(rows))


def remove_missing_rows(source_engine, replica_engine, table, pk_columns: list[str]) -> None:
    if not pk_columns:
        return

    with source_engine.connect() as connection:
        source_ids = connection.execute(select(*[table.c[column] for column in pk_columns])).fetchall()
    with replica_engine.connect() as connection:
        replica_ids = connection.execute(select(*[table.c[column] for column in pk_columns])).fetchall()

    source_keys = {tuple(row) for row in source_ids}
    replica_keys = {tuple(row) for row in replica_ids}
    extra_keys = replica_keys - source_keys
    if not extra_keys:
        return

    with replica_engine.begin() as connection:
        if len(pk_columns) == 1:
            connection.execute(
                table.delete().where(table.c[pk_columns[0]].in_([key[0] for key in extra_keys]))
            )
        else:
            connection.execute(
                table.delete().where(
                    tuple_(*[table.c[column] for column in pk_columns]).in_(list(extra_keys))
                )
            )


def sync_incremental_table(
    source_engine,
    replica_engine,
    metadata: MetaData,
    table_name: str,
    full_resync: bool = False,
) -> None:
    table = metadata.tables[table_name]
    columns = [column.name for column in table.columns]
    pk_columns = [column.name for column in table.primary_key.columns]
    last_synced_at = None if full_resync else get_last_synced_at(replica_engine, table_name)

    with source_engine.connect() as connection:
        stmt = select(table)
        if last_synced_at is not None and "updated_at" in table.c:
            stmt = stmt.where(table.c.updated_at > last_synced_at)
        rows = connection.execute(stmt).fetchall()

    payload = [row_to_dict(row, columns) for row in rows]
    upsert_rows(replica_engine, table, payload)
    remove_missing_rows(source_engine, replica_engine, table, pk_columns)

    max_synced = max((row["updated_at"] for row in payload if row.get("updated_at")), default=datetime.utcnow())
    update_sync_state(replica_engine, table_name, max_synced, full_sync=full_resync or last_synced_at is None)
    logger.info("Tabla %s sincronizada en modo incremental (%s filas).", table_name, len(payload))


def build_replica_engine(tenant_slug: str):
    replica_url = settings.get_replica_db_url(tenant_slug)
    ensure_database_exists(replica_url)
    engine = create_engine(replica_url, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    ensure_tenant_schema(engine, f"{tenant_slug}__replica")
    ensure_sync_state_table(engine)
    return engine


def run_sync(tenant_slug: str, full_resync: bool) -> None:
    source_url = settings.get_tenant_db_url(tenant_slug)
    replica_url = settings.get_replica_db_url(tenant_slug)
    if source_url == replica_url:
        raise RuntimeError(
            "La BD origen y la BD replica apuntan a la misma URL. "
            "Configura REPLICA_POSTGRES_* para que la replica local sea distinta del origen."
        )

    source_engine = create_engine(source_url, pool_pre_ping=True)
    ensure_tenant_schema(source_engine, tenant_slug)
    replica_engine = build_replica_engine(tenant_slug)
    metadata = MetaData()
    metadata.reflect(bind=replica_engine, only=[table["name"] for table in SYNC_TABLES])

    for table_cfg in SYNC_TABLES:
        table_name = table_cfg["name"]
        if table_cfg["mode"] == "replace":
            sync_replace_table(source_engine, replica_engine, metadata, table_name)
        else:
            sync_incremental_table(
                source_engine,
                replica_engine,
                metadata,
                table_name,
                full_resync=full_resync,
            )

    logger.info("Sincronizacion completada para tenant '%s'.", tenant_slug)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sincroniza un tenant hacia replica local.")
    parser.add_argument("--tenant", required=True, help="Slug del tenant a sincronizar.")
    parser.add_argument(
        "--full-resync",
        action="store_true",
        help="Fuerza resincronizacion completa de tablas incrementales.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_sync(args.tenant, args.full_resync)
