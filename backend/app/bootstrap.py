import os
import logging
from urllib.parse import urlparse

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_admin_session, get_session_for_tenant, init_tenant_db
from app.models.admin_models import Tenant
from app.models.models import Atributo, Categoria, CategoriaGasto, ConfiguracionEmpresa, Producto, Usuario
from app.utils.auth import hash_password


logger = logging.getLogger(__name__)


PROTECTED_HESAKA_ADMIN = {
    "email": "admin@hesaka.com",
    "password": "admin123",
    "name": "Administrador HESAKA",
}


def _seed_categoria(
    session: Session,
    nombre: str,
    prefijo: str,
    descripcion: str | None = None,
    categoria_padre=None,
) -> Categoria:
    categoria = session.query(Categoria).filter(Categoria.nombre == nombre).first()
    if not categoria:
        categoria = Categoria(
            nombre=nombre,
            prefijo=prefijo,
            descripcion=descripcion,
            categoria_padre=categoria_padre,
        )
        session.add(categoria)
        session.flush()
        return categoria

    categoria.prefijo = categoria.prefijo or prefijo
    if descripcion and not categoria.descripcion:
        categoria.descripcion = descripcion
    if categoria_padre and not categoria.categoria_padre_id:
        categoria.categoria_padre = categoria_padre
    session.flush()
    return categoria


def _seed_categoria_gasto(
    session: Session,
    nombre: str,
    descripcion: str | None = None,
    categoria_padre=None,
) -> CategoriaGasto:
    categoria = session.query(CategoriaGasto).filter(CategoriaGasto.nombre == nombre).first()
    if not categoria:
        categoria = CategoriaGasto(
            nombre=nombre,
            descripcion=descripcion,
            categoria_padre=categoria_padre,
        )
        session.add(categoria)
        session.flush()
        return categoria

    if descripcion and not categoria.descripcion:
        categoria.descripcion = descripcion
    if categoria_padre and not categoria.categoria_padre_id:
        categoria.categoria_padre = categoria_padre
    session.flush()
    return categoria


def _seed_default_catalogs(tenant_slug: str, tenant_name: str, tenant_email: str, tenant_phone: str) -> None:
    tenant_session = None
    try:
        tenant_session = get_session_for_tenant(tenant_slug)

        config = tenant_session.query(ConfiguracionEmpresa).first()
        if not config:
            config = ConfiguracionEmpresa(
                id=1,
                nombre=tenant_name,
                email=tenant_email,
                telefono=tenant_phone or None,
                business_timezone=(settings.BUSINESS_TIMEZONE or "America/Asuncion"),
            )
            tenant_session.add(config)
        else:
            if not (config.nombre or "").strip():
                config.nombre = tenant_name
            if tenant_email and not config.email:
                config.email = tenant_email
            if tenant_phone and not config.telefono:
                config.telefono = tenant_phone
            if not (config.business_timezone or "").strip():
                config.business_timezone = (settings.BUSINESS_TIMEZONE or "America/Asuncion")

        atributo_uso = tenant_session.query(Atributo).filter(Atributo.nombre == "Uso").first()
        if not atributo_uso:
            atributo_uso = Atributo(nombre="Uso")
            tenant_session.add(atributo_uso)
            tenant_session.flush()

        armazones = _seed_categoria(tenant_session, "Armazones", "ARM", "Armazones y monturas opticas")
        cristales = _seed_categoria(tenant_session, "Cristales", "CRI", "Cristales oftalmicos y tratamientos")
        lentes_contacto = _seed_categoria(tenant_session, "Lentes de contacto", "LCO", "Lentes de contacto y soluciones")
        accesorios = _seed_categoria(tenant_session, "Accesorios", "ACC", "Accesorios opticos y de limpieza")
        servicios = _seed_categoria(tenant_session, "Servicios y varios", "SER", "Servicios, repuestos y ventas comodin")

        _seed_categoria(tenant_session, "Recetados", "ARMR", categoria_padre=armazones)
        _seed_categoria(tenant_session, "De sol", "ARMS", categoria_padre=armazones)
        _seed_categoria(tenant_session, "Monofocales", "CRIM", categoria_padre=cristales)
        _seed_categoria(tenant_session, "Bifocales", "CRIB", categoria_padre=cristales)
        _seed_categoria(tenant_session, "Multifocales / progresivos", "CRIP", categoria_padre=cristales)
        _seed_categoria(tenant_session, "Blandos", "LCOB", categoria_padre=lentes_contacto)
        _seed_categoria(tenant_session, "Rigidos", "LCOR", categoria_padre=lentes_contacto)
        _seed_categoria(tenant_session, "Soluciones", "LCOS", categoria_padre=lentes_contacto)
        _seed_categoria(tenant_session, "Limpieza", "ACCL", categoria_padre=accesorios)
        _seed_categoria(tenant_session, "Estuches y extras", "ACCE", categoria_padre=accesorios)
        categoria_varios = _seed_categoria(tenant_session, "Varios", "VAR", categoria_padre=servicios)

        if atributo_uso not in categoria_varios.atributos_disponibles:
            categoria_varios.atributos_disponibles.append(atributo_uso)

        producto_varios = tenant_session.query(Producto).filter(Producto.codigo == "VAR00001").first()
        if not producto_varios:
            producto_varios = Producto(
                codigo="VAR00001",
                nombre="VARIOS",
                categoria_rel=categoria_varios,
                precio_venta=0.0,
                costo=0.0,
                costo_variable=True,
                stock_actual=0,
                impuesto=10,
                descripcion="Producto comodin para ventas personalizadas o conceptos varios.",
                activo=True,
                bajo_pedido=False,
            )
            tenant_session.add(producto_varios)
            tenant_session.flush()
        else:
            producto_varios.nombre = "VARIOS"
            producto_varios.categoria_rel = categoria_varios
            producto_varios.costo_variable = True
            if producto_varios.costo is None:
                producto_varios.costo = 0.0
            producto_varios.precio_venta = producto_varios.precio_venta or 0.0
            producto_varios.activo = True

        if atributo_uso not in producto_varios.atributos:
            producto_varios.atributos.append(atributo_uso)

        gastos_operativos = _seed_categoria_gasto(tenant_session, "Gastos operativos", "Gastos generales de la optica")
        _seed_categoria_gasto(tenant_session, "Alquiler", categoria_padre=gastos_operativos)
        _seed_categoria_gasto(tenant_session, "Sueldos", categoria_padre=gastos_operativos)
        _seed_categoria_gasto(tenant_session, "Servicios basicos", categoria_padre=gastos_operativos)
        _seed_categoria_gasto(tenant_session, "Internet y telefonia", categoria_padre=gastos_operativos)
        _seed_categoria_gasto(tenant_session, "Impuestos", categoria_padre=gastos_operativos)
        _seed_categoria_gasto(tenant_session, "Marketing", categoria_padre=gastos_operativos)
        _seed_categoria_gasto(tenant_session, "Insumos", categoria_padre=gastos_operativos)
        _seed_categoria_gasto(tenant_session, "Mantenimiento", categoria_padre=gastos_operativos)
        _seed_categoria_gasto(tenant_session, "Movilidad", categoria_padre=gastos_operativos)

        tenant_session.commit()
    finally:
        if tenant_session:
            tenant_session.close()


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


def ensure_tenant_admin_users(tenant_slug: str) -> None:
    tenant_admin = {
        "email": os.getenv("HESAKA_ADMIN_EMAIL", "admin@hesaka.com"),
        "password": os.getenv("HESAKA_ADMIN_PASSWORD", "admin123"),
        "name": os.getenv("HESAKA_ADMIN_NAME", "Administrador del cliente"),
    }
    protected_admins: list[dict[str, str]] = [PROTECTED_HESAKA_ADMIN]
    if tenant_admin["email"].strip().lower() != PROTECTED_HESAKA_ADMIN["email"]:
        protected_admins.append(tenant_admin)

    tenant_session = None
    try:
        tenant_session = get_session_for_tenant(tenant_slug)
        for admin_data in protected_admins:
            admin_email = admin_data["email"].strip().lower()
            admin_user = tenant_session.query(Usuario).filter(Usuario.email == admin_email).first()

            if not admin_user:
                admin_user = Usuario(
                    email=admin_email,
                    hashed_password=hash_password(admin_data["password"]),
                    nombre_completo=admin_data["name"],
                    rol="ADMIN",
                    activo=True,
                )
                tenant_session.add(admin_user)
                continue

            admin_user.nombre_completo = admin_data["name"]
            admin_user.rol = "ADMIN"
            admin_user.activo = True
            admin_user.hashed_password = hash_password(admin_data["password"])

        tenant_session.commit()
    finally:
        if tenant_session:
            tenant_session.close()


def bootstrap_default_tenant():
    tenant_slug = settings.DEFAULT_TENANT_SLUG
    if not tenant_slug:
        return

    tenant_db_name = f"{settings.TENANT_DB_PREFIX}{tenant_slug}"
    tenant_name = os.getenv("HESAKA_TENANT_NAME", "Demo HESAKA")
    tenant_email = os.getenv("HESAKA_TENANT_EMAIL", "demo@hesaka.com")
    tenant_phone = os.getenv("HESAKA_TENANT_PHONE", "")
    tenant_plan = os.getenv("HESAKA_TENANT_PLAN", "FULL")

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
    ensure_tenant_admin_users(tenant_slug)
    _seed_default_catalogs(tenant_slug, tenant_name, tenant_email, tenant_phone)

    logger.info("Bootstrap del tenant '%s' completado.", tenant_slug)
