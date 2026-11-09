# ÓRBITA · especificación funcional

Suite de aplicaciones de intranet para HCL DX. Cada aplicación es una Script Application; todas comparten usuarios
(los de DX), datos de plantilla, calendario laboral y una bandeja de aprobaciones, a través de la API de ÓRBITA.

## Personas y roles

| Rol | Quién | Qué puede hacer |
|---|---|---|
| Empleado | Toda la plantilla | Fichar, consultar su registro, pedir correcciones y ausencias, ver el calendario de su equipo |
| Responsable | Quien tiene personas a su cargo | Lo anterior + ver el estado de su equipo y aprobar o rechazar sus solicitudes |
| RRHH | Departamento de Personas | Lo anterior + ver a toda la plantilla, exportar el registro de jornada, publicar comunicados y encuestas y atender las consultas |
| Administración | Contabilidad | Lo de empleado + pagar las notas de gasto aprobadas y exportarlas a contabilidad |

El responsable de cada persona y su rol se guardan en la ficha de empleado de la suite. Quien no tiene responsable
(dirección) tiene sus solicitudes aprobadas automáticamente.

## Calendario laboral

- Jornada teórica: lunes a jueves 8 h, viernes 7 h (39 h semanales).
- Festivos nacionales cargados; RRHH puede añadir los autonómicos y locales.
- Días laborables = lunes a viernes que no son festivo.

## Fichaje (registro de jornada)

Cumple el registro diario de jornada (Real Decreto-ley 8/2019): hora de inicio y fin de cada día, conservado y
disponible para la persona, sus representantes y la Inspección de Trabajo.

**Fichar** (siguiendo el patrón habitual de las aplicaciones de control horario, con diseño propio)
- Un único botón redondo que cambia según el estado: *Entrar* (fuera) · *Salir* (trabajando) · *Volver* (en pausa), con
  un anillo que muestra la parte de la jornada ya cumplida.
- **Pausas con motivo (incidencias)**: desayuno, comida, gestión personal y otro motivo no cuentan como trabajo; médico
  y visita a cliente son **retribuidas** y cuentan como tiempo de trabajo.
- **Ubicación** de cada fichaje (geolocalización del navegador, con su precisión y enlace al mapa); si no está
  disponible se ficha igualmente.
- Modalidad al entrar: oficina o teletrabajo.
- **Mi jornada de hoy**: línea de tiempo del día (trabajo, pausas, incidencias retribuidas, hora actual y salida
  prevista) y lista de marcajes con modalidad, origen (web, quiosco, corrección) y ubicación.
- Indicadores: trabajado hoy, semana, **saldo del mes** (bolsa de horas) e incidencias de fichaje sin resolver.

**Mi registro**
- Calendario del mes día a día: línea de tiempo de la jornada, entrada, salida, pausas, total, modalidad y estado
  (completo, incompleto, sin fichaje, ausencia, festivo, incidencias retribuidas).
- Total del mes frente a las horas teóricas.
- Los fichajes no se modifican ni se borran: un error se arregla con una **solicitud de corrección** (día, tipo de
  marca, hora y motivo) que aprueba el responsable. La marca corregida queda identificada como corrección.
- Descarga del registro del mes en CSV.

**Equipo** (responsables y RRHH): quién está trabajando, en pausa o fuera ahora mismo, horas de hoy y de la semana.

**Informes** (RRHH): exportación del registro de jornada de toda la plantilla por mes.

## Vacaciones y ausencias

**Saldo** del año: 22 días laborables de vacaciones y 2 de asuntos propios (configurable por persona); se muestran
disponibles, disfrutados y pendientes de aprobar.

**Tipos**: vacaciones y asuntos propios (descuentan saldo), permiso retribuido y baja médica (no descuentan).

**Solicitar**
- Fechas desde / hasta; la aplicación calcula los días laborables (sin fines de semana ni festivos).
- Validaciones: fechas futuras, saldo suficiente, sin solaparse con otra ausencia.
- Estados: pendiente → aprobada / rechazada (con comentario del responsable) · cancelada por la persona.

**Cabecera** (diseño propio): anillo con los
días disfrutados, pendientes y por planificar; asuntos propios; días esperando aprobación y cuenta atrás hasta la
próxima ausencia.

**Mi año**: los 12 meses de un vistazo con las ausencias por color (pendientes rayadas), festivos y un punto en los días
en que falta alguien del equipo. Se piden días **arrastrando sobre el calendario**; la solicitud avisa de qué
compañeros coinciden.

**Cuadrante del equipo**: mes con una fila por compañero (con avatar); ausencias aprobadas y pendientes, fines de semana
y festivos.

## Gastos y viajes

**Notas de gasto**: una nota agrupa los gastos de un periodo o de un viaje. Cada línea lleva fecha, categoría,
descripción, importe (IVA incluido), IVA (opcional) y foto o PDF del ticket.

| Categoría | Política |
|---|---|
| Comidas | Hasta 30 € por comida |
| Alojamiento | Hasta 120 € por noche |
| Transporte (tren, avión, taxi) | Sin límite |
| Kilometraje | 0,26 € por km (se calcula a partir de los kilómetros) |
| Parking y peajes | Sin límite |
| Otros | Hasta 50 € |

- Si una línea supera la política hay que justificarla para poder enviar la nota; el responsable lo ve marcado.
- Estados: borrador → enviada → aprobada (o rechazada, con comentario) → pagada. Una nota rechazada se puede corregir
  y volver a enviar.
- **Solicitud de viaje** previa: destino, motivo, fechas e importe estimado; la aprueba el responsable y las notas de
  ese viaje quedan asociadas a él.
- Resumen personal: pendiente de aprobar, pendiente de cobro y cobrado en el año.

**Diseño** (diseño propio): tarjeta de empresa con lo
gastado en el año; el dinero como flujo (en aprobación → por cobrar → cobrado); botón **Escanear ticket** que abre
directamente la foto del ticket en el borrador del mes; gasto por categoría y de los últimos seis meses; notas como
tarjetas con su progreso y miniaturas de los tickets; viajes como **tarjeta de embarque** con presupuesto frente a gastado.

**Pagos** (Administración y RRHH): notas aprobadas pendientes de pago, marcar como pagadas (una o varias) y exportar a
contabilidad en CSV las líneas pagadas del mes (base imponible, IVA y total).

## Para toda la suite

- **Mi intranet**: página de inicio con el día de un vistazo (fichaje rápido, horas de las últimas semanas, vacaciones,
  gastos por categoría, pendientes de aprobar, ausencias del equipo y avisos).
- **Avisos** en la cabecera de cada aplicación cuando alguien pide, aprueba, rechaza, comenta o paga.
- **Conversación** en cada solicitud: el responsable pregunta («¿me pasas el ticket del peaje?») sin rechazarla.
- **Quiosco de fichaje**: tablet en la entrada donde se ficha con PIN o con el código QR de la tarjeta, sin iniciar sesión.
- **Lectura automática de tickets** (OCR): al subir la foto se rellenan comercio, fecha, importe, IVA y categoría.

## Aprobaciones

Bandeja única del responsable con las solicitudes de su equipo: ausencias, correcciones de fichaje, notas de gasto
(con sus líneas, tickets y avisos de política) y solicitudes de viaje.
- Cada solicitud muestra quién, qué, cuándo, días, saldo que le quedaría y **cuántas personas del equipo faltan esos
  días**.
- Aprobar o rechazar con comentario; historial de lo resuelto.

## Comunicación con RRHH

Canal entre RRHH y la plantilla, en cuatro pestañas.

**Comunicados**
- RRHH publica un comunicado para **toda la plantilla**, un **departamento** o un **rol**, con categoría (política,
  aviso, evento, beneficio) y un enlace opcional (`https://` o una ruta del portal que empiece por `/`).
- Puede pedir **confirmación** («He leído y acepto»), con un plazo opcional. Cada destinatario recibe un aviso en la
  campana.
- RRHH ve quién lo ha leído y quién lo ha confirmado, envía un **recordatorio** a quien falta y archiva los comunicados
  que ya no aplican.

**Consultas a RRHH**
- El empleado envía una consulta privada con categoría (nómina, certificados, datos personales, contrato y jornada,
  formación, otra). **Solo la ven el empleado y RRHH, no su responsable.**
- Mientras escribe, la aplicación le **sugiere respuestas** de las preguntas frecuentes y de los comunicados, de modo que
  muchas consultas no llegan a enviarse.
- Estados: abierta (enviada; RRHH la ve «sin atender») → en curso → resuelta. Se habla en la conversación de la
  consulta; cuando RRHH comenta una consulta abierta, pasa a en curso y queda asignada a esa persona. RRHH la resuelve
  con una respuesta final; el empleado la **valora** de 1 a 5 y puede **reabrirla**.

**Pulso**
- Encuestas cortas y **anónimas** de RRHH: hasta 10 preguntas de escala 1–5, eNPS (0–10) y texto libre opcional.
- **Anonimato por diseño**: las respuestas se guardan sin usuario ni hora (solo un identificador aleatorio de envío y
  el departamento); aparte, solo se anota quién ha respondido, para no preguntárselo dos veces.
- Los resultados (total, por departamento y comentarios) solo se muestran a partir de un **mínimo de respuestas** (5 por
  defecto, nunca menos de 3). Un departamento también se oculta si se pudiera deducir restando los demás del total.
- RRHH ve el total, los departamentos y los comentarios; un responsable, solo su departamento. La IA no puede responder
  encuestas: el anonimato no puede pasar por el chat.

**Preguntas frecuentes**: las mantiene RRHH (crear, editar, borrar); alimentan las respuestas sugeridas de las consultas.

En **Mi intranet**, una tarjeta muestra el comunicado por confirmar, el pulso pendiente y las consultas abiertas (para
RRHH, las consultas sin atender de la plantilla), con un acceso directo y el contador «n comunicados por confirmar». Los
avisos de la campana abren la pestaña que corresponde.

## Datos de demostración

Empresa ficticia con dos equipos (Ventas y Tecnología), Dirección de Personas y Administración: fichajes de las
últimas semanas, vacaciones disfrutadas y pendientes, un día sin fichaje de salida y solicitudes esperando aprobación.

Comunicación con RRHH: RRHH ha publicado la «Nueva política de teletrabajo», que hay que confirmar en 10 días (Lucía no
la ha abierto; Javier la ha leído pero no la ha confirmado); Tecnología tiene por confirmar un comunicado de formación
obligatoria en seguridad; además, «Calendario laboral», «Revisión médica anual» y «Cena de empresa de fin de año».
Javier tiene una consulta de nómina (IRPF) en curso con RRHH; David acaba de preguntar cómo cambiar su cuenta bancaria
(sin atender); Lucía tiene una resuelta y valorada con un 5. El «Pulso de octubre» está cerrado y con resultados
(Tecnología llega al mínimo de 4 respuestas; los demás departamentos no) y el «Pulso de noviembre» está abierto, sin
respuesta de Lucía. Hay 7 preguntas frecuentes.

La historia se escribe por **papeles**; cada papel lo hace un usuario de DX que ya existe (valor `demo.people` del
chart). Los nombres del recorrido de abajo son los de la historia; entre paréntesis, quién los hace en los labs.

| Papel | En la historia | En los labs | Rol |
|---|---|---|---|
| `rrhh` | Ana · Directora de Personas | `patricia` | RRHH (responsable de los dos jefes de equipo y de Administración) |
| `ventas-responsable` | Carlos · Responsable de Ventas | `andres` | Responsable |
| `ventas-1` | Lucía · Comercial | `macarena` | Empleada |
| `ventas-2` | Javier · Comercial | `eduardo` | Empleado |
| `tecnologia-responsable` | Marta · Responsable de Tecnología | `enrique` | Responsable |
| `tecnologia-1` | David · Desarrollador | `jordi` | Empleado |
| `tecnologia-2` | Elena · Diseñadora | (ficticia) | Empleada |
| `tecnologia-3` | Pablo · Soporte | (ficticio) | Empleado |
| `administracion` | Rosa · Responsable de Administración | `german` | Administración (pagos) |

Las contraseñas son las de cada usuario en el directorio de DX (en los labs, las del OpenLDAP del Lab 2A).

## Recorrido de la demo (5 minutos)

1. **Lucía** (`macarena`) ficha la entrada en teletrabajo, ve su semana y detecta un día sin salida → pide la corrección.
2. Pide vacaciones: la aplicación calcula los días y descuenta el saldo como pendiente.
3. **Carlos** (`andres`) ve en *Aprobaciones* la corrección y las vacaciones (con el aviso de que Javier ha pedido los mismos
   días) y las aprueba; en *Equipo* ve quién está trabajando.
4. **Ana (RRHH**, `patricia`**)** descarga el registro de jornada del mes de toda la plantilla.

**Gastos** (3 minutos más):
1. **Lucía** abre su borrador de comidas con clientes: una comida supera los 30 €, la justifica, añade un taxi con la
   foto del ticket y envía la nota a Carlos.
2. **Carlos** la ve en *Aprobaciones* junto a la nota de kilometraje y la solicitud de viaje de Javier, abre los
   tickets y aprueba.
3. **Rosa (Administración**, `german`**)** marca las notas aprobadas como pagadas y exporta el fichero para contabilidad.

**Comunicación con RRHH** (3 minutos más):
1. **Lucía** (`macarena`) ve en *Mi intranet* la nueva política de teletrabajo por confirmar, la lee y la confirma;
   responde el pulso de noviembre.
2. **David** (`jordi`) empieza a escribir una consulta y ve las respuestas sugeridas de las preguntas frecuentes.
3. **Ana (RRHH**, `patricia`**)** ve quién falta por confirmar la política y le envía un recordatorio, responde la
   consulta de David y revisa los resultados del pulso de octubre (solo Tecnología llega al mínimo).

## Técnica

- Siete Script Applications de HCL DX (interfaz React) y una API REST propia (`orbita-api`, Open Liberty) en el mismo
  host que DX; la API sabe quién es el usuario preguntándoselo a DX con su cookie de sesión.
- Base de datos PostgreSQL con migraciones Flyway.
- Servidor MCP para HCL DX IQ en el mismo servidor, que actúa como el usuario del chat.
- Instalación con un chart de Helm: base de datos, API, Script Applications y páginas.
