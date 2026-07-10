# Backups de Railway

Esta guia deja un respaldo fuera de Railway para que la recuperacion no dependa del backend ni del panel de la app.

## Que resuelve

- saca un dump directo del PostgreSQL de Railway
- guarda el archivo en `backups/railway/<tenant>/`
- valida el dump con `pg_restore -l`
- conserva por defecto los ultimos `14` backups

## Que no resuelve

- no protege archivos adjuntos si estan fuera de PostgreSQL
- no reemplaza una replica o una estrategia de alta disponibilidad
- no conviene depender solo del boton de backup dentro de HESAKA

## Preparacion

1. Instalar cliente de PostgreSQL en la PC que hara el backup
2. Copiar [`.env.railway-backup.example`](/C:/HESAKA%20-%20copia/Hesaka_Web/.env.railway-backup.example) como `.env.railway-backup`
3. Cargar ahi las credenciales del PostgreSQL de Railway

Variables que Railway suele dar:

- `DATABASE_URL`
- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`

## Ejecucion manual

Desde la raiz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup_railway.ps1
```

Opciones utiles:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup_railway.ps1 -TenantSlug koeti
powershell -ExecutionPolicy Bypass -File .\scripts\backup_railway.ps1 -Retention 30
powershell -ExecutionPolicy Bypass -File .\scripts\backup_railway.ps1 -OutputDir "D:\Backups\Hesaka\koeti"
```

## Programarlo en Windows

Ejemplo diario a las 06:00 usando Task Scheduler:

```powershell
schtasks /Create /SC DAILY /TN "HESAKA Railway Backup" /TR "powershell -ExecutionPolicy Bypass -File \"C:\HESAKA - copia\Hesaka_Web\scripts\backup_railway.ps1\"" /ST 06:00
```

## Recomendacion operativa

- guardar la carpeta de backups dentro de OneDrive, Google Drive o un disco externo sincronizado
- hacer al menos un backup diario
- probar una restauracion en una base de prueba una vez por semana
- si usan adjuntos en disco, respaldar tambien `backend/media/` o el storage externo correspondiente
