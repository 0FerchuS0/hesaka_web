import os
import logging
from urllib.parse import urlparse

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from app.config import settings
from app.database import get_admin_session, init_tenant_db
from app.models.admin_models import Tenant
from app.models.models import Usuario
from app.utils.auth import hash_password


logger = logging.getLogger(__name__)


def _maintenance_connection():
    admin_db_name = urlparse(settings.ADMIN_DATABASE_URL).path.lstrip("/") or "railway"
    for candidate_db in ("postgres", admin_db_name):
        try:
            conn = psycopg2.connect(
                dbname=candidate_db,
                user=settings.POSTGRES_USER,
                password=settings.POSTGRES_PASSWORD,
                host=settings.POSTGRES_HOST,
                port=settings.POSTGRES_PORT,
            )
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            return conn
        except Exception:
            continue
    raise RuntimeError("No se pudo abrir una conexión de mantenimiento para bootstrap.")


def _database_exists(cursor, db_name: str) -> bool:
    cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (db_name,))
    return cursor.fetchone() is not None


def bootstrap_default_tenant():
    tenant_slug = settings.DEFAULT_TENANT_SLUG
    if not tenant_slug:
        return

    tenant_db_name = f"{settings.TENANT_DB_PREFIX}{tenant_slug}"
    tenant_name = os.getenv("HESAKA_TENANT_NAME", "Demo HESAKA")
    tenant_email = os.getenv("HESAKA_TENANT_EMAIL", "demo@hesaka.com")
    tenant_phone = os.getenv("HESAKA_TENANT_PHONE", "")
    tenant_plan = os.getenv("HESAKA_TENANT_PLAN", "FULL")

    admin_email = os.getenv("HESAKA_ADMIN_EMAIL", "admin@hesaka.com")
    admin_password = os.getenv("HESAKA_ADMIN_PASSWORD", "admin123")
    admin_name = os.getenv("HESAKA_ADMIN_NAME", "Admin HESAKA")

    maintenance_conn = _maintenance_connection()
    try:
        with maintenance_conn.cursor() as cursor:
            if not _database_exists(cursor, tenant_db_name):
                cursor.execute(f'CREATE DATABASE "{tenant_db_name}"')
                logger.info("Base tenant creada automáticamente: %s", tenant_db_name)
    finally:
        maintenance_conn.close()

    admin_session = get_admin_session()
    try:
        tenant = admin_session.query(Tenant).filter(Tenant.slug == tenant_slug).first()
        if not tenant:
            tenant = Tenant(
                nombre=tenant_name,
                slug=tenant_slug,
                email_contacto=tenant_email,
                telefono=tenant_phone,
                plan=tenant_plan,
                activo=True,
                tiene_clinica=True,
            )
            admin_session.add(tenant)
        else:
            tenant.nombre = tenant_name
            tenant.email_contacto = tenant_email
            tenant.telefono = tenant_phone
            tenant.plan = tenant_plan
            tenant.activo = True
            tenant.tiene_clinica = True
        admin_session.commit()
    finally:
        admin_session.close()

    init_tenant_db(tenant_slug)

    tenant_session = None
    try:
        from app.database import get_session_for_tenant

        tenant_session = get_session_for_tenant(tenant_slug)
        admin_user = tenant_session.query(Usuario).filter(Usuario.email == admin_email).first()
        if not admin_user:
            admin_user = Usuario(
                email=admin_email,
                hashed_password=hash_password(admin_password),
                nombre_completo=admin_name,
                rol="ADMIN",
                activo=True,
            )
            tenant_session.add(admin_user)
        else:
            admin_user.hashed_password = hash_password(admin_password)
            admin_user.nombre_completo = admin_name
            admin_user.rol = "ADMIN"
            admin_user.activo = True
        tenant_session.commit()
    finally:
        if tenant_session:
            tenant_session.close()

    logger.info("Bootstrap del tenant '%s' completado.", tenant_slug)
