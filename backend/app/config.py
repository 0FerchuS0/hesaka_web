"""
HESAKA Web — Configuración central
Lee las variables del archivo .env
"""
from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path


class Settings(BaseSettings):
    # Base de datos admin (gestiona tenants)
    ADMIN_DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/hesaka_admin"

    # PostgreSQL connection params para crear/conectar BDs de clientes
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "password"
    TENANT_DB_PREFIX: str = "hesaka_"
    DEFAULT_TENANT_SLUG: str | None = None
    REPLICA_POSTGRES_HOST: str = "localhost"
    REPLICA_POSTGRES_PORT: int = 5432
    REPLICA_POSTGRES_USER: str = "postgres"
    REPLICA_POSTGRES_PASSWORD: str = "password"
    REPLICA_TENANT_DB_PREFIX: str = "hesaka_"
    SYNC_BATCH_SIZE: int = 1000

    # JWT
    SECRET_KEY: str = "cambia_esta_clave_secreta_en_produccion"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173"

    # Ambiente
    ENVIRONMENT: str = "development"

    # Archivos subidos
    MEDIA_ROOT: str | None = None
    MEDIA_URL_PREFIX: str = "/media"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    def get_tenant_db_url(self, tenant_slug: str) -> str:
        """Construye la URL de conexión para la BD de un cliente específico."""
        db_name = f"{self.TENANT_DB_PREFIX}{tenant_slug}"
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{db_name}"
        )

    def get_replica_db_url(self, tenant_slug: str) -> str:
        db_name = f"{self.REPLICA_TENANT_DB_PREFIX}{tenant_slug}"
        return (
            f"postgresql://{self.REPLICA_POSTGRES_USER}:{self.REPLICA_POSTGRES_PASSWORD}"
            f"@{self.REPLICA_POSTGRES_HOST}:{self.REPLICA_POSTGRES_PORT}/{db_name}"
        )

    @property
    def media_root_path(self) -> Path:
        if self.MEDIA_ROOT:
            return Path(self.MEDIA_ROOT).expanduser().resolve()
        return (Path(__file__).resolve().parents[1] / "media").resolve()

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
