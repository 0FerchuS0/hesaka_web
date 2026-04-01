# Preparacion de instancia: Koeti

Esta guia deja definido el caso concreto de la primera instancia cliente.

## Identidad del cliente

- Nombre comercial: `Koeti`
- Correo administrativo: `hesaka.koeti@gmail.com`
- Slug: `koeti`

## Que significa slug

El `slug` es el nombre corto, tecnico y estable de la instancia.

Se usa para:

- identificar el cliente en configuraciones
- construir nombres de base de datos
- definir variables de entorno
- diferenciar una instancia de otra sin usar espacios ni acentos

Para este cliente, el slug correcto es:

- `koeti`

## Nombres recomendados

- Repositorio GitHub: `hesaka-koeti`
- Proyecto Railway: `hesaka-koeti`
- Proyecto Vercel: `hesaka-koeti`
- Base de datos tenant: `hesaka_koeti`

## Variables recomendadas para Koeti

### Backend

- `DEFAULT_TENANT_SLUG=koeti`
- `TENANT_DB_PREFIX=hesaka_`
- `ENVIRONMENT=production`

### Frontend

- `VITE_TENANT_SLUG=koeti`

## Secuencia de trabajo recomendada

1. Crear el repositorio `hesaka-koeti`
2. Crear el proyecto `hesaka-koeti` en Railway
3. Crear el proyecto `hesaka-koeti` en Vercel
4. Cargar variables de entorno
5. Levantar base vacia
6. Crear usuario administrador inicial
7. Probar login y modulos base

## Regla importante

No reutilizar datos de otra optica.

La instancia `Koeti` debe salir de:

- codigo limpio
- base vacia
- configuracion propia

