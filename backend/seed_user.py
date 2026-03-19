from app.database import get_session_for_tenant, init_tenant_db
from app.models.models import Usuario
from app.utils.auth import hash_password
import bcrypt

# 1. Asegurar existencia de tablas (generará table usuarios con el Schema SQLAlchemy real)
init_tenant_db("demo")

# 2. Recrear el usuario admin
session = get_session_for_tenant("demo")
try:
    # Si existe lo borramos
    session.query(Usuario).delete()
    session.commit()
    
    # Creamos el admin con las columnas exactas
    admin = Usuario(
        email="admin@hesaka.com",
        hashed_password=hash_password("admin123"),
        nombre_completo="Admin HESAKA",
        rol="ADMIN",
        activo=True
    )
    session.add(admin)
    session.commit()
    print("Usuario admin web CREADO y sincronizado con el modelo de base de datos SQLAlchemy")
except Exception as e:
    print("Error:", e)
finally:
    session.close()
