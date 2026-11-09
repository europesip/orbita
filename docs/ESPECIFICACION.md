# ÓRBITA · especificación funcional

Suite de aplicaciones de intranet para HCL DX. Cada aplicación es una Script Application; todas comparten usuarios
(los de DX), datos de plantilla, calendario laboral y una bandeja de aprobaciones, a través de la API de ÓRBITA.

## Personas y roles

| Rol | Quién | Qué puede hacer |
|---|---|---|
| Empleado | Toda la plantilla | Fichar, consultar su registro, pedir correcciones y ausencias, ver el calendario de su equipo |
| Responsable | Quien tiene personas a su cargo | Lo anterior + ver el estado de su equipo y aprobar o rechazar sus solicitudes |
| RRHH | Departamento de Personas | Lo anterior + ver a toda la plantilla, exportar el registro de jornada, publicar comunicados y encuestas, atender las consultas y dar de alta y mantener las fichas de la plantilla |
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

Canal entre RRHH y la plantilla, en tres pestañas (la cuarta, «Encuestas», lleva a la aplicación Encuestas).

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

**Preguntas frecuentes**: las mantiene RRHH (crear, editar, borrar); alimentan las respuestas sugeridas de las consultas.

En **Mi intranet**, una tarjeta muestra el comunicado por confirmar, la encuesta pendiente y las consultas abiertas (para
RRHH, las consultas sin atender de la plantilla), con un acceso directo y el contador «n comunicados por confirmar». Los
avisos de la campana abren la pestaña que corresponde.

## Encuestas

Encuestas de clima **anónimas**, en cuatro pestañas: Mis encuestas, Resultados (RRHH y responsables), Gestionar (RRHH)
y Plan de acción.

**Preparar** (RRHH)
- Desde una **plantilla** (pulso mensual, clima laboral anual, bienestar, teletrabajo y flexibilidad, incorporación) o en
  blanco. Hasta 30 preguntas de **ocho tipos**: escala de acuerdo (de «totalmente en desacuerdo» a «totalmente de
  acuerdo»), escala de 1 a 5, eNPS (0 a 10), sí o no, opción única, opción múltiple, matriz de afirmaciones (cada una de
  1 a 5) y texto libre. Cada pregunta puede ser obligatoria u opcional e ir en una **sección** y una **dimensión**
  (compromiso, liderazgo, carga de trabajo, bienestar, reconocimiento, desarrollo, comunicación, medios y herramientas,
  equipo, flexibilidad).
- Ajustes: destinatarios (toda la plantilla, un departamento o un rol), mínimo de respuestas para ver resultados (5 por
  defecto, nunca menos de 3), fecha de cierre, **serie** (las encuestas de la misma serie se comparan) y mensaje final.
- **Borrador**, **vista previa** tal como la verá la plantilla, y publicación **ya** o **programada** para una fecha y
  hora (se abre sola y avisa a los destinatarios). Una encuesta abierta ya no se cambia; se puede **duplicar** (para
  repetir el pulso cada mes), **recordar** a quien no ha respondido (como mucho una vez al día) y **cerrar**.

**Responder**: paso a paso por secciones, con barra de progreso, preguntas obligatorias marcadas y las respuestas
guardadas en el navegador hasta enviarlas. Al terminar, una pantalla explica qué pasa con ellas.

**Anonimato por diseño**: las respuestas se guardan sin usuario ni hora (solo un identificador aleatorio de envío y el
departamento); aparte solo se anota quién ha respondido, para no preguntárselo dos veces y para los recordatorios. Un
resultado (el total o un departamento) solo se muestra con el mínimo de respuestas, y un departamento se oculta también
si se pudiera deducir restando los demás del total. La IA no puede responder encuestas.

**Informe** (RRHH ve todo; un responsable, solo su departamento y sin comentarios)
- Participación (total y por departamento), **índice de favorabilidad** (porcentaje de respuestas 4 y 5 de las
  escalas), **eNPS** y su **tendencia** frente a la encuesta anterior de la misma serie.
- **Dimensiones** ordenadas, con la fortaleza y los puntos a mejorar y su variación; **mapa de calor** de departamentos
  por dimensión.
- Resultados de cada pregunta por secciones: barras de desfavorable, neutral y favorable con la media; cada afirmación
  de las matrices; porcentajes de las opciones; sí o no; eNPS con promotores, pasivos y detractores.
- **Comentarios** (solo RRHH): barajados, con buscador, las palabras que más se repiten y, si el asistente está
  configurado, un **resumen por IA** de los temas.
- Exportación a **CSV** (resultados agregados, nunca respuestas individuales) e **impresión o PDF** del informe.

**Plan de acción**: RRHH (para toda la plantilla o un departamento) y los responsables (para su departamento) publican
acciones con dimensión, responsable, fecha límite y estado (pendiente, en curso, hecha). Las ve quien recibió la
encuesta; quien la lleva recibe un aviso. Se ven en un tablero por estado y en el informe de cada encuesta.

## Personas

Directorio de la plantilla, en tres pestañas.

**Directorio**
- Buscador por nombre, puesto, departamento, sede, habilidad o idioma (sin tildes ni mayúsculas; todas las palabras
  deben coincidir) y filtros por departamento y por disponibilidad de hoy.
- Cada persona es una tarjeta con su avatar, puesto, departamento, sede, habilidades principales, correo, teléfono,
  extensión y cuántas personas tiene a su cargo. El **anillo del avatar** dice su disponibilidad de hoy: en la oficina,
  teletrabajando, en pausa, no disponible (ha salido o aún no ha entrado) o fuera, con la fecha en que vuelve.
- **Privacidad**: la disponibilidad sale del fichaje y de las ausencias aprobadas, pero no dice nunca el motivo de una
  pausa ni el tipo de una ausencia (una baja médica se ve igual que unas vacaciones), ni horas de fichaje, PIN o
  tarjeta. Las ausencias pendientes no se publican.
- **Celebraciones** de los próximos 30 días: cumpleaños (solo de quien lo hace visible), aniversarios en la empresa e
  incorporaciones recientes o próximas.

**Ficha** de cada persona: contacto, sede y ubicación, antigüedad, **línea de responsables** (de arriba hasta ella),
su equipo, sus compañeros (mismo responsable), sobre mí, habilidades, idiomas y los reconocimientos que ha recibido.
- Cada persona **edita su perfil**: teléfono, extensión, ubicación, sobre mí, habilidades (como mucho 15), idiomas y
  cumpleaños (día y mes, sin año), que decide si es visible.
- **RRHH** da de **alta** la ficha de un usuario de DX que aún no la tiene (sin ficha, DX le deja entrar pero ÓRBITA
  no) y cambia los **datos de organización**: nombre, puesto, departamento, responsable, rol, correo, sede,
  incorporación y días de vacaciones y de asuntos propios. No se permiten círculos en el organigrama (que alguien
  dependa de una persona de su propio equipo) y RRHH no puede cambiar su propio rol. Cuando cambia el responsable,
  avisan a la persona y a su nuevo responsable; sus solicitudes pendientes pasan a la bandeja del nuevo.

**Organigrama**: el árbol de responsables, plegable y con buscador; se abre por la rama de quien mira y cada persona
muestra cuántas tiene por debajo.

**Reconocimientos**: agradecimientos públicos entre compañeros con un motivo (trabajo en equipo, pasión por el cliente,
gran idea, siempre ayuda, objetivo cumplido) y un mensaje. Avisan a la persona y a su responsable; no se puede uno
reconocer a sí mismo; quien lo envía o RRHH pueden quitarlo. En **Mi intranet** se ve el último reconocimiento
recibido y las celebraciones de las dos próximas semanas.

## Mis documentos

La documentación de cada persona, en tres pestañas (cuatro para RRHH).

**Mis documentos**
- **Última nómina**: el neto grande, la diferencia con el mes anterior y el reparto del bruto (neto, IRPF, Seguridad
  Social y otras deducciones). **El año**: el neto de cada mes en un gráfico (con la paga extra en su mes) y los totales
  de bruto, IRPF (con el tipo medio), Seguridad Social y neto.
- **Documentos de la empresa**: nóminas, informes de cotización, certificados de retenciones, contratos, certificados y
  otros, agrupados por año y filtrables por tipo y año. Lo que la persona aún no ha abierto se marca como nuevo.
- **Visor** del PDF (o de la imagen) con descarga y apertura en otra pestaña; en las nóminas, sus importes arriba.
- **Recibí**: si quien publica lo pide (los contratos, por defecto), la persona lo firma en el visor («con el recibí
  confirmas que lo has recibido, no que estés de acuerdo»). Quien lo publicó recibe un aviso. Lo pendiente aparece
  como tarea arriba de todo.

**Enviar a RRHH**: justificantes, titulaciones, datos bancarios, documentos personales u otros, con título y
comentario. Estados: pendiente → revisado o devuelto (con el motivo de RRHH). Lo pendiente se puede retirar. Solo lo
ve RRHH, no el responsable ni Administración.

**Publicar** (RRHH y Administración)
- **De uno en uno**: persona, tipo, mes (o año en las retenciones), título, fichero, nota y si se pide el recibí. Las
  nóminas llevan sus importes (bruto, IRPF, Seguridad Social y otras deducciones; el neto se calcula y, si llega, tiene
  que cuadrar) y si son paga extra. No puede haber dos nóminas ordinarias (ni dos extras) de la misma persona y mes.
- **En lote**: un PDF por persona. Cada fichero se asigna por su nombre, que contiene el usuario de DX o el nombre y
  apellidos; los importes de las nóminas llegan en un CSV `usuario;bruto;irpf;ss;otras`. Antes de publicar se revisa (y
  se corrige) a quién va cada fichero; los que no tienen persona no se publican.
- La **plantilla** con la última nómina de cada persona (marcada si va atrasada), lo que tiene sin abrir y sin firmar,
  y sus documentos; y lo **publicado últimamente**. Se puede retirar un documento mientras no tenga el recibí firmado.

**Recibidos de la plantilla** (RRHH): lo que envía la plantilla, para revisarlo o devolverlo con un motivo.

**Privacidad**: cada persona ve solo lo suyo; RRHH y Administración ven los documentos de la empresa de toda la
plantilla (abrirlos no los marca como leídos); lo que envía la plantilla, solo RRHH. El responsable no ve nada de su
equipo. Solo se admiten PDF, JPG y PNG, comprobados por su contenido, de hasta 6 MB. En **Mi intranet**, una
insignia avisa de la nómina nueva y otra de los documentos por firmar.

## Datos de demostración

Empresa ficticia con dos equipos (Ventas y Tecnología), Dirección de Personas y Administración: fichajes de las
últimas semanas, vacaciones disfrutadas y pendientes, un día sin fichaje de salida y solicitudes esperando aprobación.

Comunicación con RRHH: RRHH ha publicado la «Nueva política de teletrabajo», que hay que confirmar en 10 días (Lucía no
la ha abierto; Javier la ha leído pero no la ha confirmado); Tecnología tiene por confirmar un comunicado de formación
obligatoria en seguridad; además, «Calendario laboral», «Revisión médica anual» y «Cena de empresa de fin de año».
Javier tiene una consulta de nómina (IRPF) en curso con RRHH; David acaba de preguntar cómo cambiar su cuenta bancaria
(sin atender); Lucía tiene una resuelta y valorada con un 5. Hay 7 preguntas frecuentes.

Encuestas: el clima laboral del año pasado y el de este año (cerradas, respondidas por toda la plantilla): este año
mejoran casi todas las dimensiones salvo la carga de trabajo de Tecnología, hay comentarios y un plan de acción con tres
acciones (una en curso, una pendiente para Tecnología y una hecha). Los pulsos de los dos meses anteriores están
cerrados y el de este mes, abierto: Lucía aún no lo ha respondido. Hay además un borrador («Teletrabajo: seis meses
después») y una encuesta de bienestar programada para dentro de una semana.

Personas: cada persona tiene contacto, sede (Madrid o Valencia), habilidades, idiomas y unas líneas sobre sí. Javier
cumple años hoy y Elena dentro de 3 días (los dos lo muestran; Lucía no); Carlos cumple 5 años en la empresa dentro de
6 días y Rosa 10 dentro de 19; Pablo se incorporó hace 18 días. Hay 7 reconocimientos: el último de Lucía se lo hizo
Carlos hace 2 días («Pasión por el cliente») y lo tiene sin leer en la campana.

Mis documentos: toda la plantilla tiene sus nóminas de los últimos 10 meses (con la paga extra de junio o diciembre),
los informes de cotización de los tres últimos meses y el certificado de retenciones del año pasado; la nómina del
último mes está sin abrir. Pablo, recién incorporado, cobra solo sus días y tiene el contrato por firmar. Javier tiene un
certificado de empresa para el banco. Lucía ha enviado un justificante médico (pendiente), David su certificación en
Kubernetes (revisada) y Javier sus datos bancarios (devueltos: el titular no coincide). Todos los PDF los genera ÓRBITA
y dicen en rojo que son de demostración y no tienen validez.

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
   responde el pulso del mes en Encuestas.
2. **David** (`jordi`) empieza a escribir una consulta y ve las respuestas sugeridas de las preguntas frecuentes.
3. **Ana (RRHH**, `patricia`**)** ve quién falta por confirmar la política y le envía un recordatorio, responde la
   consulta de David.

**Encuestas** (3 minutos más):
1. **Ana (RRHH**, `patricia`**)** abre el informe del clima laboral de este año: el índice sube frente al año pasado, la
   carga de trabajo es el punto a mejorar y en el mapa de calor solo se ve Tecnología (el resto, oculto por anonimato).
2. Ana crea una encuesta desde la plantilla «Pulso mensual», la revisa en la vista previa y la programa.
3. **Lucía** ve en Plan de acción qué se está haciendo con la encuesta de clima.

**Mis documentos** (2 minutos más):
1. **Lucía** (`macarena`) ve su nómina de octubre, cuánto lleva cobrado en el año y su IRPF medio, y la abre en el visor.
2. **Pablo** firma el recibí de su contrato; **Ana (RRHH**, `patricia`**)** recibe el aviso.
3. **Rosa (Administración**, `german`**)** publica en lote las nóminas del mes con su CSV de importes.

**Personas** (2 minutos más):
1. **Lucía** (`macarena`) busca «kubernetes» en el directorio y ve a Marta y a David con su disponibilidad de hoy;
   abre la ficha de David (línea de responsables, equipo, reconocimientos) y le da las gracias («Gran idea»).
2. **Marta** (`enrique`), su responsable, recibe el aviso; en el organigrama ve su equipo.
3. **Ana (RRHH**, `patricia`**)** da de alta a una persona nueva en Tecnología y cambia su responsable; intentar que
   Marta dependa de David da un aviso: crearía un círculo en el organigrama.

## Técnica

- Diez Script Applications de HCL DX (interfaz React) y una API REST propia (`orbita-api`, Open Liberty) en el mismo
  host que DX; la API sabe quién es el usuario preguntándoselo a DX con su cookie de sesión.
- Base de datos PostgreSQL con migraciones Flyway.
- Servidor MCP para HCL DX IQ en el mismo servidor, que actúa como el usuario del chat.
- Instalación con un chart de Helm: base de datos, API, Script Applications y páginas.
