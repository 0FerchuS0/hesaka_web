# Lista de verificación de plantilla HESAKA

Usar esta lista antes de crear una nueva instancia para un cliente.

## Debe quedar incluido

- código backend
- código frontend
- `.gitignore`
- `backend/.env.example`
- `frontend/.env.example`
- documentación de despliegue

## Debe quedar excluido

- `backend/.env`
- `frontend/.env`
- `backend/backups/`
- `backend/media/`
- `backend/venv/`
- dumps `.dump`
- logs temporales
- archivos de prueba locales

## Debe revisarse manualmente

- nombres visibles del negocio
- logos o assets del cliente
- tenant por defecto
- URLs del backend/frontend
- administrador inicial

## Nombres recomendados por cliente

Usar nombres claros y en español o semánticamente intuitivos:

- repositorio: `hesaka-nombrecliente`
- proyecto Railway: `hesaka-nombrecliente`
- proyecto Vercel: `hesaka-nombrecliente`
- base tenant: `hesaka_nombrecliente`
- slug: `nombrecliente`

## Regla importante

Nunca crear una nueva instancia reutilizando una base de datos de otro cliente y luego “limpiándola”.

La instancia nueva debe salir de:

- código limpio
- base vacía
- configuración propia

