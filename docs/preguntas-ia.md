# Qué preguntarle a la IA sobre ÓRBITA

[English](ai-questions.md) · **Español**

Ejemplos para el **asistente propio de ÓRBITA** (el botón «✨ Pregúntale a ÓRBITA» de cada aplicación). También
funcionan en el chat de **HCL DX IQ** (el botón ✨ de DX), con el servidor MCP de ÓRBITA registrado. La IA actúa **como el usuario que pregunta**: cada persona ve y cambia solo lo
suyo (y su equipo, si es responsable). Lo que **cambia datos** nunca se hace a la primera: la IA enseña antes un
resumen y espera a que confirmes («sí, hazlo»). **Se puede preguntar en español o en inglés**: la IA responde en el
idioma de la pregunta (las preguntas en inglés: [ai-questions.md](ai-questions.md)).

Entre paréntesis, la herramienta del MCP que usa la IA ([mcp.md](mcp.md)) y quién puede preguntarlo en la demo.

## Mi día y mi situación

- ¿Qué tengo hoy? / Resúmeme mi situación (`resumen_dia`)
- ¿Cómo voy esta semana de horas? (`resumen_dia`)
- ¿Tengo algo pendiente de aprobar? (`resumen_dia`)
- ¿Quién de mi equipo falta en los próximos días? (`resumen_dia`)
- ¿Quién soy en ÓRBITA? ¿Quién es mi responsable? (`quien_soy`)
- ¿Tengo avisos sin leer? ¿Qué me han dicho? (`avisos`)
- Marca todos mis avisos como leídos (`avisos_marcar_leidos`)

## Fichaje

- ¿He fichado hoy? ¿Desde qué hora estoy trabajando? (`fichaje_hoy`)
- ¿Cuántas horas llevo hoy? (`fichaje_hoy`)
- Ficha mi entrada en teletrabajo (`fichar`)
- Me voy a comer: ficha la pausa (`fichar`, motivo COMIDA)
- Salgo al médico, ficha una pausa por médico (`fichar`, motivo MEDICO: cuenta como tiempo de trabajo)
- Ya he vuelto (`fichar`, REANUDAR)
- Ficha mi salida (`fichar`, SALIDA)
- ¿Cuántas horas hice en octubre? ¿Cuál es mi saldo del mes? (`fichaje_mes`)
- ¿Qué días de este mes no cerré el fichaje? (`fichaje_mes`)
- El martes olvidé fichar la salida: salí a las 18:05 por una visita a un cliente. Pide la corrección (`fichaje_corregir`)
- *Responsable:* ¿Quién de mi equipo está trabajando ahora? ¿Quién está en teletrabajo hoy? (`equipo_ahora`; `andres`)
- *Responsable:* ¿Cuántas horas ha hecho macarena este mes? (`fichaje_mes` con empleado; `andres`)
- *RRHH:* ¿Cómo va el registro de jornada de eduardo en octubre? (`fichaje_mes`; `patricia`)

## Vacaciones y ausencias

- ¿Cuántos días de vacaciones me quedan? ¿Y de asuntos propios? (`vacaciones_saldo`)
- ¿Cuándo son mis próximas vacaciones? (`vacaciones_saldo`)
- ¿Qué solicitudes de ausencia tengo este año y cómo están? (`vacaciones_solicitudes`)
- ¿Me han aprobado el viaje familiar de diciembre? (`vacaciones_solicitudes`)
- Pídeme vacaciones del 9 al 11 de diciembre (`vacaciones_solicitar`)
- Pide un día de asuntos propios el próximo viernes para una gestión personal (`vacaciones_solicitar`)
- Cancela mi solicitud de vacaciones de diciembre (`vacaciones_solicitudes` + `vacaciones_cancelar`)
- ¿Quién del equipo está de vacaciones en diciembre? (`ausencias_equipo`)
- ¿Qué festivos hay este mes? (`ausencias_equipo`)
- ¿Coincido con alguien si me cojo la semana del 14 de diciembre? (`ausencias_equipo`)

## Gastos y viajes

- ¿Cuánto he gastado este año? ¿En qué categoría gasto más? (`gastos_resumen`)
- ¿Tengo notas de gasto pendientes de cobro? ¿Cuánto me deben? (`gastos_resumen`)
- ¿En qué estado está mi nota «Comidas con clientes»? (`gastos_resumen` + `nota_gasto`)
- ¿Qué gastos lleva mi nota de Valencia y cuánto suman? (`nota_gasto`)
- Crea una nota de gasto «Visita a clientes en Sevilla» (`nota_gasto_crear`)
- Añade a esa nota una comida de 42,80 € con 3,89 € de IVA de ayer, con el cliente Grupo Sur (`gasto_anadir`)
- Añade 186 km de Madrid a Toledo y vuelta del lunes (`gasto_anadir`, KILOMETRAJE)
- La comida pasó de 30 €: justifícala porque éramos cuatro (`gasto_anadir` con justificación)
- Envía la nota de Sevilla a mi responsable (`nota_gasto_enviar`)
- Pide un viaje a Barcelona del 2 al 3 de diciembre para reunirme con el distribuidor, unos 450 € (`viaje_solicitar`)
- Cancela mi viaje a Barcelona (`gastos_resumen` + `viaje_cancelar`)
- *Administración:* ¿Qué notas están aprobadas y pendientes de pago? ¿Cuánto suman? (`pagos_pendientes`; `german`)

## Aprobaciones (responsables y RRHH)

- ¿Qué tengo que aprobar? (`aprobaciones_pendientes`; `andres`)
- ¿Hay alguna solicitud de vacaciones que se solape con otra del equipo? (`aprobaciones_pendientes`)
- ¿Qué gastos lleva la nota de kilometraje de eduardo? (`aprobaciones_pendientes` + `nota_gasto`)
- Aprueba las vacaciones de macarena (`solicitud_resolver`)
- Aprueba la corrección de fichaje de eduardo (`solicitud_resolver`)
- Rechaza el viaje a Barcelona: que lo pida con un presupuesto más ajustado (`solicitud_resolver`, con comentario)
- ¿Qué se ha dicho en la nota de gasto de eduardo? (`solicitud_comentarios`)
- Pregúntale a eduardo si el parking de Toledo fue durante la visita al cliente (`solicitud_comentar`)

## Preguntas que combinan varias cosas

- ¿Puedo cogerme el viernes libre? Mira mi saldo y si alguien del equipo falta ese día.
- Prepárame el cierre del mes: horas, días sin cerrar y gastos pendientes de enviar.
- Antes de irme: ficha la salida y dime cuántas horas llevo esta semana.
- *Responsable:* Hazme un resumen de mi equipo: quién trabaja hoy, quién falta esta semana y qué tengo por aprobar.

## Lo que la IA no hace (a propósito)

Pagar notas de gasto, restaurar los datos de la demo, borrar notas o líneas y exportar ficheros CSV: son acciones
masivas o irreversibles que se hacen en la aplicación, no con una frase. Tampoco puede actuar como otra persona: la
identidad es tu sesión de DX.
