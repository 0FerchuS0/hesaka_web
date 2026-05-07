import asyncio
import logging
from datetime import datetime, timedelta

from app.config import settings
from app.database import get_admin_session
from app.models.admin_models import Tenant
from app.routers.reportes import ensure_dashboard_historical_cache_for_tenant, refresh_dashboard_historical_cache_for_tenant
from app.utils.timezone import resolver_tz_negocio

logger = logging.getLogger(__name__)


def _active_tenant_slugs() -> list[str]:
    session = get_admin_session()
    try:
        rows = (
            session.query(Tenant.slug)
            .filter(Tenant.activo == True)
            .order_by(Tenant.slug.asc())
            .all()
        )
        return [row[0] for row in rows if row and row[0]]
    finally:
        session.close()


def refresh_all_dashboard_caches() -> None:
    tenant_slugs = _active_tenant_slugs()
    for tenant_slug in tenant_slugs:
        try:
            refresh_dashboard_historical_cache_for_tenant(tenant_slug)
            logger.info("Dashboard cache historico actualizado para tenant '%s'.", tenant_slug)
        except Exception as exc:
            logger.exception("No se pudo actualizar dashboard cache para tenant '%s': %s", tenant_slug, exc)


def ensure_all_dashboard_caches() -> None:
    tenant_slugs = _active_tenant_slugs()
    for tenant_slug in tenant_slugs:
        try:
            ensure_dashboard_historical_cache_for_tenant(tenant_slug)
            logger.info("Dashboard cache historico verificado para tenant '%s'.", tenant_slug)
        except Exception as exc:
            logger.exception("No se pudo verificar dashboard cache para tenant '%s': %s", tenant_slug, exc)


def _seconds_until_next_refresh() -> float:
    tz = resolver_tz_negocio(settings.BUSINESS_TIMEZONE)
    now = datetime.now(tz)
    target = now.replace(hour=0, minute=0, second=1, microsecond=0)
    if now >= target:
        target = target + timedelta(days=1)
    return max(1.0, (target - now).total_seconds())


async def dashboard_cache_scheduler_loop() -> None:
    await asyncio.to_thread(ensure_all_dashboard_caches)
    while True:
        await asyncio.sleep(_seconds_until_next_refresh())
        await asyncio.to_thread(refresh_all_dashboard_caches)
