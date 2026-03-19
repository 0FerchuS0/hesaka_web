import sys; sys.path.append('.')
from app.database import get_session_for_tenant
from app.models.models import Venta
session = get_session_for_tenant('hesaka')
print('Verificando ventas por id...')
try:
    ids = [v[0] for v in session.query(Venta.id).all()]
    for vid in ids:
        try:
            # Forzar carga de todos los campos
            v = session.query(Venta).filter(Venta.id == vid).first()
            _ = v.codigo
            _ = v.estado
            # Cargar relaciones lazy
            _ = len(v.pagos) if v.pagos else 0
            _ = v.cliente_rel.nombre if v.cliente_rel else ''
            print(f"OK Venta {vid}")
        except Exception as e:
            print(f'Error en Venta ID {vid}: {e}')
    print('Fin de revision.')
except Exception as e:
    print(f'Error al obtener ids: {e}')
finally:
    session.close()
