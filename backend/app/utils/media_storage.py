from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import settings

ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024


def ensure_media_root() -> Path:
    media_root = settings.media_root_path
    media_root.mkdir(parents=True, exist_ok=True)
    return media_root


def tenant_media_dir(tenant_slug: str) -> Path:
    base = ensure_media_root() / tenant_slug
    base.mkdir(parents=True, exist_ok=True)
    return base


def save_logo_for_tenant(tenant_slug: str, upload: UploadFile) -> str:
    if not upload.filename:
        raise HTTPException(status_code=400, detail="Debe seleccionar una imagen de logo.")

    ext = Path(upload.filename).suffix.lower()
    if ext not in ALLOWED_LOGO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Formato de logo no permitido. Use PNG, JPG, JPEG, WEBP o SVG.",
        )

    logo_dir = tenant_media_dir(tenant_slug)
    for existing in logo_dir.glob("logo.*"):
        existing.unlink(missing_ok=True)

    destination = logo_dir / f"logo{ext}"
    size = 0
    with destination.open("wb") as output:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_LOGO_SIZE_BYTES:
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail="El logo supera el máximo de 5 MB.")
            output.write(chunk)

    return f"{settings.MEDIA_URL_PREFIX}/{tenant_slug}/{destination.name}"


def resolve_logo_disk_path(logo_path: str | None) -> str | None:
    if not logo_path:
        return None
    if logo_path.startswith(settings.MEDIA_URL_PREFIX + "/"):
        relative = logo_path[len(settings.MEDIA_URL_PREFIX) + 1 :]
        candidate = ensure_media_root() / relative
        if candidate.exists():
            return str(candidate)
        return None
    candidate = Path(logo_path)
    if candidate.exists():
        return str(candidate)
    return None
