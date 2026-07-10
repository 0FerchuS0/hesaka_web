# Auditoria rapida de caching - 2026-05-31

## Resumen ejecutivo

El sistema si usa caching, pero hoy esta concentrado sobre todo en el frontend mediante React Query.

En backend:

- no hay una estrategia general de cache distribuido
- no se detecta Redis
- no se detecta cache HTTP general
- si existe cache especifico para dashboard historico
- tambien hay cache tecnico de engines/sesiones y algunos "caches" por request/proceso

Conclusiones rapidas:

1. el frontend ya depende bastante de cache de cliente
2. el backend casi siempre responde en vivo
3. para modulos operativos esto es aceptable, pero obliga a invalidar y refetchear bien
4. si falla una invalidacion, puede aparecer informacion vieja en pantalla
5. el sistema hoy esta mas cerca de "fresh data with client cache" que de "server-side cached application"

## Frontend - estado actual

### Cache base global

En `frontend/src/main.jsx`:

- `retry: 1`
- `staleTime: 30000`

Eso significa:

- por defecto, una query se considera fresca por 30 segundos
- si el usuario vuelve a una vista antes de ese tiempo, React Query puede reutilizar datos cacheados

Referencia:

- `frontend/src/main.jsx`

### Modulos con cache explicito ya observado

- `Ventas`
  - listado principal ahora tiene `refetchOnMount: 'always'`
  - esto fue agregado para evitar entrar a ventas con datos viejos luego de convertir presupuestos

- `Compras`
  - usa diferimiento de cargas secundarias
  - tiene `staleTime` para no hacer refetch agresivo

- `Cuentas por pagar`
  - resumen, contados e historial usan `staleTime: 30000`
  - tabs con carga progresiva

- `Clinica`
  - dashboard y recordatorios usan `staleTime` de 30s a 5m segun el caso
  - historial general ahora separa listado principal y resumen

- `Dashboard`
  - resumenes clinicos y cumpleanos usan `staleTime` mayores

### Patron dominante

El patron dominante del frontend es:

- usar React Query para cache local
- reducir carga inicial con `enabled`
- usar `staleTime`
- invalidar queries luego de mutaciones

## Riesgos actuales en frontend

### 1. Riesgo de datos viejos por `staleTime`

Como el default global es 30 segundos, cualquier pantalla operativa que necesite datos frescos al entrar puede mostrar cache si no fuerza refetch.

Ejemplo real ya visto:

- `Ventas` podia no mostrar automaticamente ventas recien creadas / convertidas
- se corrigio con `refetchOnMount: 'always'`

### 2. Invalidaciones inconsistentes

El sistema invalida muchisimo a mano, lo cual da control pero tambien riesgo:

- si una mutacion olvida invalidar una query relacionada, la UI puede quedar desactualizada
- esto es especialmente sensible en modulos cruzados como:
  - presupuestos -> ventas
  - clinica consulta -> historial
  - pagos -> saldos / dashboard / movimientos

### 3. Falta de clasificacion de queries por criticidad

Hoy el cache parece estar definido modulo por modulo, pero no por politica de negocio.

Seria ideal separar:

- queries criticas en vivo
- queries estables
- queries pesadas pero tolerantes a algo de staleness

## Backend - estado actual

### 1. Cache tecnico de engines

En `backend/app/database.py` hay cache de engines y factories por tenant:

- `_engines`
- `_session_factories`
- `_tenant_schema_checked`

Objetivo:

- evitar recrear engine por request

Esto esta bien y no es un problema.

### 2. Dashboard historico con cache persistido

Existe una implementacion especifica de cache historico de dashboard:

- tabla `dashboard_cache`
- scheduler `dashboard_cache_scheduler`
- funciones en `backend/app/routers/reportes.py`

Eso significa que el dashboard historico si tiene una capa de cache de backend real.

Esto esta bien para reportes o metricas historicas.

### 3. "Cache" por proceso / request en finanzas

En finanzas y jornada se reutilizan estructuras cargadas una vez por request/proceso:

- `movimientos_cache`
- `movimientos_dia_cache`
- metricas intermedias

Eso ayuda a no recalcular varias veces dentro de una misma respuesta, pero no es cache global distribuido.

### 4. No se detecta cache distribuido general

No se encontro evidencia de:

- Redis
- Memcached
- cache HTTP general via `Cache-Control`
- ETag / Last-Modified

## Diagnostico general

### Lo que esta bien

- React Query ya da una base util de cache cliente
- muchas vistas ya usan `staleTime`
- se usan `enabled` y carga diferida en modulos que optimizamos
- el dashboard historico tiene cache especifica en backend
- el sistema invalida mucho despues de mutaciones

### Lo que esta flojo

- no hay politica general de cache por tipo de dato
- el default de 30 segundos puede ser demasiado para vistas operativas sensibles
- dependemos mucho de invalidaciones manuales
- no hay cache backend general para endpoints costosos repetidos
- no hay observabilidad clara de hit/miss de cache

## Clasificacion recomendada de datos

### Categoria A - siempre fresco al entrar

Deberian usar `refetchOnMount: 'always'` o politica equivalente:

- ventas
- presupuestos
- agenda clinica
- consultas en curso
- saldos operativos
- movimientos del dia

### Categoria B - fresco con tolerancia corta

`staleTime` bajo, por ejemplo 15s a 60s:

- cuentas por pagar
- compras
- listados operativos con mucha lectura
- recordatorios clinicos

### Categoria C - estable

`staleTime` mayor:

- catalogos
- vendedores
- canales
- lugares de atencion
- doctores
- plantillas
- configuraciones poco cambiantes

### Categoria D - ideal para cache backend

- dashboard historico
- comparativas mensuales
- reportes pesados
- historial clinico agregado si se vuelve costoso online

## Recomendaciones concretas

### Corto plazo

1. documentar por modulo que queries deben refrescar siempre al entrar
2. mantener `refetchOnMount: 'always'` en vistas donde staleness genera errores operativos
3. revisar mutaciones cruzadas para asegurar invalidaciones completas
4. evitar confiar solo en cache cliente para estados financieros y clinicos sensibles

### Mediano plazo

1. definir una politica de cache por clases de datos
2. agregar helpers compartidos para queries "operativas" vs "catalogo"
3. centralizar algo de configuracion React Query por tipo de pantalla

### Largo plazo

1. evaluar cache backend real para reportes pesados y agregados clinicos
2. considerar Redis si la carga online lo justifica
3. medir tiempos y tasas de refetch en produccion

## Conclusiones practicas

- el sistema no esta "sin cache"; tiene bastante cache frontend
- el mayor riesgo hoy no es ausencia de cache, sino usar cache cliente en pantallas donde la frescura importa mucho
- el mayor punto fuerte hoy es el dashboard historico cacheado en backend
- el mayor punto debil hoy es depender de invalidaciones manuales para coherencia entre modulos

## Implementacion aplicada en esta sesion

Se implemento una primera estrategia inteligente para:

- `Ventas`
- `Presupuestos`

Comportamiento:

- el frontend consulta cada 30 segundos un endpoint liviano de "frescura" de modulos
- ese endpoint solo devuelve la ultima version conocida de ventas y presupuestos
- si detecta cambios, marca el modulo como pendiente de refresh
- al entrar al modulo, solo refresca de forma obligatoria si hubo cambios
- si no hubo cambios, puede seguir aprovechando cache cliente para entrar rapido

Objetivo:

- datos actualizados sin refrescar ciegamente siempre
- mejor equilibrio entre frescura y velocidad

## Archivos de referencia revisados

- `frontend/src/main.jsx`
- `frontend/src/pages/VentasPage.jsx`
- `frontend/src/pages/CuentasPorPagarPage.jsx`
- `frontend/src/pages/ClinicaPage.jsx`
- `frontend/src/hooks/useFinancialJornada.js`
- `backend/app/database.py`
- `backend/app/models/models.py`
- `backend/app/main.py`
- `backend/app/services/dashboard_cache_scheduler.py`
- `backend/app/routers/reportes.py`
- `backend/app/routers/finanzas.py`
- `backend/app/utils/jornada.py`
