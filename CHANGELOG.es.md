# Historial de versiones

[English](CHANGELOG.md) · **Español**

## Sin publicar · Encuestas

- El pulso de Comunicación con RRHH pasa a ser una aplicación propia, **Encuestas** (página `encuestas`), más
  profesional. Las encuestas y respuestas que ya había se conservan (serie `PULSO`); la pestaña de Comunicación lleva
  ahora a la aplicación nueva.
- **Preparar** (RRHH): **plantillas** (pulso mensual, clima laboral anual, bienestar, teletrabajo y flexibilidad,
  incorporación o en blanco), **ocho tipos de pregunta** (escala de acuerdo, escala de 1 a 5, eNPS, sí o no, opción única,
  opción múltiple, matriz de afirmaciones y texto), preguntas obligatorias u opcionales, **secciones** y diez
  **dimensiones**; **borrador**, **vista previa**, apertura **ya o programada**, **duplicar**, **recordatorio** a quien no
  ha respondido (uno al día como mucho) y cierre. Hasta 30 preguntas.
- **Responder**: paso a paso por secciones, con barra de progreso, borrador en el navegador y pantalla final que explica
  qué pasa con las respuestas.
- **Informe**: participación (total y por departamento), **índice de favorabilidad**, eNPS, **dimensiones** con
  fortalezas y puntos de mejora, **tendencia** frente a la encuesta anterior de la misma serie, **mapa de calor** por
  departamento, resultados de cada pregunta, comentarios con buscador y palabras frecuentes, **resumen por IA** (si el
  asistente está configurado) y exportación a **CSV** e **impresión o PDF**. Un responsable ve solo su departamento.
- **Plan de acción**: RRHH y los responsables publican acciones (dimensión, departamento, responsable, fecha límite y
  estado) que ve quien recibió la encuesta, en un tablero por estado y en el informe.
- El **anonimato por diseño** no cambia: respuestas sin usuario ni hora, mínimo de respuestas para ver cualquier
  resultado y protección frente a la deducción por diferencia.
- **IA**: nueva área **`encuestas`** con `pulso_pendientes`, `pulso_resultados` (ahora con favorabilidad, dimensiones y
  tendencia) y la nueva `encuestas_plan_accion` (ahora **43 herramientas**, unos 7.800 tokens; `readOnly: true` publica
  29). Las herramientas `pulso_*` salen del área `comunicacion`.
- Migración de Flyway **`V6__encuestas.sql`** (columnas nuevas en las tablas del pulso y la tabla `ENCUESTA_ACCION`) y
  datos de demo: clima laboral de este año y del anterior, tres pulsos mensuales, un borrador, una encuesta programada y
  un plan de acción. Probado en PostgreSQL 17 con 70 comprobaciones automáticas y en el navegador.

## Sin publicar · Mis documentos

- Una novena aplicación, **Mis documentos** (página `documentos`, después de Personas), con la documentación de cada
  persona:
  - **Nóminas con sus importes** (bruto, IRPF, Seguridad Social, otras deducciones y neto): la última, comparada con la
    anterior y con el reparto del bruto, y el **año en un gráfico** con sus totales y el tipo medio de IRPF.
  - **Informes de cotización**, **certificados de retenciones**, **contratos**, **certificados** y otros documentos,
    agrupados por año y filtrables por tipo, con un **visor de PDF** y descarga. Lo nuevo se marca hasta que se abre.
  - **Recibí**: quien publica puede pedirlo (los contratos, por defecto); la persona lo firma en el visor y quien lo
    publicó recibe un aviso. Un documento firmado ya no se puede retirar.
  - **Enviar a RRHH**: justificantes, titulaciones, datos bancarios y documentos personales, que RRHH **revisa o
    devuelve** con un motivo (bandeja «Recibidos de la plantilla»).
- **Publicar** (RRHH y Administración): de uno en uno, con los importes de la nómina y el neto calculado, o **en
  lote**: cada PDF se asigna a su persona por el nombre del fichero (usuario de DX o nombre y apellidos) y los importes
  de las nóminas llegan en un CSV (`usuario;bruto;irpf;ss;otras`). Se ve la plantilla con su última nómina y lo que
  falta por abrir o firmar.
- **Privacidad**: cada persona ve solo lo suyo; RRHH y Administración, los documentos de la empresa; lo que envía la
  plantilla, solo RRHH. **El responsable no ve nada de su equipo.** Solo se admiten PDF, JPG y PNG (comprobados por su
  contenido), de hasta 6 MB.
- **Mi intranet** avisa de la nómina nueva y de los documentos por firmar.
- **IA**: nueva área **`documentos`** con **3 herramientas de consulta** (ahora **42**, unos 7.500 tokens;
  `readOnly: true` publica 28): `mis_documentos`, `mis_nominas` («¿cuánto cobré en octubre?») y
  `documentos_por_revisar` (RRHH). Firmar, publicar, enviar o revisar documentos se queda en la aplicación.
- Migración de Flyway **`V5__documentos.sql`** (tablas `DOCUMENTO` y `NOMINA`) y datos de demo: nóminas en PDF de los
  últimos 10 meses con su paga extra, informes de cotización, certificados de retenciones, un contrato por firmar y
  documentos enviados a RRHH en los tres estados. Los PDF los genera ÓRBITA y dicen que son de demostración, sin
  validez. Probado en PostgreSQL 17 con 60 comprobaciones automáticas y en el navegador (con ficheros reales y un lote
  con CSV).

## Sin publicar · Personas

- Una octava aplicación, **Personas** (página `personas`, después de Comunicación), con tres pestañas:
  - **Directorio**: buscador por nombre, puesto, departamento, sede, habilidad o idioma (sin tildes ni mayúsculas), con
    filtros por departamento y por **disponibilidad de hoy**. El anillo del avatar dice si cada persona está en la
    oficina, teletrabajando, en pausa, no disponible o fuera (con la fecha de vuelta).
  - **Organigrama**: el árbol de responsables (`EMPLEADO.RESPONSABLE`), plegable, con buscador; se abre por la rama de
    quien mira.
  - **Reconocimientos**: agradecimientos públicos entre compañeros con un motivo (trabajo en equipo, pasión por el
    cliente, gran idea, siempre ayuda, objetivo cumplido); avisan a la persona y a su responsable, y quien lo envía (o
    RRHH) puede quitarlo.
- **Ficha** de cada persona: contacto (correo, teléfono, extensión, sede y ubicación), antigüedad, línea de
  responsables, equipo, compañeros, perfil (sobre mí, habilidades, idiomas, cumpleaños si lo hace visible) y los
  reconocimientos recibidos. Cada persona **edita su perfil**; **RRHH da de alta** la ficha de un usuario de DX que aún
  no la tiene y cambia los **datos de organización** (puesto, departamento, responsable, rol, sede, días de
  vacaciones), sin permitir círculos en el organigrama ni que RRHH cambie su propio rol.
- **Privacidad**: el directorio no muestra nunca el motivo de una pausa ni el tipo de una ausencia (una baja se ve como
  «fuera»), ni horas de fichaje, PIN o tarjeta; las ausencias pendientes no se publican y el cumpleaños solo aparece si
  la persona lo marca como visible.
- **Celebraciones** de los próximos 30 días (cumpleaños visibles, aniversarios en la empresa e incorporaciones) en el
  directorio, y una tarjeta **Personas** en Mi intranet con el último reconocimiento recibido.
- **IA**: nueva área **`personas`** con **6 herramientas** (ahora **39**, unos 6.900 tokens; `readOnly: true` publica
  25): `persona_buscar`, `persona_ficha`, `organigrama`, `celebraciones`, `reconocimientos` y
  `reconocimiento_enviar`. Editar el perfil y los datos de RRHH se quedan en la aplicación.
- **Iconos propios de cada aplicación** con la marca ÓRBITA (el cuadrado con el degradado azul, la órbita, el satélite
  y un dibujo propio en blanco) en la cabecera, en los accesos de Mi intranet y en los avisos; los iconos pequeños de
  botones y listas siguen siendo los de IBM Carbon que usa DX.
- Migración de Flyway **`V4__personas.sql`** (columnas de contacto y perfil en `EMPLEADO` y la tabla
  `RECONOCIMIENTO`) y datos de demo; restaurar la demo también vacía los reconocimientos. Probado en PostgreSQL 17 con 91
  comprobaciones automáticas y en el navegador (escritorio, móvil, español e inglés).

## Sin publicar · Comunicación con RRHH

- Una séptima aplicación, **Comunicación con RRHH** (página `comunicacion`, después de Aprobaciones), con cuatro
  pestañas: **Comunicados** de RRHH a toda la plantilla, a un departamento o a un rol, con control de lectura,
  **confirmación** opcional con plazo y recordatorio a quien falte; **Consultas a RRHH** privadas (enviada, en curso,
  resuelta; el empleado la valora y puede reabrirla) con **respuestas sugeridas** de las preguntas frecuentes y los
  comunicados mientras se escribe; encuestas de **Pulso** anónimas (1–5, eNPS, texto libre); y las **Preguntas
  frecuentes**, que mantiene RRHH.
- **Privacidad**: una consulta a RRHH solo la ven el empleado y RRHH, **no su responsable**. **Anonimato por diseño**
  en el pulso: las respuestas se guardan sin usuario ni hora, los resultados solo se muestran a partir de un mínimo de
  respuestas (`minimo`, 5 por defecto, nunca menos de 3) y se oculta un departamento si se pudiera deducir por resta. Un
  responsable solo ve su departamento.
- **Mi intranet** muestra una tarjeta de comunicación con RRHH y un acceso directo; los avisos de la campana abren la
  pestaña adecuada.
- **IA**: nueva área **`comunicacion`** con **7 herramientas** (ahora **33 herramientas**, unos 5.800 tokens;
  `readOnly: true` publica 20). `solicitud_comentarios` y `solicitud_comentar` admiten también las consultas a RRHH
  (`clase` = `CONSULTA`). Confirmar un comunicado, responder el pulso y publicar comunicados o encuestas se quedan en la
  aplicación.
- Migración de Flyway **`V3__comunicacion.sql`** (8 tablas nuevas) y datos de demo de la nueva aplicación; restaurar la
  demo también las vacía. Probado en PostgreSQL 17 con 66 comprobaciones automáticas y en el navegador.
- **Aspecto de HCL DX Compose** en las siete aplicaciones, con los valores medidos en su Dashboard, Content Composer
  y Reporting: tipografía Inter (la que carga DX), texto negro al 87 % y 60 %, azul `#0550dc`, bordes grises finos sin
  sombras, botones rectangulares (radio 2 px; el secundario, azul con contorno), etiquetas de estado como el chip
  «Published», títulos de sección en peso normal y cabecera de página plana en blanco. Sin degradados, sin etiquetas
  en mayúsculas y los **iconos IBM Carbon** que usa DX (`web/src/iconos.jsx`, Apache 2.0) en lugar de emojis. La cabecera del theme de ejemplo pasa
  al azul marino del theme Portal 8.5 (`theme.headerBackground: "#002c56"`) y el logotipo de ÓRBITA, al azul de DX (en
  una instalación que ya lo tenga en el DAM, se sube una nueva versión de `company-logo.png` para verlo).
- **Comunicación con RRHH** con diseño de intranet corporativa: comunicados como **noticias** (destacada, columna y
  lista) con las confirmaciones pendientes como **tareas**; el comunicado abierto como una página de noticia con su
  bloque de **acuse de lectura**; consultas con un buscador **«¿En qué podemos ayudarte?»** antes de escribir y una
  **lista de casos** (RRHH empieza en su bandeja); el pulso como un **formulario** de preguntas numeradas, con la
  distribución de respuestas en los resultados; y preguntas frecuentes con **buscador** y secciones plegables.
- **Aún sin versión publicada**: el chart sigue fijando las imágenes 3.1.2, que no contienen esta aplicación. Una nueva
  versión (tag `v*`) debe construir las imágenes antes de instalarla en DX Compose.

## 3.1.2 · 2026-11-08 · DX con OpenID Connect

- ÓRBITA funciona cuando los usuarios de DX entran por **OpenID Connect** (Keycloak, Entra ID...): con el cliente OIDC
  de Liberty la cookie de sesión de DX recibe un nombre generado (`WAS_n...`) en lugar de `LtpaToken2`.
  `dx.sessionCookie` admite ahora varios nombres y prefijos con `*`, por defecto `LtpaToken2,WAS_n*`. Probado con DX
  Compose CF239 y Keycloak 26.8.
- Nuevo valor del chart **`dx.oidcSupport`** (por defecto `true`); con `false` se vuelve al comportamiento de la 3.1.1
  (solo `LtpaToken2` y el login REST). `dx.sessionCookie` queda vacío por defecto (sigue a `dx.oidcSupport`). Para volver
  a la versión anterior: `helm upgrade orbita ... --version 3.1.1 --reuse-values`.
- **Por qué:** con la feature de cliente OIDC, Liberty llama a la cookie de SSO `WAS_n<hash>` y no se puede cambiar (issue
  18803 de Open Liberty); ÓRBITA respondía «no hay sesión de DX» a los usuarios que entraban por Keycloak.
- El paso del tema de la instalación también funciona entonces: entra con el formulario de login del portal cuando el
  login REST de DX responde sin cookie de sesión.

## 3.1.1 · 2026-11-07 · Nada repetido con el theme

- Con el theme de ejemplo, nada aparece dos veces: `ui.header.assistant`, `ui.header.user` y `ui.header.homeLink` son
  `auto` por defecto y ocultan en las aplicaciones el botón del asistente, el usuario y el enlace «Mi intranet» cuando
  el theme ya los muestra.
- **Preguntas frecuentes** en español e inglés ([docs/faq.es.md](docs/faq.es.md)): coste, instalación, theme y DAM, IA
  (también con tu propia IA soberana), idiomas, seguridad, tecnología y servicios.
- **Presentación** de ÓRBITA en español e inglés (PDF, `docs/presentation/`).

## 3.1.0 · 2026-11-06 · Un theme de ejemplo, integrado con el DAM

- **Theme de ÓRBITA** para sus páginas, desplegado por el chart (`theme.*`, activo por defecto): una copia del theme
  Portal 8.5 de HCL DX hecha desde tu propio DX al instalar, con una cabecera de ÓRBITA que muestra el **logo de la
  empresa**, **«Powered by HCL Software»** y un **botón que abre el asistente de ÓRBITA**. Se asigna solo a las páginas
  de ÓRBITA; el resto del portal mantiene su theme. Con `theme.enabled: false` mantienes tu propio theme.
- **Totalmente integrado con el DAM**: las imágenes y los logos del theme se sirven desde una colección del DAM
  (`ÓRBITA`). Se cambian allí, sin código, o se da el logo de la empresa al instalar (`theme.logoBase64`).
  `theme.hclLogo` y `theme.assistantButton` se pueden desactivar.

## 3.0.0 · 2026-11-06 · Asistente propio, en español e inglés

- **Asistente de IA propio de ÓRBITA** (por defecto): el botón «✨ Pregúntale a ÓRBITA» habla con el modelo a través de
  **LiteLLM** con solo las herramientas de ÓRBITA, como el usuario de la sesión de DX. Su prompt es mucho menor que el
  del chat de HCL DX IQ, así que cada pregunta gasta muchos menos tokens. Modelo configurable (`assistant.model`, por
  defecto el mismo alias que HCL DX IQ, `iq-general-purpose`). La integración con HCL DX IQ sigue disponible
  (`assistant.backend: iq`) y está pensada para los profesionales de DX.
- **Español e inglés**: interfaz, mensajes, fechas, importes y avisos en el idioma del perfil de DX de cada usuario
  (`preferredLanguage`), después el de la página y el del navegador. Los avisos se guardan con sus datos y se muestran
  en el idioma de quien los lee. Los datos de la demo siguen en español.
- **Ajustes de cada aplicación en su página**: en el modo edición de DX, «⚙ Ajustes de esta aplicación» elige las
  partes de la cabecera, el pie y el idioma solo para esa instancia. Se mantienen al actualizar.
- Las actualizaciones conservan las páginas que ya existen y su diseño. Los importes se pueden escribir como 12,30 o
  12.30.
- **Desde la 2.x**: el asistente propio necesita un LiteLLM; sin él, usa `assistant.backend: iq` o `none`.

## 2.3.0 · 2026-11-06 · Se adapta a tu tema de DX

- **`ui.header.*` y `ui.footer`** en los valores del chart: elige qué muestran las aplicaciones en su cabecera
  (título, enlace a Mi intranet, asistente de IA, avisos, nombre y rol del usuario) y en el pie, para que nada salga
  dos veces cuando tu tema de DX ya lo muestra. Por defecto se ve todo.
- Documentado cómo instalar **sin páginas** (`pages.create: false`) y colocar tú las Script Applications.
- **Manual ilustrado** en español e inglés (PDF, `docs/manual/`).
- Nueva sección de **Contacto y servicios**: servicios opcionales de EUROPESIP, con el código y los procedimientos
  completos incluidos.

## 2.2.1 · 2026-11-06 · Preguntar en inglés o en español

- El panel «✨ Pregúntale a ÓRBITA» responde en el idioma de cada pregunta (inglés o español; antes, siempre en
  español), y el servidor MCP indica al modelo que responda en el idioma del usuario y traduzca los datos de ÓRBITA.
- Ejemplos en inglés en la documentación en inglés (README, Lab 5).

## 2.2.0 · 2026-11-06 · Elegir las herramientas MCP

- **`mcp.tools`** en los valores del chart: publicar solo algunas áreas o herramientas (`enabled`), quitar algunas
  (`disabled`) o solo las de consulta (`readOnly`). Por defecto, las 26 (unos 4.700 tokens en cada prompt); áreas
  `general`, `fichaje`, `vacaciones`, `gastos`, `aprobaciones`. Una herramienta no publicada tampoco se puede llamar.
- Instalación sin iniciar sesión en el registro (imágenes y chart públicos), y Lab 5 en los
  [labs de HCL DX Compose](https://github.com/europesip/hcl-dx-compose-labs).

## 2.1.0 · 2026-11-06 · La IA hace mucho más

- **Servidor MCP con 26 herramientas** (antes 2): mi día y avisos, fichaje (estado, mes, equipo ahora, **fichar**,
  pedir una corrección), vacaciones (saldo, solicitudes, calendario del equipo, solicitar, cancelar), gastos y viajes
  (resumen, detalle de una nota, **crear una nota, añadir gastos, enviarla**, pedir o cancelar un viaje, pagos
  pendientes para Administración) y aprobaciones (pendientes, **aprobar o rechazar**, leer y escribir comentarios). Todo
  lo que cambia datos pide confirmación antes; pagar, restaurar la demo, borrar y exportar quedan fuera a propósito.
- **Más de 60 preguntas de ejemplo** por áreas: `docs/preguntas-ia.md` (ES) y `docs/ai-questions.md` (EN).
- README: las dos formas de poner IA en ÓRBITA (el Integrator de HCL DX IQ, o un chat propio).
- **Repositorio, imágenes y chart públicos**: ya no hace falta iniciar sesión en el registro ni un Secret de descarga.

## 2.0.0 · 2026-11-06 · Chart de Helm

**Instalación**
- Un chart de Helm, **`hcl-dx-orbita`** (`oci://ghcr.io/europesip/charts`), en lugar de los scripts `k8s/01`–`06`.
  Un Job crea la base de datos, un Deployment ejecuta la API y el subchart `hcl-dx-scriptapp` 0.2.0 sube las seis
  Script Applications y crea las páginas. Sin `kubectl cp`, sin volumen para el código y sin `envsubst`.
- Imágenes construidas y probadas por CI: **`orbita-api`** (Open Liberty 26.0.0.9, Java 21) y **`orbita-scriptapps`**
  (las apps construidas), en `ghcr.io/europesip/orbita`.
- **Necesita PostgreSQL** (con un Secret de superusuario, para que el chart cree su base y su usuario). En las
  siguientes versiones se podrán usar otras bases de datos.

**Usuarios y seguridad**
- **Quién es el usuario lo dice DX**: la API reenvía la cookie de sesión del usuario a la API de perfil de DX. Ya no se
  copian las claves LTPA de la Web Engine de DX, no se replican el LDAP ni el registro básico, y la API no guarda
  credenciales de administrador de DX ni del bind del LDAP.
- **El servidor MCP actúa como el usuario del chat de IQ**, identificado por la sesión de DX que reenvía el
  Integrator. Desaparece el argumento `usuario`: el modelo ya no puede elegir en nombre de quién actúa.
- **Usuarios de la demo por papeles**: la historia se escribe por papeles y cada papel lo hace un usuario de DX que ya
  existe (`demo.people`; por defecto, los usuarios de los labs `patricia`, `andres`, `macarena`, `eduardo`, `enrique`,
  `jordi`, `german`). Ya no se dan de alta usuarios en el OpenLDAP.
- La clave del quiosco la genera el chart (Secret), en lugar de una clave fija en el código.

**Datos**
- **Migraciones Flyway** (`V1__esquema.sql`, …) crean y actualizan el esquema; una actualización nunca borra datos.
  Antes, un cambio de esquema borraba todas las tablas y volvía a cargar la demo.
- Solo PostgreSQL (desaparece Derby, de la época de WebSphere Portal). Base `orbita`, usuario `orbita`.
- Restaurar la demo vacía las tablas (`TRUNCATE`) y vuelve a cargar los datos.

**Código y API**
- Repositorio reorganizado: `api/` (Maven, Java 21, Jakarta EE 10: `core`, `rest`, `mcp`), `web/`, `images/`,
  `chart/`, `docs/`. Paquete `com.europesip.orbita`.
- **API REST `/orbita-api/v1`** con métodos, rutas y códigos HTTP reales (401, 422, 404, 405), descrita en
  `api/rutas.json` y compartida por el servidor y la interfaz. Antes: `POST /suite-api/api` con `op=…`, siempre 200.
- Fuera los restos de WebSphere Portal 8.5: `portlet/java/com/demo/suite`, `web.xml`, `ibm-web-bnd.xml`, Java 8.
- Las páginas del portal y la clave del quiosco las da la API (`GET /v1/config`), no el HTML de las Script
  Applications.

**Licencia**: PolyForm Noncommercial 1.0.0 (código abierto para fines no comerciales: se permite usarlo y modificarlo).

## 1.0.0 · 2026-11-06 · Primera versión para DX Compose

- La suite de intranet de WebSphere Portal 8.5 (portlets JSR 286) migrada a **HCL DX Compose CF238** sin portlets:
  seis Script Applications y un servicio REST, `suite-api`, en Open Liberty 26.0.0.8.
- Instalación con los scripts `k8s/01-construir.sh` … `06-mcp-iq.sh`: construcción local de las WAR (Java 8), alta de
  los empleados en el OpenLDAP de los labs (`lucia.martin`, `javier.gomez`… con contraseña `demo1234`), base
  `suite_intranet` en el PostgreSQL de los labs, WAR copiadas a un volumen con `kubectl cp`, y Script Applications y
  páginas con DXClient.
- SSO con las claves LTPA copiadas de la Web Engine de DX y los registros de DX replicados en el servicio.
- Primer servidor MCP para HCL DX IQ (`vacaciones_saldo`, `vacaciones_solicitar`), con el empleado como argumento.
