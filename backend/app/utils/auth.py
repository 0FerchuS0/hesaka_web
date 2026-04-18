"""
HESAKA Web - Sistema de autenticacion JWT.
Maneja login, generacion de tokens y verificacion de usuarios.
"""
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.config import settings
from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
from app.models.models import Usuario

# Token extractor - busca Bearer token en el header Authorization
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

MODULE_ROLES = {
    "dashboard": ["ADMIN", "OPERADOR", "CAJERO", "DOCTOR"],
    "usuarios": ["ADMIN"],
    "presupuestos": ["ADMIN", "OPERADOR", "CAJERO"],
    "ventas": ["ADMIN", "OPERADOR", "CAJERO"],
    "cobros": ["ADMIN", "CAJERO"],
    "compras": ["ADMIN", "OPERADOR", "CAJERO"],
    "catalogos": ["ADMIN", "OPERADOR", "CAJERO"],
    "finanzas": ["ADMIN", "CAJERO"],
    "cuentas_por_pagar": ["ADMIN", "CAJERO"],
    "reportes_comercial": ["ADMIN", "OPERADOR", "CAJERO"],
    "reportes_financieros": ["ADMIN", "CAJERO"],
    "clinica": ["ADMIN", "DOCTOR"],
}

ACTION_ROLES = {
    "usuarios.crear": ["ADMIN"],
    "usuarios.password": ["ADMIN"],
    "usuarios.permisos": ["ADMIN"],
    "usuarios.estado": ["ADMIN"],
    "presupuestos.crear": ["ADMIN", "OPERADOR", "CAJERO"],
    "presupuestos.editar": ["ADMIN", "OPERADOR", "CAJERO"],
    "presupuestos.eliminar": ["ADMIN", "OPERADOR"],
    "presupuestos.convertir": ["ADMIN", "OPERADOR", "CAJERO"],
    "presupuestos.exportar": ["ADMIN", "OPERADOR", "CAJERO"],
    "ventas.cobrar": ["ADMIN", "CAJERO"],
    "ventas.revertir": ["ADMIN", "CAJERO"],
    "ventas.anular": ["ADMIN"],
    "ventas.ajustar": ["ADMIN", "CAJERO"],
    "ventas.exportar": ["ADMIN", "OPERADOR", "CAJERO"],
    "ventas.entrega": ["ADMIN", "OPERADOR", "CAJERO"],
    "compras.crear": ["ADMIN", "OPERADOR", "CAJERO"],
    "compras.editar": ["ADMIN", "OPERADOR", "CAJERO"],
    "compras.pagar": ["ADMIN", "CAJERO"],
    "compras.anular": ["ADMIN"],
    "compras.exportar": ["ADMIN", "OPERADOR", "CAJERO"],
    "compras.entrega": ["ADMIN", "OPERADOR", "CAJERO"],
    "finanzas.transferencias": ["ADMIN", "CAJERO"],
    "finanzas.conciliar": ["ADMIN", "CAJERO"],
    "finanzas.editar_cuentas": ["ADMIN", "CAJERO"],
    "finanzas.jornada_abrir": ["ADMIN", "CAJERO"],
    "finanzas.jornada_corte": ["ADMIN", "CAJERO"],
    "finanzas.jornada_rendir": ["ADMIN", "CAJERO"],
    "finanzas.jornada_rendicion_editar": ["ADMIN", "CAJERO"],
    "cuentas_por_pagar.pagar": ["ADMIN", "CAJERO"],
    "cuentas_por_pagar.editar": ["ADMIN", "CAJERO"],
    "cuentas_por_pagar.revertir": ["ADMIN", "CAJERO"],
    "cuentas_por_pagar.exportar": ["ADMIN", "CAJERO"],
    "reportes_comercial.exportar": ["ADMIN", "OPERADOR", "CAJERO"],
    "reportes_financieros.exportar": ["ADMIN", "CAJERO"],
    "clinica.dashboard": ["ADMIN", "DOCTOR"],
    "clinica.pacientes": ["ADMIN", "DOCTOR"],
    "clinica.pacientes_crear": ["ADMIN", "DOCTOR"],
    "clinica.pacientes_editar": ["ADMIN", "DOCTOR"],
    "clinica.consultas_ver": ["ADMIN", "DOCTOR"],
    "clinica.consultas_crear": ["ADMIN", "DOCTOR"],
    "clinica.consultas_editar": ["ADMIN", "DOCTOR"],
    "clinica.consultas_exportar": ["ADMIN", "DOCTOR"],
    "clinica.doctores": ["ADMIN", "DOCTOR"],
    "clinica.doctores_editar": ["ADMIN", "DOCTOR"],
    "clinica.lugares": ["ADMIN", "DOCTOR"],
    "clinica.vademecum": ["ADMIN", "DOCTOR"],
    "clinica.recetas_exportar": ["ADMIN", "DOCTOR"],
    "clinica.historial": ["ADMIN", "DOCTOR"],
    "clinica.convertir_cliente": ["ADMIN", "DOCTOR"],
}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Genera un JWT con los datos dados y tiempo de expiracion."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """Decodifica y valida un JWT. Lanza HTTPException si es invalido."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def normalize_role(role: Optional[str]) -> str:
    raw_role = (role or "").upper()
    aliases = {
        "USUARIO": "OPERADOR",
        "CLINICA": "DOCTOR",
    }
    return aliases.get(raw_role, raw_role)


def parse_permissions(user: Optional[Usuario]) -> list[str]:
    if not user or not getattr(user, "permisos_json", None):
        return []
    try:
        import json
        parsed = json.loads(user.permisos_json or "[]")
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def default_permissions_for_role(role: Optional[str]) -> list[str]:
    current_role = normalize_role(role)
    return [key for key, roles in MODULE_ROLES.items() if current_role in {normalize_role(item) for item in roles}]


def default_action_permissions_for_role(role: Optional[str]) -> list[str]:
    current_role = normalize_role(role)
    return [key for key, roles in ACTION_ROLES.items() if current_role in {normalize_role(item) for item in roles}]


def has_module_access(user: Optional[Usuario], module_key: str) -> bool:
    if not user:
        return False
    if normalize_role(user.rol) == "ADMIN":
        return True
    explicit = [item for item in parse_permissions(user) if "." not in item]
    if explicit:
        return module_key in explicit
    return module_key in default_permissions_for_role(user.rol)


def has_action_access(user: Optional[Usuario], action_key: str, fallback_module_key: Optional[str] = None) -> bool:
    if not user:
        return False
    if normalize_role(user.rol) == "ADMIN":
        return True
    if fallback_module_key and not has_module_access(user, fallback_module_key):
        return False

    explicit = parse_permissions(user)
    explicit_actions = [item for item in explicit if "." in item]

    if explicit_actions:
        return action_key in explicit_actions
    if explicit and fallback_module_key:
        return fallback_module_key in explicit
    return action_key in default_action_permissions_for_role(user.rol)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    tenant_slug: str = Depends(get_tenant_slug),
) -> Usuario:
    """
    Dependency que extrae el usuario actual del JWT.
    Verifica que el usuario existe y esta activo en el tenant correcto.
    """
    payload = decode_token(token)
    user_id: int = payload.get("sub")
    token_tenant: str = payload.get("tenant")

    if not user_id or token_tenant != tenant_slug:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token no valido para este tenant.",
        )

    session = get_session_for_tenant(tenant_slug)
    try:
        user = session.query(Usuario).filter(Usuario.id == int(user_id)).first()
    finally:
        session.close()

    if not user or not user.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o no encontrado.",
        )
    return user


def require_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """Dependency que exige rol ADMIN."""
    if normalize_role(current_user.rol) != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren permisos de administrador.",
        )
    return current_user


def require_roles(*allowed_roles: str):
    normalized_allowed = {normalize_role(role) for role in allowed_roles}

    def _require_roles(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        current_role = normalize_role(current_user.rol)
        if current_role not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permisos para acceder a este modulo.",
            )
        return current_user

    return _require_roles


def require_action(action_key: str, fallback_module_key: Optional[str] = None):
    def _require_action(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        if not has_action_access(current_user, action_key, fallback_module_key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permisos para realizar esta accion.",
            )
        return current_user

    return _require_action


def require_clinica(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """Dependency que exige rol DOCTOR o ADMIN."""
    if normalize_role(current_user.rol) not in ("ADMIN", "DOCTOR"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren permisos del modulo clinico.",
        )
    return current_user
