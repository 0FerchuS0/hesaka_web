# HESAKA Plantilla

Esta carpeta funciona como base para crear una nueva instancia de HESAKA por cliente.

## Proposito

Usar este proyecto como plantilla para levantar una nueva optica sin mezclar:

- codigo
- base de datos
- configuraciones
- backups
- archivos locales

## Estructura

- `backend/` API FastAPI
- `frontend/` aplicacion React + Vite
- `docs/` guias operativas para crear nuevas instancias

## Regla general

Cada cliente debe tener:

- su propio repositorio
- su propio proyecto en Railway
- su propio proyecto en Vercel
- su propia base de datos

## Documentos importantes

1. [docs/PASO_A_PASO_INSTANCIA_CLIENTE.md](./docs/PASO_A_PASO_INSTANCIA_CLIENTE.md)
2. [docs/LISTA_DE_VERIFICACION_PLANTILLA.md](./docs/LISTA_DE_VERIFICACION_PLANTILLA.md)
3. [docs/VARIABLES_POR_CLIENTE.md](./docs/VARIABLES_POR_CLIENTE.md)

## Primer cliente demo definido

- Optica: `Koeti`
- Correo administrativo: `hesaka.koeti@gmail.com`
- Slug recomendado: `koeti`
- Repositorio recomendado: `hesaka-koeti`
- Proyecto Railway recomendado: `hesaka-koeti`
- Proyecto Vercel recomendado: `hesaka-koeti`
- Base de datos recomendada: `hesaka_koeti`

