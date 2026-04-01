"""HESAKA Web - Router: Autenticacion."""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_session_for_tenant
from app.middleware.tenant import get_tenant_slug
from app.models.models import Usuario
from app.schemas.schemas import (
    LoginRequest,
    TokenResponse,
    UsuarioCreate,
    UsuarioEstadoUpdate,
    UsuarioOut,
    UsuarioPasswordReset,
    UsuarioPermisosUpdate,
)
from app.utils.auth import create_access_token, get_current_user, hash_password, require_admin, verify_password

router = APIRouter(prefix="/api/auth", tags=["Autenticacion"])

PROTECTED_USER_EMAILS = {
    "admin@hesaka.com",
    "admkoeti@hesaka.com",
}


def parse_permisos(usuario: Usuario) -> list[str]:
    raw = usuario.permisos_json or "[]"
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def serialize_usuario(usuario: Usuario) -> UsuarioOut:
    return UsuarioOut(
        id=usuario.id,
        email=usuario.email,
        nombre_completo=usuario.nombre_completo,
        rol=usuario.rol,
        permisos=parse_permisos(usuario),
        activo=usuario.activo,
        creado_en=usuario.creado_en,
        ultimo_acceso=usuario.ultimo_acceso,
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, tenant_slug: str = Depends(get_tenant_slug)):
    session = get_session_for_tenant(tenant_slug)
    try:
        user = session.query(Usuario).filter(
            Usuario.email == data.email,
            Usuario.activo == True,
        ).first()

        if not user or not verify_password(data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email o contrasena incorrectos.",
            )

        user.ultimo_acceso = datetime.utcnow()
        session.commit()
        session.refresh(user)

        token = create_access_token(data={
            "sub": str(user.id),
            "tenant": tenant_slug,
            "rol": user.rol,
        })

        return TokenResponse(
            access_token=token,
            usuario_id=user.id,
            nombre_completo=user.nombre_completo,
            rol=user.rol,
            permisos=parse_permisos(user),
            tenant_slug=tenant_slug,
        )
    finally:
        session.close()


@router.post("/usuarios", response_model=UsuarioOut)
def crear_usuario(
    data: UsuarioCreate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user: Usuario = Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        existe = session.query(Usuario).filter(Usuario.email == data.email).first()
        if existe:
            raise HTTPException(status_code=400, detail="El email ya esta registrado.")

        user = Usuario(
            email=data.email,
            hashed_password=hash_password(data.password),
            nombre_completo=data.nombre_completo,
            rol=data.rol,
            permisos_json=json.dumps([]),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return serialize_usuario(user)
    finally:
        session.close()


@router.get("/usuarios", response_model=list[UsuarioOut])
def listar_usuarios(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user: Usuario = Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        usuarios = session.query(Usuario).order_by(Usuario.nombre_completo.asc(), Usuario.id.asc()).all()
        return [serialize_usuario(usuario) for usuario in usuarios]
    finally:
        session.close()


@router.put("/usuarios/{usuario_id}/password", response_model=UsuarioOut)
def resetear_password_usuario(
    usuario_id: int,
    data: UsuarioPasswordReset,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user: Usuario = Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        usuario = session.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        usuario.hashed_password = hash_password(data.password)
        session.commit()
        session.refresh(usuario)
        return serialize_usuario(usuario)
    finally:
        session.close()


@router.put("/usuarios/{usuario_id}/estado", response_model=UsuarioOut)
def actualizar_estado_usuario(
    usuario_id: int,
    data: UsuarioEstadoUpdate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user: Usuario = Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        usuario = session.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        if not data.activo and (usuario.email or "").strip().lower() in PROTECTED_USER_EMAILS:
            raise HTTPException(
                status_code=400,
                detail="Este usuario protegido no se puede desactivar.",
            )
        usuario.activo = data.activo
        session.commit()
        session.refresh(usuario)
        return serialize_usuario(usuario)
    finally:
        session.close()


@router.put("/usuarios/{usuario_id}/permisos", response_model=UsuarioOut)
def actualizar_permisos_usuario(
    usuario_id: int,
    data: UsuarioPermisosUpdate,
    tenant_slug: str = Depends(get_tenant_slug),
    current_user: Usuario = Depends(require_admin),
):
    session = get_session_for_tenant(tenant_slug)
    try:
        usuario = session.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        usuario.permisos_json = json.dumps(data.permisos or [])
        session.commit()
        session.refresh(usuario)
        return serialize_usuario(usuario)
    finally:
        session.close()


@router.get("/me", response_model=UsuarioOut)
def get_me(
    tenant_slug: str = Depends(get_tenant_slug),
    current_user: Usuario = Depends(get_current_user),
):
    return serialize_usuario(current_user)
