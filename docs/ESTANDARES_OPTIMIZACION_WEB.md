# Estandares de Optimizacion Web HESAKA

## Objetivo
Definir un workflow y un conjunto de reglas tecnicas para que las futuras implementaciones web de HESAKA mantengan:
- buen rendimiento
- consistencia entre modulos
- menor carga en frontend y backend
- crecimiento ordenado del sistema

Este documento aplica solo a la version web:
- `C:\HESAKA - copia\Hesaka_Web\backend\...`
- `C:\HESAKA - copia\Hesaka_Web\frontend\...`

## Alcance y obligatoriedad
Este archivo es la **referencia normativa** para todo desarrollo y refactor en el proyecto web HESAKA listado arriba.

Reglas de uso:
- Toda implementacion nueva o mejora sustantiva debe **basarse en** las secciones de este documento (workflow, contratos de API, React Query, UI operativa, etc.).
- Si el trabajo introduce un **patron transversal nuevo** que no esta descrito aqui (nuevo tipo de listado, convencion de errores, formato de exportacion, regla de permisos en UI, etc.), se debe **actualizar este mismo documento** en el mismo cambio o PR, en la seccion mas adecuada o creando una subseccion numerada coherente con el resto.
- Las excepciones justificadas (por ejemplo un modulo legacy que aun no migra) deben quedar **anotadas aqui** con modulo afectado y motivo, para no diluir el estandar en conversaciones sueltas.

## Colaboracion y sugerencias tecnicas
El equipo esta **abierto a sugerencias** cuando un requerimiento pueda ser **contraproducente** para el sistema (por ejemplo: romper consistencia de datos, duplicar fuentes de verdad, empeorar rendimiento, o introducir complejidad operativa innecesaria).

Reglas:
- Si durante una implementacion se detecta un riesgo o una alternativa claramente mejor, **comunicarlo de inmediato** con argumentos concretos (impacto en datos, UX, costo de mantenimiento, carga en BD o red).
- La decision final la toma el equipo junto con quien define el producto; el estandar se **actualiza aqui** cuando se acuerde un cambio de criterio o un patron nuevo.

Ejemplo de patron ya acordado: catalogos pequeños de referencia (p. ej. destinatarios autorizados de rendiciones) se modelan en **tablas dedicadas por tenant**, con ABM acotado y uso de **IDs en API** para filtros y altas, manteniendo texto denormalizado solo cuando aporta auditoria o exportes legibles.

## Regla General
Antes de crear una pantalla o mejorar una existente, siempre evaluar:
1. cuantos registros podria cargar ese modulo en uso real
2. si la busqueda y filtros deben ir en backend
3. si el listado necesita paginacion
4. si el payload puede hacerse mas liviano
5. si la consulta necesita indices o agregaciones mejores

## Workflow de Implementacion
Cada modulo nuevo o refactor de rendimiento debe seguir este orden:

1. Analisis funcional
- definir que datos realmente necesita la pantalla
- separar:
  - listado
  - detalle
  - exportacion
  - resumen/KPIs

2. Analisis de volumen
- estimar si el modulo puede llegar a:
  - 100 registros
  - 1.000 registros
  - 10.000 registros o mas
- si supera 100 registros potenciales, no usar carga completa por defecto

3. Diseñar contrato de listado
- todo listado grande debe exponer:
  - `page`
  - `page_size`
  - `total`
  - `items`
- los filtros deben resolverse en backend
- la busqueda libre debe resolverse en backend

4. Crear schema liviano de listado
- no reutilizar schema de detalle si trae relaciones pesadas
- crear DTOs especificos para tabla/lista

5. Implementar frontend con estado controlado
- filtros visibles
- paginacion visible
- busqueda con debounce
- recarga controlada con React Query

6. Verificar payload y tiempos
- revisar que la pantalla ya no cargue datos innecesarios
- evitar llamadas duplicadas

7. Reutilizar el patron
- una vez validado en un modulo, usar el mismo patron en los demas

## Estandares Obligatorios

### 1. Paginacion
Todos los listados grandes deben usar paginacion real.

Contrato recomendado:
- request:
  - `page`
  - `page_size`
  - filtros
  - `search`
- response:
  - `items`
  - `page`
  - `page_size`
  - `total`
  - `total_pages`

Valores recomendados:
- default `page_size`: 25
- maximo inicial: 100

No permitido como patron general:
- traer 500, 1000 o 5000 registros por defecto para renderizar una tabla normal

### 2. Busqueda y Filtros
La busqueda debe resolverse en backend en modulos grandes.

Aplicar a:
- Ventas
- Compras
- Clientes
- Productos
- Movimientos
- Cuentas por pagar

Regla:
- el frontend no debe traer listas grandes para filtrarlas localmente

### 3. Payloads Livianos
Separar siempre:
- schema de listado
- schema de detalle

El listado no debe traer:
- historiales completos
- relaciones anidadas pesadas
- tablas secundarias completas

El detalle si puede traer mas informacion.

### 4. Selectores Remotos
Cuando un selector pueda crecer mucho, no cargar todo el catalogo.

Aplicar a:
- clientes
- productos
- proveedores
- marcas

Patron recomendado:
- input buscable
- consulta remota por texto
- limite corto de resultados
- el selector debe poder convivir con layouts angostos sin romper la barra superior o el formulario
- los filtros de reportes tambien deben usar este patron cuando el catalogo asociado sea grande

### 4.1 Listas desplegables y menus
Toda lista desplegable usada dentro de:
- tablas
- cards
- modales
- barras de filtros

debe renderizarse por encima del layout y no dentro del flujo de la celda o del contenedor.

Reglas:
- usar menu flotante con `position: fixed` o portal equivalente
- calcular posicion segun viewport
- si no entra abajo, abrir hacia arriba
- nunca depender de `position: absolute` dentro de contenedores con `overflow`
- las acciones de tabla y los selectores buscables deben seguir este mismo patron

Objetivo:
- no volver a perder opciones por cortes de tabla
- no volver a dedicar tiempo a corregir el mismo problema modulo por modulo
- mantener un patron unico de implementacion para listas desplegables

### 4.2 Boton unico de acciones por fila (tablas)
En tablas operativas con varias operaciones por registro, la columna **Acciones** debe usar **un solo boton** (etiqueta recomendada: `Acciones` con indicador visual de menu, por ejemplo `Acciones ▾`) que abre un **menu desplegable** con una entrada por accion.

Reglas:
- no apilar dos o mas botones de accion en la misma celda salvo requerimiento funcional muy puntual documentado
- cada accion disponible es un item del menu (texto claro + icono opcional)
- acciones no disponibles deben mostrarse **desactivadas** (`disabled`) con el mismo patron visual que el resto del sistema, no ocultarse sin criterio si el usuario necesita entender por que no aplica
- el menu debe cumplir la misma regla de **posicion fija** y capa superior descrita en el punto **4.1** (overlay a pantalla completa debajo del menu para cerrar al clic, `z-index` coherente, recalcular posicion en `scroll` y `resize`)
- renderizar overlay y menu con **`createPortal(..., document.body)`** cuando el menu se arme desde tablas o tarjetas dentro de layout con `transform`, animaciones o `overflow`: si no, `position: fixed` puede quedar anclado a un contenedor equivocado y el menu **aparece lejos del boton**
- alinear el boton de forma **centrada** en la celda cuando la columna es solo de acciones

Referencias de implementacion en el codigo:
- `frontend/src/pages/JornadaRendicionesPage.jsx` — historial de jornadas y de rendiciones (menus `JornadaHistorialRowActions`, `RendicionHistorialRowActions`)
- `frontend/src/pages/VentasPage.jsx` — `VentasRowActions`

### 5. React Query
Usar React Query con criterio uniforme:

- catalogos estables:
  - `staleTime` mas largo
- listados operativos:
  - `staleTime` corto o recarga manual
- reportes:
  - consulta bajo accion del usuario

Invalidaciones:
- invalidar solo keys afectadas
- evitar invalidar todo el sistema cuando cambia un solo modulo

### 5.1 Carga diferida de pantallas
Las paginas grandes deben cargarse con `lazy` y `Suspense` desde el enrutado principal.

Aplicar a:
- modulos operativos completos
- reportes
- pantallas con muchas dependencias visuales o de datos

Objetivo:
- bajar el peso del bundle inicial
- acelerar el primer render del sistema
- cargar codigo solo cuando el usuario entra al modulo

### 6. Base de Datos y Sesiones
No hacer trabajo de migracion ligera en requests normales salvo necesidad puntual.

Objetivos:
- cachear engine por tenant
- cachear session factory por tenant
- minimizar inspeccion de esquema en runtime

### 6.1 Backups y restores legacy
Cuando se restaure un backup historico (por ejemplo un `.dump` proveniente de Railway o de una version anterior del sistema), el flujo de restore debe tolerar diferencias menores de esquema entre el backup y los modelos actuales.

Reglas:
- la restauracion no debe asumir que todas las tablas o columnas del modelo actual existen en el backup importado
- cualquier limpieza post-restore basada en foreign keys o tablas ORM debe validar antes la existencia real de tabla y columna en `information_schema`
- si el backup es legacy, primero restaurar estructura y datos; luego aplicar el esquema web faltante con el bootstrap normal del tenant
- antes de restaurar sobre una BD local existente, generar siempre un backup previo del tenant actual

Objetivo:
- poder reutilizar backups productivos o historicos como respaldo operativo y como fuente para actualizar entornos locales sin romper el flujo por drift de esquema

No recomendado:
- crear sessionmaker en cada request si ya puede cachearse
- ejecutar ajustes de esquema frecuentemente dentro del flujo caliente

### 7. Reportes
Los reportes deben usar:
- agregaciones SQL cuando sea posible
- objetos livianos para la tabla
- exportaciones basadas en datos ya resumidos

No recomendado:
- construir KPIs recorriendo demasiadas relaciones ORM si puede resolverse antes

### 7.1 Prioridad de optimizacion de rendimiento
Cuando aparezcan problemas reales de velocidad en produccion o en pruebas operativas, la prioridad de trabajo debe ser esta:

1. optimizar endpoints pesados de uso diario
- `Presupuestos`
- `Ventas`
- `Gestion de pagos`
- reportes mas usados

2. pasar reportes caros a agregaciones SQL reales
- `SUM`
- `COUNT`
- `GROUP BY`
- mover al motor de base de datos los calculos repetitivos que hoy se hagan en Python o en el frontend

3. agregar indices compuestos puntuales
- no crear indices "por si acaso"
- solo agregar indices cuando respondan a filtros y ordenamientos realmente usados por el sistema
- validar especialmente combinaciones como:
  - `fecha + estado`
  - `venta_id + fecha`
  - `cliente_id + fecha`
  - `proveedor_id + fecha`

No recomendado:
- refactorizar en masa relaciones ORM o estrategias `lazy` sin una medicion previa
- aplicar cambios estructurales grandes solo porque una herramienta los sugiere
- introducir Redis, particionamiento o vistas materializadas antes de agotar estas tres prioridades

### 8. Indices
Todo filtro frecuente debe revisarse para indices.

Campos candidatos frecuentes:
- `fecha`
- `estado`
- `cliente_id`
- `proveedor_id`
- `banco_id`
- `grupo_pago_id`
- `lote_pago_id`
- documentos (`codigo`, `nro_factura`, `nro_documento_original`)

### 9. Tablas y Layout Responsive
Toda pantalla con tabla operativa debe priorizar que:
- los filtros y acciones superiores entren correctamente en varias resoluciones
- la tabla no esconda columnas importantes
- las celdas con texto largo puedan usar 2 o 3 lineas si hace falta

Reglas:
- la barra de filtros debe usar `flex-wrap`
- los bloques de acciones deben poder bajar de linea sin romper el layout
- las tablas grandes deben vivir dentro de un contenedor con `overflow-x: auto`
- definir `min-width` de tabla solo cuando sea necesario
- columnas largas como cliente, documento, proveedor o concepto:
  - pueden ocupar 2 o 3 lineas
  - no deben forzar que desaparezca el lado derecho de la tabla
- columnas cortas como fecha, total, saldo, estado:
  - deben mantenerse compactas
- la columna de acciones debe reservar ancho suficiente y usar menus compactos cuando haya varias acciones

No recomendado:
- tablas que obliguen al usuario a perder de vista la columna de acciones
- filtros superiores en una sola fila rigida
- textos largos en una sola linea si eso rompe la visibilidad general

### 9.1 Filtros de fecha
Todo modulo que use filtros por fecha debe arrancar, por defecto, en el periodo del mes actual.

Ejemplo:
- si hoy es `13/03/2026`
- el rango inicial debe ser:
  - `01/03/2026`
  - `13/03/2026`

Reglas:
- la fecha inicial por defecto debe ser el primer dia del mes en curso
- la fecha final por defecto debe ser el dia actual
- cuando el filtro cambia un reporte o historial importante, debe existir boton explicito `Aplicar filtros`
- evitar disparar consultas pesadas en cada cambio de fecha si el modulo trabaja con historiales, reportes o conciliaciones

### 9.2 KPIs y cuadros informativos
Los bloques de resumen o KPIs no deben ocupar mas altura de la necesaria.

Reglas:
- si el modulo muestra hasta 4 KPIs principales, deben ir en una sola hilera en escritorio
- las tarjetas deben ser compactas:
  - padding reducido
  - titulo corto

### 9.3 Flujos operativos multi-paso
Cuando una pantalla principal trabaja como flujo operativo y no solo como listado, la interfaz debe mostrar claramente:
- donde empieza el flujo
- cuando el registro ya quedo guardado
- cual es el siguiente paso recomendado

Aplicar especialmente a:
- consultas clinicas
- cobros y pagos
- ajustes
- documentos posteriores a una operacion

Reglas:
- no duplicar las mismas acciones criticas en varios lugares del flujo
- despues de guardar, mostrar un bloque unico de `Paso siguiente`
- ese bloque debe quedar cerca del punto de accion del usuario
- si el formulario es largo, desplazar o enfocar visualmente el bloque siguiente
- todo boton critico de accion (`Guardar`, `Crear`, `Aplicar`, `Confirmar`, `Eliminar`, `Pagar`, `Cobrar`, `Exportar`) debe bloquearse al primer click mientras procesa la accion o hasta que cambie de estado la pantalla
- no permitir doble click sobre acciones criticas que puedan duplicar registros, pagos, cobros, consultas o documentos
- en modales de trabajo intensivo, no cerrar por click fuera; solo cerrar con boton explicito y, si hay cambios sin guardar, mostrar confirmacion antes de salir
- si una accion recarga o invalida datos, el estado visual de `procesando` debe durar hasta que el cambio ya pueda verse en pantalla, no solo hasta que responda el backend
- si el usuario intenta cambiar de pantalla, volver atras, cerrar el modal o refrescar mientras una accion critica sigue en curso, debe mostrarse una advertencia clara antes de abandonar la vista
- agrupar documentos derivados en una sola zona clara:
  - PDF principal
  - indicaciones
  - receta
  - exportaciones relacionadas
- usar nombres explicitos, por ejemplo:
  - `Receta de medicamentos`
  - `Indicaciones PDF`
  - `Receta de lentes PDF`

No recomendado:
- guardar en silencio
- dejar al usuario adivinar que debe hacer despues
- repetir los mismos botones arriba y abajo del formulario sin una razon clara

### 9.4 Historial operativo vs historial general
Cuando un modulo tenga dos vistas de historial, debe quedar clara la diferencia entre:
- historial operativo por entidad
- historial general administrativo

Ejemplo en clinica:
- `Historial del paciente` = centro operativo principal
- `Historial general` = control global, auditoria y busqueda transversal

Reglas:
- el historial operativo debe priorizar:
  - cabecera de contexto
  - acciones claras sobre el registro seleccionado
  - panel de detalle sin salir de la pantalla
- el historial general debe priorizar:
  - filtros
  - supervision
  - busqueda por fecha, profesional, tipo o texto libre
- no hacer competir ambas pantallas con el mismo protagonismo ni las mismas acciones visibles
  - valor visible
  - detalle breve
- evitar tarjetas altas con demasiado espacio vacio
- el objetivo es que el usuario vea resumen y contenido operativo en la misma pantalla sin perder tanto alto
- si la resolucion es mas chica, recien ahi pueden pasar a 2 columnas o apilarse

Aplicar especialmente a:
- dashboards
- historiales
- reportes con resumen superior

## Orden Recomendado de Optimizacion
1. Ventas
2. Compras
3. Clientes
4. Productos
5. Cuentas por pagar
6. Movimientos financieros
7. Reportes pesados

## Modulo Piloto
El primer modulo que debe seguir este estandar como referencia es:
- `Ventas`

Objetivo del piloto:
- paginacion real
- busqueda server-side
- filtros server-side
- respuesta liviana
- controles visibles en tabla

## Criterio de Aceptacion
Una optimizacion se considera correcta si:
- reduce cantidad de datos cargados
- no rompe la logica funcional del modulo
- mantiene el estilo visual del sistema
- no debilita las protecciones contra doble click, cierres accidentales o navegacion prematura
- deja un patron reutilizable para otros modulos
- incluye guia de prueba

## Regla para Futuras Implementaciones
Antes de agregar una nueva tabla o listado al sistema, revisar este archivo y responder:
1. necesita paginacion?
2. necesita busqueda remota?
3. necesita schema liviano?
4. el selector debe ser remoto?
5. los filtros deben correr en backend?

Si alguna respuesta es si, aplicar este estandar desde el inicio.

Obligacion de documentacion:
- Si aparece una **sexta pregunta** (nuevo tipo de decision recurrente), incorporarla a esta lista y describir el patron esperado en la seccion correspondiente del documento.
- Si un cambio de codigo **contradice** una regla de este archivo, no avanzar sin: o bien ajustar el codigo al estandar, o bien **proponer y registrar** aqui la modificacion al estandar (que pasa a ser la nueva regla para todos los modulos).

Adicional:
- toda implementacion nueva debe considerar desde el inicio que el layout pueda reducirse sin romper acciones, filtros o formularios, aunque la fase formal de responsive total siga pendiente.
