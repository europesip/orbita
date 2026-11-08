# Historial de versiones

[English](CHANGELOG.md) · **Español**

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
