import re
from datetime import date, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import text

from app.config import settings


def _timezone_por_offset(total_minutos: int) -> timezone:
    sign = "+" if total_minutos >= 0 else "-"
    abs_min = abs(total_minutos)
    hh = abs_min // 60
    mm = abs_min % 60
    return timezone(timedelta(minutes=total_minutos), name=f"UTC{sign}{hh:02d}:{mm:02d}")


def _timezone_fallback_fijo(tz_name: str | None) -> tzinfo | None:
    normalized = (tz_name or "").strip()
    lower = normalized.lower()
    if lower in {"utc", "etc/utc", "gmt", "etc/gmt", "z"}:
        return timezone.utc
    if lower in {"america/asuncion", "asuncion", "paraguay", "py", "gmt-03:00", "utc-03:00", "utc-3", "gmt-3"}:
        return _timezone_por_offset(-180)

    match = re.search(r"(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?", lower)
    if match:
        sign, hours, minutes = match.groups()
        total = int(hours) * 60 + int(minutes or 0)
        if sign == "-":
            total *= -1
        return _timezone_por_offset(total)
    return None


def resolver_tz_negocio(tz_name: str | None = None) -> tzinfo:
    tz_name = (tz_name or settings.BUSINESS_TIMEZONE or "America/Asuncion").strip()
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        fallback_fijo = _timezone_fallback_fijo(tz_name)
        if fallback_fijo is not None:
            return fallback_fijo
        fallback_name = (settings.BUSINESS_TIMEZONE or "America/Asuncion").strip()
        if fallback_name and fallback_name != tz_name:
            try:
                return ZoneInfo(fallback_name)
            except ZoneInfoNotFoundError:
                fallback_fijo = _timezone_fallback_fijo(fallback_name)
                if fallback_fijo is not None:
                    return fallback_fijo
        return timezone.utc


def leer_timezone_tenant_desde_db(session) -> str | None:
    if session is None:
        return None
    try:
        row = session.execute(text("SELECT business_timezone FROM configuracion_empresa ORDER BY id ASC LIMIT 1")).first()
        if not row:
            return None
        tz = (row[0] or "").strip()
        return tz or None
    except Exception:
        return None


def zona_horaria_negocio(session=None) -> tzinfo:
    return resolver_tz_negocio(leer_timezone_tenant_desde_db(session))


def ahora_negocio(session=None) -> datetime:
    return datetime.now(zona_horaria_negocio(session)).replace(tzinfo=None)


def fecha_actual_negocio(session=None) -> date:
    return ahora_negocio(session).date()


def normalizar_fecha_negocio(session, value: datetime | None = None) -> datetime:
    tz = zona_horaria_negocio(session)
    if value is None:
        return datetime.now(tz).replace(tzinfo=None)
    if getattr(value, "tzinfo", None) is not None:
        return value.astimezone(tz).replace(tzinfo=None)
    return value


def ahora_desde_config(config=None) -> datetime:
    tz_name = getattr(config, "business_timezone", None)
    return datetime.now(resolver_tz_negocio(tz_name)).replace(tzinfo=None)
