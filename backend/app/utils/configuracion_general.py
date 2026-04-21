from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import CanalVenta, ConfiguracionEmpresa


def obtener_o_crear_configuracion_empresa(session: Session) -> ConfiguracionEmpresa:
    config = session.query(ConfiguracionEmpresa).first()
    if not config:
        config = ConfiguracionEmpresa(
            nombre="",
            ruc=None,
            direccion=None,
            telefono=None,
            email=None,
            logo_path=None,
            business_timezone=(settings.BUSINESS_TIMEZONE or "America/Asuncion"),
        )
        session.add(config)
        session.flush()
    elif not (config.business_timezone or "").strip():
        config.business_timezone = (settings.BUSINESS_TIMEZONE or "America/Asuncion")
        session.flush()
    return config


def configuracion_general_completa(config: Optional[ConfiguracionEmpresa]) -> bool:
    return bool(config and (config.nombre or "").strip())


def sincronizar_canal_principal(session: Session, config: ConfiguracionEmpresa, nombre_anterior: Optional[str] = None) -> Optional[CanalVenta]:
    nombre_actual = (config.nombre or "").strip()
    if not nombre_actual:
        return None

    canal = None
    if nombre_anterior and nombre_anterior.strip():
        canal = (
            session.query(CanalVenta)
            .filter(CanalVenta.nombre.ilike(nombre_anterior.strip()))
            .first()
        )

    if not canal:
        canal = (
            session.query(CanalVenta)
            .filter(CanalVenta.nombre.ilike(nombre_actual))
            .first()
        )

    if not canal:
        canal = CanalVenta(
            nombre=nombre_actual,
            descripcion="Canal principal generado desde la configuracion general",
            activo=True,
        )
        session.add(canal)
        session.flush()
        return canal

    canal.nombre = nombre_actual
    if not canal.descripcion:
        canal.descripcion = "Canal principal generado desde la configuracion general"
    canal.activo = True
    session.flush()
    return canal


def obtener_canal_principal(session: Session) -> Optional[CanalVenta]:
    config = session.query(ConfiguracionEmpresa).first()
    if config and (config.nombre or "").strip():
        canal = (
            session.query(CanalVenta)
            .filter(CanalVenta.nombre.ilike(config.nombre.strip()))
            .first()
        )
        if canal:
            return canal

    return (
        session.query(CanalVenta)
        .filter(CanalVenta.activo == True)
        .order_by(CanalVenta.id.asc())
        .first()
    )
