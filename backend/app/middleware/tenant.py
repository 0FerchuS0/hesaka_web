"""
HESAKA Web — Middleware Multi-tenant
Detecta el tenant (cliente) a partir del subdominio de la petición
y lo inyecta en el estado del request para que los routers lo usen.

Ejemplo: optica-sol.hesaka.com → tenant_slug = "optica_sol"
"""
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import settings
from app.database import get_admin_session
from app.models.admin_models import Tenant
import logging

logger = logging.getLogger(__name__)

# Subdominios que no corresponden a tenants de clientes
RESERVED_SLUGS = {"www", "api", "admin", "static", "localhost"}


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Extrae el tenant del subdominio y lo adjunta al request.state.
    En desarrollo (localhost), usa el header X-Tenant-Slug para simular subdominios.
    """

    async def dispatch(self, request: Request, call_next):
        host = request.headers.get("host", "localhost")
        tenant_slug = self._extract_slug(host)

        # En desarrollo, permitir override por header
        tenant_slug = request.headers.get("X-Tenant-Slug", tenant_slug)

        # Fallback util para el primer deploy online sin subdominios
        if not tenant_slug and settings.DEFAULT_TENANT_SLUG:
            tenant_slug = settings.DEFAULT_TENANT_SLUG

        if tenant_slug and tenant_slug not in RESERVED_SLUGS:
            # Verificar que el tenant existe y está activo
            tenant = self._get_tenant(tenant_slug)
            if not tenant:
                return self._error_response(f"Tenant '{tenant_slug}' no encontrado.", 404)
            if not tenant.activo:
                return self._error_response(f"La suscripción del cliente '{tenant_slug}' está inactiva.", 403)

            request.state.tenant_slug = tenant_slug
            request.state.tenant = tenant
        else:
            # Rutas sin tenant (admin panel, health check, etc.)
            request.state.tenant_slug = None
            request.state.tenant = None

        response = await call_next(request)
        return response

    def _extract_slug(self, host: str) -> str | None:
        """Extrae el subdominio del host. 'optica-sol.hesaka.com' → 'optica_sol'"""
        host = host.split(":")[0]  # Quitar puerto si existe
        parts = host.split(".")
        if len(parts) >= 3:
            raw = parts[0]
            return raw.replace("-", "_")
        return None

    def _get_tenant(self, slug: str) -> Tenant | None:
        """Busca el tenant en la BD admin."""
        session = get_admin_session()
        try:
            return session.query(Tenant).filter(
                Tenant.slug == slug,
            ).first()
        except Exception as e:
            logger.error(f"Error buscando tenant '{slug}': {e}")
            return None
        finally:
            session.close()

    def _error_response(self, detail: str, status_code: int):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=status_code,
            content={"detail": detail}
        )


def get_tenant_slug(request: Request) -> str:
    """
    Dependency para obtener el tenant_slug en los routers.
    Lanza 400 si el request no tiene un tenant asociado.
    """
    slug = getattr(request.state, "tenant_slug", None)
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo identificar el tenant. Revisa el subdominio o configura DEFAULT_TENANT_SLUG."
        )
    return slug
