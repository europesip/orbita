<p align="center"><img src="marca/orbita-logo.svg" alt="ÓRBITA" width="430"></p>

# ÓRBITA · Fichaje, Vacaciones, Gastos y Aprobaciones

**ÓRBITA** es una suite de intranet para **HCL DX Compose 9.5 CF238**: la interfaz React se publica como **Script Applications**
y la lógica y los datos son un servicio REST (**`suite-api`**, Open Liberty) con PostgreSQL. Qué hace cada aplicación:
[ESPECIFICACION.md](ESPECIFICACION.md). Instalación y detalles del despliegue: [k8s/README.md](k8s/README.md).

Las aplicaciones vienen de WebSphere Portal 8.5 (portlets JSR 286), migradas a DX Compose sin portlets.

| Página (solo usuarios autenticados) | URL en el entorno de los labs |
|---|---|
| Mi intranet | https://dx-demo.127.0.0.1.nip.io/wps/myportal/Home/mi-intranet |
| Fichaje | https://dx-demo.127.0.0.1.nip.io/wps/myportal/Home/fichaje |
| Vacaciones | https://dx-demo.127.0.0.1.nip.io/wps/myportal/Home/vacaciones |
| Gastos y viajes | https://dx-demo.127.0.0.1.nip.io/wps/myportal/Home/gastos |
| Aprobaciones | https://dx-demo.127.0.0.1.nip.io/wps/myportal/Home/aprobaciones |
| Quiosco de fichaje | https://dx-demo.127.0.0.1.nip.io/wps/myportal/Home/quiosco |

Usuarios de demo (en el OpenLDAP del Lab 2A), contraseña `demo1234`: `lucia.martin`, `javier.gomez`, `carlos.ruiz`,
`marta.sanchez`, `david.lopez`, `elena.navarro`, `pablo.diaz`, `rosa.molina` (Administración, pagos). `wpsadmin` es
Ana Torres (RRHH).

PIN de quiosco: Lucía `1111`, Javier `2222`, David `3333`, Elena `4444`, Pablo `5555`, Ana `1000`, Carlos `2001`,
Marta `3001`, Rosa `6001` (cada persona ve su PIN y su tarjeta QR en *Fichaje › Mi tarjeta de quiosco*).

Para repetir la demo desde cero: `wpsadmin` › *Fichaje* › *Informes* › **Restaurar datos de demostración**. Los datos
son relativos al día en que se cargan (fichajes de las últimas siete semanas, vacaciones próximas…).

## Funciones transversales

- **Asistente «✨ Pregúntale a ÓRBITA»** (cabecera de todas las aplicaciones): chat con HCL DX IQ en un panel
  lateral, con la sesión del portal. Sabe quién es el usuario conectado y responde con las herramientas del MCP de
  ÓRBITA («¿cuántas vacaciones me quedan?», «pídeme del 9 al 11 de diciembre»…). Código: `src/asistente.jsx`.
- **Mi intranet**: saludo con fichaje rápido, horas de las últimas seis semanas, saldo de vacaciones, gastos del año por
  categoría, solicitudes por aprobar, quién falta los próximos 14 días y últimos avisos.
- **Avisos** (campana de la cabecera): al pedir, aprobar, rechazar, comentar y pagar; enlazan a la aplicación.
- **Conversación** en ausencias, notas de gasto y viajes: preguntar o aclarar sin rechazar la solicitud.
- **Quiosco de fichaje**: tablet en la entrada (con sesión iniciada); cada persona ficha con su PIN o el QR de su
  tarjeta (cámara con BarcodeDetector o jsQR). Las marcas quedan con origen «Quiosco». El dispositivo se identifica con
  una clave (`Kiosco.CLAVE`) contra `/suite-api/publico`.
- **Lectura automática de tickets**: OCR en el navegador con Tesseract.js (Apache 2.0); la foto no se envía a ningún
  servicio, pero el navegador necesita internet la primera vez para descargar el motor y el modelo de español.
  `src/ocr.js` interpreta comercio, fecha, total, IVA y categoría.

## Arquitectura en DX Compose

| Pieza | Dónde |
|---|---|
| Interfaz React | Una Script Application por aplicación (WCM: *Script Application Library › Script Applications*), en su página bajo *Home* |
| Lógica y datos | `suite-api` en `dx-shared`, publicado en `https://<DX_HOST>/suite-api` (`/api` con sesión, `/publico` para el quiosco) |
| Sesión | SSO con LTPA: la API acepta la cookie del portal |
| Usuarios | LDAP de DX Compose (OpenLDAP del Lab 2A) |
| Base de datos | `suite_intranet` en el PostgreSQL 18 del Lab 2B (`jdbc/suiteIntranet`) |
| Servidor MCP (IA) | `POST /mcp` y `GET /probe/ready` en el puerto 9081 del mismo servidor, solo dentro del clúster: ver [mcp/README.md](mcp/README.md) |

## Marca

Icono y logotipo en `marca/` (`orbita.svg`, `orbita-logo.svg`); en la interfaz, `src/marca.jsx` (SVG en línea).
Los nombres técnicos (`suite-api`, `suite_intranet`, carpeta `suite/`) se mantienen.

## Estructura

- `src/`: interfaz React (`Inicio.jsx`, `Fichaje.jsx`, `Vacaciones.jsx`, `Gastos.jsx`, `Aprobaciones.jsx`,
  `Kiosco.jsx`; piezas comunes en `ui.jsx`, `graficos.jsx`, `social.jsx`); estilos encerrados en `.si-app`
  (`suite.css`). `main.jsx` monta la aplicación indicada por `data-app` en cada contenedor `.si-app`.
- `vite.scriptapp.config.js` + `scripts/scriptapps.mjs`: empaquetan un único `suite.js`/`suite.css` y generan las
  Script Applications en `build/scriptapps/` (`npm run build:scriptapps`).
- `portlet/java/com/demo/suite/`: lógica sin dependencias del contenedor (el nombre de la carpeta viene de Portal 8.5):
  `Despachador` (entrada única), `Api` (lógica y permisos), `Db` (esquema; PostgreSQL o Derby), `Demo` (datos de
  demostración), `Calendario` (jornada teórica y festivos), `Gastos` (notas, líneas, tickets, política, viajes y
  pagos; importes en céntimos), `Social` (comentarios y avisos), `Kiosco` y `Ticket` (tickets de ejemplo en PNG).
- `rest/`: `ApiServlet` (servicio REST) y su `web.xml`.
- `mcp/`: servidor MCP para asistentes de IA (`orbita-mcp.war`): protocolo, catálogo de herramientas y su guía
  ([mcp/README.md](mcp/README.md)).
- `k8s/`: construcción y despliegue en el clúster (scripts `01`–`05`, `99-verificar.sh`), `server.xml` de Liberty,
  manifiestos y `api.http` (pruebas con REST Client).

## Desarrollo

Desde VS Code (tareas del workspace de trabajo, si lo tienes) o con los scripts:

- Cambio de interfaz: tarea **ÓRBITA: cambio de interfaz (React → DX)** (`npm run build:scriptapps` →
  `k8s/01-construir.sh` → `k8s/05-scriptapps.sh`).
- Cambio de Java: tarea **ÓRBITA: cambio de Java (→ suite-api)** (`k8s/01-construir.sh` → `k8s/04-api.sh`).
- Servidor MCP: tarea **ÓRBITA: cambio del MCP (→ orbita-mcp)**; pruebas en `mcp/pruebas.http`.
- Comprobar: **ÓRBITA: 99 verificar**.

## Notas técnicas

- La API responde los errores de negocio como `{"error": …}` con HTTP 200, y 401 si falta la sesión.
- Modales y avisos se pintan en `<body>` (`createPortal`): un contenedor del tema rompe `position: fixed`.
- WCM elimina `[$…]` al servir el JavaScript de una Script Application; `k8s/01-construir.sh` lo escribe con escapes
  equivalentes (ver [k8s/README.md](k8s/README.md)).

## Licencia

Copyright © 2026 EuropeSIP. Todos los derechos reservados. Licencia pendiente de decisión (GPLv3 o AGPLv3): ver
[NOTICE](NOTICE), con las licencias de los componentes de terceros.
