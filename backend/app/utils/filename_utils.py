import re
import unicodedata
from datetime import date, datetime
from typing import Optional


def sanitize_filename_component(value: Optional[str], fallback: str = "sin_dato") -> str:
    text = (value or "").strip()
    if not text:
        return fallback

    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", normalized).strip("._")
    return normalized or fallback


def format_date_for_filename(value: Optional[date | datetime]) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%Y-%m-%d")


def build_period_suffix(
    fecha_desde: Optional[date | datetime],
    fecha_hasta: Optional[date | datetime],
) -> str:
    desde = format_date_for_filename(fecha_desde)
    hasta = format_date_for_filename(fecha_hasta)

    if desde and hasta:
        return f"{desde}_a_{hasta}"
    if desde:
        return f"desde_{desde}"
    if hasta:
        return f"hasta_{hasta}"
    return "sin_rango"
