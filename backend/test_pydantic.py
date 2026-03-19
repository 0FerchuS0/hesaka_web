import sys
sys.path.append('.')
from app.database import get_session_for_tenant
from app.models.models import Venta
from app.schemas.schemas import VentaOut

print("Conectando...")
try:
    session = get_session_for_tenant("hesaka")
    print("Sesión creada.")
    
    ventas = session.query(Venta).all()
    print(f"Total ventas encontradas: {len(ventas)}")
    
    for v in ventas:
        print(f"Validando venta {v.id}...")
        try:
            vo = VentaOut.model_validate(v)
            print(f"  -> OK: {vo.codigo}")
        except Exception as e:
            print(f"  -> Error validando venta {v.id}: {e}")
            break
except Exception as e:
    print(f"Error fatal: {e}")
finally:
    if 'session' in locals():
        session.close()
    print("Fin.")
