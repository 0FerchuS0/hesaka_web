"""
HESAKA Web — Configuración central
Lee las variables del archivo .env
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Base de datos admin (gestiona tenants)
    ADMIN_DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/hesaka_admin"

    # PostgreSQL connection params para crear/conectar BDs de clientes
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "password"
    TENANT_DB_PREFIX: str = "hesaka_"

    # JWT
    SECRET_KEY: str = "cambia_esta_clave_secreta_en_produccion"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173"

    # Ambiente
    ENVIRONMENT: str = "development"

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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
