"""
HESAKA Web — Punto de entrada FastAPI
Multi-tenant SaaS para ópticas
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.bootstrap import bootstrap_default_tenant
from app.config import settings
from app.database import init_admin_db
from app.middleware.tenant import TenantMiddleware

# ─── Routers ───────────────────────────────────────────────────────────────────
from app.routers.auth import router as auth_router
from app.routers.productos import router as prod_router, cat_router, attr_router, marca_router
from app.routers.clientes import router as cli_router, prov_router, ref_router
from app.routers.ventas import router as ven_router, pre_router
from app.routers.compras import router as comp_router
from app.routers.finanzas import caja_router, banco_router, gasto_router
from app.routers.comisiones import router as com_router
from app.routers.clinica import router as clin_router
from app.routers.reportes import router as rep_router

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicialización al arrancar el servidor."""
    logger.info("🚀 Iniciando HESAKA Web...")
    try:
        init_admin_db()
        logger.info("✅ Base de datos admin inicializada.")
        bootstrap_default_tenant()
        logger.info("✅ Tenant por defecto verificado.")
    except Exception as e:
        logger.error(f"❌ Error al inicializar la base de datos admin: {e}")
    yield
    logger.info("🛑 HESAKA Web detenido.")


# ─── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="HESAKA Web API",
    description="Sistema de Gestión para Ópticas — Multi-tenant SaaS",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS (permite acceso desde el frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware multi-tenant (detecta subdominio → elige BD del cliente)
app.add_middleware(TenantMiddleware)

# ─── Registrar routers ─────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(prod_router)
app.include_router(cat_router)
app.include_router(attr_router)
app.include_router(marca_router)
app.include_router(cli_router)
app.include_router(prov_router)
app.include_router(ref_router)
app.include_router(ven_router)
app.include_router(pre_router)
app.include_router(comp_router)
app.include_router(caja_router)
app.include_router(banco_router)
app.include_router(gasto_router)
app.include_router(com_router)
app.include_router(clin_router)
app.include_router(rep_router)


# ─── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Sistema"])
def health_check():
    return {"status": "ok", "sistema": "HESAKA Web", "version": "1.0.0"}


@app.get("/", tags=["Sistema"])
def root():
    return {
        "mensaje": "Bienvenido a HESAKA Web API",
        "docs": "/docs",
        "version": "1.0.0"
    }
