"""
HESAKA Web — Motor de base de datos multi-tenant
Cada cliente tiene su propia BD PostgreSQL.
El engine se crea dinámicamente según el tenant (subdominio).
"""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from functools import lru_cache
from threading import Lock
from app.config import settings
import logging

logger = logging.getLogger(__name__)

Base = declarative_base()

# Cache de engines por tenant (evita crear uno nuevo en cada request)
_engines: dict = {}
_tenant_schema_checked: set[str] = set()
_tenant_init_lock = Lock()

TIMESTAMP_FALLBACKS = {
    "categorias": None,
    "atributos": None,
    "proveedores": None,
    "marcas": None,
    "productos": None,
    "referidores": None,
    "vendedores": None,
    "canales_venta": None,
    "clientes": "fecha_registro",
    "presupuesto_grupos": "fecha_creacion",
    "presupuestos": "fecha",
    "presupuesto_items": None,
    "ventas": "fecha",
    "pagos": "fecha",
    "ajustes_venta": "fecha",
    "ajustes_venta_items": None,
    "comisiones": "fecha",
    "bancos": None,
    "movimientos_banco": "fecha",
    "compra_ventas": None,
    "compras": "fecha",
    "compra_detalles": None,
    "pagos_compras": "fecha",
    "categorias_gasto": None,
    "gastos_operativos": "fecha",
    "movimientos_caja": "fecha",
    "configuracion_caja": None,
    "configuracion_empresa": None,
    "usuarios": "creado_en",
}


def ensure_sync_timestamp_columns(engine, inspector, table_names):
    """Agrega y normaliza created_at/updated_at en tablas clave para sync incremental."""
    with engine.begin() as connection:
        for table_name, fallback_column in TIMESTAMP_FALLBACKS.items():
            if table_name not in table_names:
                continue

            columns = {column["name"] for column in inspector.get_columns(table_name)}
            if "created_at" not in columns:
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN created_at TIMESTAMP"))
            if "updated_at" not in columns:
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN updated_at TIMESTAMP"))

            timestamp_expr = "NOW()"
            if fallback_column and fallback_column in columns:
                timestamp_expr = fallback_column

            connection.execute(text(
                f"""
                UPDATE {table_name}
                SET created_at = COALESCE(created_at, {timestamp_expr}),
                    updated_at = COALESCE(updated_at, created_at, {timestamp_expr})
                WHERE created_at IS NULL OR updated_at IS NULL
                """
            ))
            connection.execute(text(
                f"CREATE INDEX IF NOT EXISTS idx_{table_name}_updated_at ON {table_name} (updated_at)"
            ))


def ensure_tenant_schema(engine, tenant_slug: str):
    """Aplica ajustes menores de esquema para tenants existentes."""
    from app.models import clinica_models, models  # noqa: F401 - registra metadata tenant

    if tenant_slug in _tenant_schema_checked:
        return

    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "usuarios" in table_names:
        usuario_columns = {column["name"] for column in inspector.get_columns("usuarios")}
        with engine.begin() as connection:
            if "permisos_json" not in usuario_columns:
                connection.execute(text("ALTER TABLE usuarios ADD COLUMN permisos_json TEXT"))
    if "productos" not in table_names:
        _tenant_schema_checked.add(tenant_slug)
        return

    tablas_catalogo_comercial = []
    if "vendedores" not in table_names:
        tablas_catalogo_comercial.append(models.Vendedor.__table__)
    if "canales_venta" not in table_names:
        tablas_catalogo_comercial.append(models.CanalVenta.__table__)
    if tablas_catalogo_comercial:
        Base.metadata.create_all(bind=engine, tables=tablas_catalogo_comercial)
        inspector = inspect(engine)
        table_names = inspector.get_table_names()

    if "presupuestos" in table_names:
        presupuesto_columns = {column["name"] for column in inspector.get_columns("presupuestos")}
        with engine.begin() as connection:
            if "vendedor_id" not in presupuesto_columns and "vendedores" in table_names:
                connection.execute(text("ALTER TABLE presupuestos ADD COLUMN vendedor_id INTEGER REFERENCES vendedores(id)"))
            if "canal_venta_id" not in presupuesto_columns and "canales_venta" in table_names:
                connection.execute(text("ALTER TABLE presupuestos ADD COLUMN canal_venta_id INTEGER REFERENCES canales_venta(id)"))

    if "ventas" in table_names:
        venta_columns = {column["name"] for column in inspector.get_columns("ventas")}
        with engine.begin() as connection:
            if "vendedor_id" not in venta_columns and "vendedores" in table_names:
                connection.execute(text("ALTER TABLE ventas ADD COLUMN vendedor_id INTEGER REFERENCES vendedores(id)"))
            if "canal_venta_id" not in venta_columns and "canales_venta" in table_names:
                connection.execute(text("ALTER TABLE ventas ADD COLUMN canal_venta_id INTEGER REFERENCES canales_venta(id)"))

    # Si el tenant aun no tiene la base del modulo clinico, crearla una sola vez.
    if "clinica_pacientes" not in table_names:
        Base.metadata.create_all(bind=engine)
        inspector = inspect(engine)
        table_names = inspector.get_table_names()
    elif "clinica_pacientes" in table_names:
        paciente_columns = {column["name"] for column in inspector.get_columns("clinica_pacientes")}
        with engine.begin() as connection:
            if "referidor_id" not in paciente_columns and "referidores" in table_names:
                connection.execute(text("ALTER TABLE clinica_pacientes ADD COLUMN referidor_id INTEGER REFERENCES referidores(id)"))
    if "clinica_cuestionarios" in table_names:
        cuestionario_columns = {column["name"] for column in inspector.get_columns("clinica_cuestionarios")}
        cuestionario_additions = {
            "horas_pantalla": "ALTER TABLE clinica_cuestionarios ADD COLUMN horas_pantalla VARCHAR(50)",
            "conduce": "ALTER TABLE clinica_cuestionarios ADD COLUMN conduce VARCHAR(50)",
            "actividad_laboral": "ALTER TABLE clinica_cuestionarios ADD COLUMN actividad_laboral VARCHAR(100)",
            "hobbies": "ALTER TABLE clinica_cuestionarios ADD COLUMN hobbies TEXT",
            "cefalea": "ALTER TABLE clinica_cuestionarios ADD COLUMN cefalea BOOLEAN DEFAULT FALSE",
            "ardor": "ALTER TABLE clinica_cuestionarios ADD COLUMN ardor BOOLEAN DEFAULT FALSE",
            "ojo_seco": "ALTER TABLE clinica_cuestionarios ADD COLUMN ojo_seco BOOLEAN DEFAULT FALSE",
            "lagrimeo": "ALTER TABLE clinica_cuestionarios ADD COLUMN lagrimeo BOOLEAN DEFAULT FALSE",
            "fotofobia": "ALTER TABLE clinica_cuestionarios ADD COLUMN fotofobia BOOLEAN DEFAULT FALSE",
            "vision_doble": "ALTER TABLE clinica_cuestionarios ADD COLUMN vision_doble BOOLEAN DEFAULT FALSE",
            "destellos": "ALTER TABLE clinica_cuestionarios ADD COLUMN destellos BOOLEAN DEFAULT FALSE",
            "manchas": "ALTER TABLE clinica_cuestionarios ADD COLUMN manchas BOOLEAN DEFAULT FALSE",
            "dificultad_cerca": "ALTER TABLE clinica_cuestionarios ADD COLUMN dificultad_cerca BOOLEAN DEFAULT FALSE",
            "diabetes": "ALTER TABLE clinica_cuestionarios ADD COLUMN diabetes BOOLEAN DEFAULT FALSE",
            "diabetes_controlada": "ALTER TABLE clinica_cuestionarios ADD COLUMN diabetes_controlada BOOLEAN DEFAULT TRUE",
            "hipertension": "ALTER TABLE clinica_cuestionarios ADD COLUMN hipertension BOOLEAN DEFAULT FALSE",
            "alergias": "ALTER TABLE clinica_cuestionarios ADD COLUMN alergias BOOLEAN DEFAULT FALSE",
            "migranas": "ALTER TABLE clinica_cuestionarios ADD COLUMN migranas BOOLEAN DEFAULT FALSE",
            "cirugias_previas": "ALTER TABLE clinica_cuestionarios ADD COLUMN cirugias_previas BOOLEAN DEFAULT FALSE",
            "trauma_ocular": "ALTER TABLE clinica_cuestionarios ADD COLUMN trauma_ocular BOOLEAN DEFAULT FALSE",
            "usa_anteojos": "ALTER TABLE clinica_cuestionarios ADD COLUMN usa_anteojos BOOLEAN DEFAULT FALSE",
            "proposito_anteojos": "ALTER TABLE clinica_cuestionarios ADD COLUMN proposito_anteojos VARCHAR(100)",
            "usa_lentes_contacto": "ALTER TABLE clinica_cuestionarios ADD COLUMN usa_lentes_contacto BOOLEAN DEFAULT FALSE",
            "tipo_lentes_contacto": "ALTER TABLE clinica_cuestionarios ADD COLUMN tipo_lentes_contacto VARCHAR(50)",
            "horas_uso_lc": "ALTER TABLE clinica_cuestionarios ADD COLUMN horas_uso_lc VARCHAR(50)",
            "molestias_lc": "ALTER TABLE clinica_cuestionarios ADD COLUMN molestias_lc BOOLEAN DEFAULT FALSE",
        }
        with engine.begin() as connection:
            for column_name, sql in cuestionario_additions.items():
                if column_name not in cuestionario_columns:
                    connection.execute(text(sql))
    if "clinica_consultas_oftalmologicas" in table_names:
        oft_column_info = {column["name"]: column for column in inspector.get_columns("clinica_consultas_oftalmologicas")}
        oft_columns = set(oft_column_info.keys())
        oft_additions = {
            "av_sc_lejos_od": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN av_sc_lejos_od VARCHAR(50)",
            "av_sc_lejos_oi": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN av_sc_lejos_oi VARCHAR(50)",
            "examen_refraccion": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_refraccion BOOLEAN DEFAULT TRUE",
            "examen_biomicroscopia": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_biomicroscopia BOOLEAN DEFAULT FALSE",
            "examen_oftalmoscopia": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_oftalmoscopia BOOLEAN DEFAULT FALSE",
            "examen_tonometria": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_tonometria BOOLEAN DEFAULT FALSE",
            "examen_campo_visual": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_campo_visual BOOLEAN DEFAULT FALSE",
            "examen_oct": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_oct BOOLEAN DEFAULT FALSE",
            "examen_retinografia": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_retinografia BOOLEAN DEFAULT FALSE",
            "examen_paquimetria": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_paquimetria BOOLEAN DEFAULT FALSE",
            "examen_topografia": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_topografia BOOLEAN DEFAULT FALSE",
            "examen_gonioscopia": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_gonioscopia BOOLEAN DEFAULT FALSE",
            "examen_angiofluoresceinografia": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_angiofluoresceinografia BOOLEAN DEFAULT FALSE",
            "examen_cicloplegia": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN examen_cicloplegia BOOLEAN DEFAULT FALSE",
            "biomicroscopia_parpados": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN biomicroscopia_parpados TEXT",
            "biomicroscopia_conjuntiva": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN biomicroscopia_conjuntiva TEXT",
            "biomicroscopia_cornea": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN biomicroscopia_cornea TEXT",
            "biomicroscopia_camara_anterior": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN biomicroscopia_camara_anterior TEXT",
            "biomicroscopia_iris": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN biomicroscopia_iris TEXT",
            "biomicroscopia_cristalino": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN biomicroscopia_cristalino TEXT",
            "tonometria_od": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN tonometria_od VARCHAR(50)",
            "tonometria_oi": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN tonometria_oi VARCHAR(50)",
            "tonometria_metodo": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN tonometria_metodo VARCHAR(100)",
            "campo_visual_tipo": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN campo_visual_tipo VARCHAR(100)",
            "campo_visual_od": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN campo_visual_od TEXT",
            "campo_visual_oi": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN campo_visual_oi TEXT",
            "oct_tipo": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN oct_tipo VARCHAR(100)",
            "oct_hallazgos": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN oct_hallazgos TEXT",
            "retinografia_hallazgos": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN retinografia_hallazgos TEXT",
            "paquimetria_od": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN paquimetria_od VARCHAR(50)",
            "paquimetria_oi": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN paquimetria_oi VARCHAR(50)",
            "topografia_tipo": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN topografia_tipo VARCHAR(100)",
            "topografia_hallazgos": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN topografia_hallazgos TEXT",
            "gonioscopia_od": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN gonioscopia_od VARCHAR(50)",
            "gonioscopia_oi": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN gonioscopia_oi VARCHAR(50)",
            "gonioscopia_hallazgos": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN gonioscopia_hallazgos TEXT",
            "angiofluoresceinografia_hallazgos": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN angiofluoresceinografia_hallazgos TEXT",
            "cicloplegia_medicamento": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN cicloplegia_medicamento VARCHAR(100)",
            "cicloplegia_dosis": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN cicloplegia_dosis VARCHAR(100)",
            "cicloplegia_od_esfera": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN cicloplegia_od_esfera VARCHAR(50)",
            "cicloplegia_od_cilindro": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN cicloplegia_od_cilindro VARCHAR(50)",
            "cicloplegia_od_eje": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN cicloplegia_od_eje VARCHAR(50)",
            "cicloplegia_oi_esfera": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN cicloplegia_oi_esfera VARCHAR(50)",
            "cicloplegia_oi_cilindro": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN cicloplegia_oi_cilindro VARCHAR(50)",
            "cicloplegia_oi_eje": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN cicloplegia_oi_eje VARCHAR(50)",
            "estudios_solicitados": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN estudios_solicitados TEXT",
            "observaciones": "ALTER TABLE clinica_consultas_oftalmologicas ADD COLUMN observaciones TEXT",
        }
        with engine.begin() as connection:
            for column_name, sql in oft_additions.items():
                if column_name not in oft_columns:
                    connection.execute(text(sql))
            for boolean_column in [
                "examen_refraccion",
                "examen_biomicroscopia",
                "examen_oftalmoscopia",
                "examen_tonometria",
                "examen_campo_visual",
                "examen_oct",
                "examen_retinografia",
                "examen_paquimetria",
                "examen_topografia",
                "examen_gonioscopia",
                "examen_angiofluoresceinografia",
                "examen_cicloplegia",
            ]:
                column = oft_column_info.get(boolean_column)
                if not column:
                    continue
                column_type = str(column["type"]).upper()
                if "BOOLEAN" not in column_type:
                    connection.execute(text(
                        f"""
                        ALTER TABLE clinica_consultas_oftalmologicas
                        ALTER COLUMN {boolean_column}
                        TYPE BOOLEAN
                        USING CASE
                            WHEN {boolean_column} IS NULL THEN NULL
                            WHEN {boolean_column}::integer = 0 THEN FALSE
                            ELSE TRUE
                        END
                        """
                    ))

    if "clinica_receta_medicamentos" in table_names:
        receta_med_columns = {column["name"] for column in inspector.get_columns("clinica_receta_medicamentos")}
        with engine.begin() as connection:
            if "consulta_tipo" not in receta_med_columns:
                connection.execute(text("ALTER TABLE clinica_receta_medicamentos ADD COLUMN consulta_tipo VARCHAR(30)"))

    column_names = {column["name"] for column in inspector.get_columns("productos")}

    index_names = {index["name"] for index in inspector.get_indexes("productos")}

    with engine.begin() as connection:
        if "marcas" not in table_names:
            connection.execute(text("""
                DO $$
                BEGIN
                    IF to_regclass('public.marcas') IS NULL THEN
                        IF to_regclass('public.marcas_id_seq') IS NOT NULL THEN
                            DROP SEQUENCE public.marcas_id_seq;
                        END IF;

                        CREATE TABLE public.marcas (
                            id SERIAL PRIMARY KEY,
                            nombre VARCHAR(100) NOT NULL UNIQUE
                        );
                    END IF;
                END
                $$;
            """))
        if "marca" not in column_names:
            connection.execute(text("ALTER TABLE productos ADD COLUMN marca VARCHAR(100)"))
        if "marca_id" not in column_names:
            connection.execute(text("ALTER TABLE productos ADD COLUMN marca_id INTEGER REFERENCES marcas(id)"))

        connection.execute(text("""
            INSERT INTO marcas (nombre)
            SELECT DISTINCT UPPER(TRIM(marca))
            FROM productos
            WHERE marca IS NOT NULL AND TRIM(marca) <> ''
            ON CONFLICT (nombre) DO NOTHING
        """))
        connection.execute(text("""
            UPDATE productos
            SET marca_id = marcas.id,
                marca = marcas.nombre
            FROM marcas
            WHERE productos.marca IS NOT NULL
              AND TRIM(productos.marca) <> ''
              AND UPPER(TRIM(productos.marca)) = marcas.nombre
              AND (productos.marca_id IS NULL OR productos.marca <> marcas.nombre)
        """))

        if "idx_producto_marca" not in index_names:
            connection.execute(text("CREATE INDEX idx_producto_marca ON productos (marca)"))
        if "idx_producto_marca_id" not in index_names:
            connection.execute(text("CREATE INDEX idx_producto_marca_id ON productos (marca_id)"))

        if "presupuestos" in table_names:
            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_presupuesto_estado_fecha ON presupuestos (estado, fecha)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_presupuesto_cliente_fecha ON presupuestos (cliente_id, fecha)"))

        if "ventas" in table_names:
            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_venta_fecha_estado ON ventas (fecha, estado)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_venta_cliente_fecha ON ventas (cliente_id, fecha)"))

        if "pagos" in table_names:
            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_pago_venta_fecha ON pagos (venta_id, fecha)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_pago_grupo_fecha ON pagos (grupo_pago_id, fecha)"))

        if "movimientos_banco" in table_names:
            connection.execute(text("CREATE INDEX IF NOT EXISTS idx_mov_banco_banco_fecha ON movimientos_banco (banco_id, fecha)"))

    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    ensure_sync_timestamp_columns(engine, inspector, table_names)

    _tenant_schema_checked.add(tenant_slug)


def get_engine_for_tenant(tenant_slug: str):
    """
    Devuelve (o crea) un engine SQLAlchemy para el tenant dado.
    tenant_slug corresponde al subdominio: 'optica-sol' → DB: hesaka_optica-sol
    """
    if tenant_slug not in _engines:
        with _tenant_init_lock:
            if tenant_slug not in _engines:
                db_url = settings.get_tenant_db_url(tenant_slug)
                logger.info(f"Creating engine for tenant: {tenant_slug}")
                engine = create_engine(
                    db_url,
                    pool_size=5,
                    max_overflow=10,
                    pool_pre_ping=True,
                    pool_recycle=1800,
                )
                _engines[tenant_slug] = engine

    with _tenant_init_lock:
        ensure_tenant_schema(_engines[tenant_slug], tenant_slug)
    return _engines[tenant_slug]


def get_session_for_tenant(tenant_slug: str):
    """Crea y devuelve una sesión SQLAlchemy para el tenant dado."""
    engine = get_engine_for_tenant(tenant_slug)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


def dispose_tenant_engine(tenant_slug: str):
    engine = _engines.get(tenant_slug)
    if engine is not None:
        engine.dispose()
    _tenant_schema_checked.discard(tenant_slug)


def init_tenant_db(tenant_slug: str):
    """
    Crea las tablas en la BD del tenant si no existen.
    Llamado cuando se da de alta un nuevo cliente.
    """
    from app.models import admin_models  # noqa - triggers model registration
    engine = get_engine_for_tenant(tenant_slug)
    Base.metadata.create_all(bind=engine)
    logger.info(f"Database initialized for tenant: {tenant_slug}")


# ─── Admin DB (gestión de tenants/clientes) ───────────────────────────────────

_admin_engine = None
_AdminSession = None


def get_admin_engine():
    global _admin_engine
    if _admin_engine is None:
        _admin_engine = create_engine(
            settings.ADMIN_DATABASE_URL,
            pool_pre_ping=True,
        )
    return _admin_engine


def get_admin_session():
    global _AdminSession
    if _AdminSession is None:
        _AdminSession = sessionmaker(
            autocommit=False, autoflush=False, bind=get_admin_engine()
        )
    return _AdminSession()


def init_admin_db():
    """Crea tablas administrativas (tenants, suscripciones)."""
    from app.models import admin_models  # noqa
    get_admin_engine()
    admin_models.AdminBase.metadata.create_all(bind=get_admin_engine())
    logger.info("Admin database initialized.")
