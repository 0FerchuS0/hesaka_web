import sys; sys.path.append('.')
from app.database import get_session_for_tenant
from app.models.models import Venta
from sqlalchemy import text

print("Testeando select en tenant 'demo' (hesaka_demo)...")
session = get_session_for_tenant('demo')
try:
    # Probar SELECT simple para ver si el driver casca
    res = session.execute(text('SELECT id, codigo FROM ventas LIMIT 5'))
    for row in res:
        print(row)
    print("El SELECT basico funciona. Ahora consultando ORM...")
    ventas = session.query(Venta).all()
    print(f"Total ventas cargadas: {len(ventas)}")
except Exception as e:
    print(f"Error fatal: {repr(e)}")
finally:
    session.close()
