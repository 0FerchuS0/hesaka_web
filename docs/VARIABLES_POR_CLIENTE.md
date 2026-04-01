# Variables por cliente

Esta guia resume que variables debes preparar cuando creas una nueva instancia.

## Backend

Archivo base:

- `backend/.env.example`

Variables principales por cliente:

- `ADMIN_DATABASE_URL`
- `TENANT_DB_PREFIX`
- `DEFAULT_TENANT_SLUG`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `SECRET_KEY`
- `CORS_ORIGINS`
- `ENVIRONMENT`

## Frontend

Archivo base:

- `frontend/.env.example`

Variables principales por cliente:

- `VITE_API_BASE_URL`
- `VITE_TENANT_SLUG`

## Valores sugeridos para Koeti

### Backend

- `DEFAULT_TENANT_SLUG=koeti`
- `TENANT_DB_PREFIX=hesaka_`
- `ENVIRONMENT=production`

### Frontend

- `VITE_TENANT_SLUG=koeti`

## Regla importante

No copiar archivos `.env` entre clientes.

Cada cliente debe tener sus propias variables cargadas directamente en:

- Railway para backend
- Vercel para frontend

