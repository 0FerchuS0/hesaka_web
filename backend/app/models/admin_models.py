"""
HESAKA Web — Modelos administrativos
Gestiona los tenants (clientes) del sistema SaaS.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text
from sqlalchemy.orm import declarative_base
from datetime import datetime

AdminBase = declarative_base()


class Tenant(AdminBase):
    """Representa un cliente del sistema HESAKA SaaS."""
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(200), nullable=False)          # Nombre de la óptica
    slug = Column(String(100), unique=True, nullable=False)  # ID único → URL: slug.hesaka.com
    email_contacto = Column(String(150), nullable=False)
    telefono = Column(String(50))
    ruc = Column(String(50))

    # Estado y suscripción
    activo = Column(Boolean, default=True)
    fecha_alta = Column(DateTime, default=datetime.utcnow)
    fecha_vencimiento = Column(DateTime, nullable=True)
    plan = Column(String(50), default="BASICO")  # BASICO, CLINICA, FULL

    # Módulos habilitados
    tiene_clinica = Column(Boolean, default=False)

    # Notas internas
    notas = Column(Text, nullable=True)

    def __repr__(self):
        return f"<Tenant(slug='{self.slug}', nombre='{self.nombre}')>"


class AdminUser(AdminBase):
    """Usuario administrador del panel HESAKA (vos)."""
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(150), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    nombre = Column(String(200))
    es_superadmin = Column(Boolean, default=False)
    activo = Column(Boolean, default=True)
    creado_en = Column(DateTime, default=datetime.utcnow)
