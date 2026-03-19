from app.database import get_admin_session, init_admin_db
from app.models.admin_models import Tenant

init_admin_db()

session = get_admin_session()
try:
    demo = session.query(Tenant).filter_by(slug="demo").first()
    if not demo:
        demo = Tenant(
            nombre="Óptica de Prueba",
            slug="demo",
            email_contacto="optica@hesaka.com",
            activo=True,
            plan="PREMIUM",
            tiene_clinica=True
        )
        session.add(demo)
        session.commit()
        print("Tenant 'demo' guardado con SQLAlchemy exitosamente.")
    else:
        # Forzar activo en caso de que esté inactivo
        demo.activo = True
        session.commit()
        print("Tenant 'demo' ya existía, actualizado a activo.")
except Exception as e:
    print(f"Error: {e}")
finally:
    session.close()
