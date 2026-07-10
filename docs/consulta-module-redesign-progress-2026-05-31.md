# Progreso - Rediseño del modulo de consultas

Fecha: 2026-05-31

## Objetivo

Diseñar un flujo de trabajo mas rapido, claro y profesional para el modulo de consultas, con foco en:

- reducir errores humanos
- mejorar comprension del historial/ficha
- integrar mejor receta de medicamentos, receta optica e indicaciones
- hacer mas natural el inicio y retoma de consultas

## Criterios de experiencia deseados

- rapido
- claro
- profesional

## Hallazgos clave obtenidos en la entrevista

### Objetivo real del modulo

El modulo se usa para registrar la consulta oftalmologica realizada al paciente y dejarla visible en el historial, contemplando que no siempre se recetan lentes: tambien puede haber medicamentos, tratamientos no farmacologicos e indicaciones.

### Usuarios principales

- doctor
- admin

### Punto de entrada real / esperado

- desde `Agenda` cuando el paciente ya esta agendado
- desde `Pacientes` cuando llega un paciente ocasional

## Recomendacion fuerte de entrada

En `Pacientes`, al registrar o abrir un paciente, debe existir una accion clara:

- `Crear nueva consulta`

No parece necesario que el submodulo `Consultas` sea el punto principal para empezar a atender; podria quedar mas como listado administrativo o tecnico.

## Flujo actual reportado por el usuario

1. llega el paciente y se lo registra
2. se realiza la anamnesis en la primera vista de la ventana de consulta
3. se pasa al trabajo oftalmologico propiamente
4. se guarda la consulta y se imprime lo necesario

## Problemas principales detectados

1. el historial es dificil de entender
2. no es practico el modo de crear receta de medicamentos
3. si el usuario sale de la consulta, luego cuesta retomarla
4. para agregar medicamento a la consulta, hoy el sistema puede empujar a crear otra consulta
5. hay demasiados lugares donde "sacar recetas", pero no son exactamente la misma cosa
6. hay pasos que podrian unirse
7. hay informacion repetida entre historial, ficha y consulta
8. a veces se genera otra consulta por error
9. para identificar una receta correcta en historial hay que abrir demasiado la consulta

## Observacion funcional clave

Cuando una consulta tiene receta de medicamentos, en el historial aparecen dos registros separados del mismo paciente:

- consulta oftalmologica
- receta de medicamentos

Aunque tecnicamente tenga sentido por modelo de datos, a nivel UX se percibe como:

- redundante
- poco intuitivo
- poco elegante

## Regla de diseño recomendada

La unidad visual y funcional principal deberia ser la `atencion`, no el documento suelto.

Una atencion deberia agrupar:

- consulta
- receta optica
- receta de medicamentos
- indicaciones
- control

## Obligatorio vs opcional

### Obligatorio

- paciente
- diagnostico

### Opcional

- anamnesis
- receta de medicamentos
- receta optica
- indicaciones
- control

## Implicacion importante

La anamnesis no deberia bloquear el flujo, porque a veces es solo una formalidad y frena la atencion.

## Tipo de consulta dominante

El uso es variado, pero existe una leve mayoria de consulta refractiva.

## Implicacion de diseño

El flujo base deberia sentirse natural para consulta refractiva, pero con bloques opcionales que permitan extenderse a:

- medicamentos
- indicaciones
- control
- otros tratamientos

## Informacion que el medico necesita tener a mano durante la consulta

Ya visible:

- datos del paciente

Debe estar visible o accesible rapidamente:

- graduacion anterior
- diagnosticos previos
- tratamientos previos
- receta anterior
- evolucion clinica resumida

## Recomendacion de UX

Desde la consulta debe existir acceso a la ficha/historial del paciente en una ventana secundaria, sin romper la consulta actual.

Idealmente:

- modal grande
- panel lateral amplio
- popup contextual

Objetivo:

- ver evolucion sin perder lo ya cargado
- volver a la consulta exactamente al mismo punto

## Sobre el flujo por pasos

El flujo por pasos ya existe y el usuario lo considera correcto en concepto.

Lo que falta es comunicar mejor:

- en que paso esta
- que sigue
- que ya completo
- que es obligatorio
- que es opcional

## Mejora puntual recomendada

Agregar una barra o encabezado muy visible con algo del estilo:

- Paso 1: Anamnesis
- Paso 2: Evaluacion oftalmologica
- Paso 3: Resolucion clinica
- Paso 4: Guardar e imprimir

## Acciones de impresion / recetas

Hoy hay demasiados lugares donde se ofrecen recetas, pero no siempre significan lo mismo.

Debe aclararse mejor por tipo:

- Receta optica
- Receta de medicamentos
- Indicaciones
- Documento de impresion
- Impresion completa de la atencion

## Mejora sugerida muy valiosa

Agregar opcion para:

- imprimir receta de lentes + receta de medicamentos + indicaciones en una sola accion

## Hipotesis fuerte de rediseño

El sistema hoy parece demasiado pensado desde su estructura interna y no desde la logica real del usuario.

La reorganizacion recomendada es:

1. `Agenda` y `Pacientes` como puntos principales de entrada
2. `Consulta` como espacio principal de trabajo clinico
3. `Ficha / historial` como espacio de lectura de evolucion
4. `Recetas / indicaciones / impresiones` como salidas de la misma atencion

## Propuesta conceptual resumida

### Entrada

- desde agenda para paciente agendado
- desde pacientes para paciente ocasional

### Consulta

- base rapida para consulta refractiva
- diagnostico obligatorio
- bloques opcionales agregables

### Ficha / historial

- orientado a evolucion
- agrupado por atencion
- no por tipos tecnicos de registros

### Salidas

- impresion individual por documento
- impresion completa de la atencion

## Riesgos UX que este rediseño debe resolver

- generar otra consulta por error
- no saber si una consulta ya esta en curso
- no saber como retomar una consulta
- no encontrar rapido la receta correcta
- duplicacion visual de informacion en historial

## Proximo paso recomendado

Convertir este diagnostico en una propuesta concreta de:

- nuevo flujo ideal
- mapa de pantallas
- decisiones de UX
- cambios rapidos vs cambios profundos
