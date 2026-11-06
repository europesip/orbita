<p align="center"><img src="web/marca/orbita-logo.svg" alt="ÓRBITA" width="430"></p>

# ÓRBITA · Fichaje, Vacaciones, Gastos y Aprobaciones

**ÓRBITA** es una suite de intranet para **HCL DX Compose** (CF239): la interfaz React se publica como **Script
Applications** y la lógica y los datos son una API REST (**`orbita-api`**, Open Liberty) con PostgreSQL, que también
incluye un **servidor MCP** para HCL DX IQ. Todo se instala con **un chart de Helm**. Qué hace cada aplicación:
[docs/ESPECIFICACION.md](docs/ESPECIFICACION.md).

| Página (solo usuarios con sesión) | URL en el entorno de los labs |
|---|---|
| Mi intranet | https://dx-demo.apps.promox.europesip-lab.com/wps/myportal/Home/mi-intranet |
| Fichaje | .../wps/myportal/Home/fichaje |
| Vacaciones | .../wps/myportal/Home/vacaciones |
| Gastos y viajes | .../wps/myportal/Home/gastos |
| Aprobaciones | .../wps/myportal/Home/aprobaciones |
| Quiosco de fichaje | .../wps/myportal/Home/quiosco |

## Usuarios de la demo

La historia de la demo (quién pide vacaciones, quién olvida fichar, quién aprueba, quién paga) se escribe por
**papeles**, y cada papel lo hace un **usuario de DX que ya existe**: no hay que dar de alta usuarios en el directorio.
El reparto está en el valor `demo.people` del chart; por defecto, los usuarios del OpenLDAP de los labs:

| Papel | Usuario (labs) | Rol en ÓRBITA | PIN del quiosco |
|---|---|---|---|
| `rrhh` | `patricia` | RRHH: ve a toda la plantilla, exporta, restaura la demo | 1000 |
| `ventas-responsable` | `andres` | Responsable de Ventas: aprueba a su equipo | 2001 |
| `ventas-1` | `macarena` | Comercial | 1111 |
| `ventas-2` | `eduardo` | Comercial | 2222 |
| `tecnologia-responsable` | `enrique` | Responsable de Tecnología | 3001 |
| `tecnologia-1` | `jordi` | Desarrollador | 3333 |
| `administracion` | `german` | Administración: paga las notas de gasto | 6001 |
| `tecnologia-2`, `tecnologia-3` | (ficticios) | Aparecen en los datos; nadie entra con ellos | 4444, 5555 |

Cada persona ve su PIN y su tarjeta QR en *Fichaje › Mi tarjeta de quiosco*. Para repetir la demo desde cero: RRHH ›
*Fichaje* › *Informes* › **Restaurar datos de demostración**. Los datos son relativos al día en que se cargan.

## Funciones transversales

- **Asistente «✨ Pregúntale a ÓRBITA»** (cabecera de todas las aplicaciones): chat con HCL DX IQ en un panel
  lateral, con la sesión del portal. Responde con las herramientas del MCP de ÓRBITA como el usuario que pregunta
  («¿cuántas vacaciones me quedan?», «pídeme del 9 al 11 de diciembre»…). Código: `web/src/asistente.jsx`.
- **Mi intranet**: saludo con fichaje rápido, horas de las últimas seis semanas, saldo de vacaciones, gastos del año por
  categoría, solicitudes por aprobar, quién falta los próximos 14 días y últimos avisos.
- **Avisos** (campana de la cabecera): al pedir, aprobar, rechazar, comentar y pagar; enlazan a la aplicación.
- **Conversación** en ausencias, notas de gasto y viajes: preguntar o aclarar sin rechazar la solicitud.
- **Quiosco de fichaje**: tablet en la entrada (con sesión iniciada); cada persona ficha con su PIN o el QR de su
  tarjeta. El dispositivo se identifica con una clave que genera el chart (`kiosk.key`).
- **Lectura automática de tickets**: OCR en el navegador con Tesseract.js; la foto no se envía a ningún servicio, pero
  el navegador necesita internet la primera vez para descargar el motor y el modelo de español.

## Arquitectura

```
 Navegador ── https://<host de DX> ──┬── /wps/...         HCL DX: páginas con las 6 Script Applications (WCM)
                                     └── /orbita-api/v1   Ingress ──► orbita-api (Open Liberty, :9080)
                                                                        │  ¿quién es? ── cookie LtpaToken2 ──► DX (API de perfil)
                                                                        └─ PostgreSQL: base "orbita" (Flyway)
 DX IQ Integrator ── cookies de DX del usuario ──► orbita-api :9081 /mcp (solo dentro del clúster)
```

| Pieza | Dónde |
|---|---|
| Interfaz React | Una Script Application por aplicación (WCM: *Script Application Library › Script Applications*), cada una en su página bajo *Home* |
| Lógica y datos | `orbita-api` (Deployment del chart), en el namespace de las herramientas de terceros (en los labs, `dx-shared`); `https://<host de DX>/orbita-api/v1/...` |
| Quién es el usuario | **Lo dice DX**: la API reenvía la cookie de sesión del usuario (`LtpaToken2`) a la API de perfil de DX. Sin claves LTPA compartidas, sin configuración de LDAP y sin credenciales de administrador en la API |
| Base de datos | Base `orbita` y usuario `orbita` en PostgreSQL (los crea un Job del chart); tablas con **migraciones Flyway** (`api/core/src/main/resources/db/migration`) |
| Servidor MCP | `POST /mcp` y `GET /probe/ready` en el puerto 9081 del mismo pod, solo para el Integrator de DX IQ: [docs/mcp.md](docs/mcp.md) |

## Instalación

El chart **`hcl-dx-orbita`** ([chart/hcl-dx-orbita](chart/hcl-dx-orbita), valores en
[values.yaml](chart/hcl-dx-orbita/values.yaml)) instala:

1. Un **Job** (antes de instalar y de cada actualización) que crea el usuario y la base de datos en PostgreSQL con un
   superusuario. La contraseña de ÓRBITA la genera el chart y se conserva entre actualizaciones.
2. **`orbita-api`**: Deployment, Service, Ingress en `/orbita-api` del host de DX y NetworkPolicy del MCP. Al arrancar
   aplica las migraciones y, en modo demo, carga los datos.
3. El subchart **`scriptapps`** ([hcl-dx-scriptapp](https://github.com/europesip/hcl-dx-scriptapp-helm) 0.2.0): un Job
   que sube las seis Script Applications con HCL DXClient y después crea las páginas con XMLAccess.

En el entorno de los [labs de DX Compose](https://github.com/europesip/hcl-dx-compose-labs) (Lab 1, PostgreSQL de las
dependencias externas y OpenLDAP del Lab 2A), con su `env.sh`:

```bash
export DXCLIENT_ACCEPT_LICENSE=yes          # aceptas la licencia de HCL DXClient
export GHCR_USER=<usuario de GitHub> GHCR_TOKEN=<token con read:packages>   # mientras las imágenes sean privadas
scripts/instalar-en-labs.sh                 # secrets, helm upgrade --install y espera a que esté lista
scripts/verificar.sh                        # comprobaciones de solo lectura
scripts/registrar-mcp-en-iq.sh              # opcional: el asistente de IA (Lab 3)
```

Fuera de los labs, el mismo `helm upgrade --install` con tus valores: `dx.host`, `database.host`,
`database.create.superuserSecret`, `scriptapps.dx.*` (host, usuario administrador de DX y CA) y
`scriptapps.dxclient.acceptLicense=true`. Para **actualizar**: `helm upgrade` con una versión nueva; las migraciones
nuevas se aplican solas y los datos se conservan.

## Estructura

```
api/                    back end (Maven, Java 21, Jakarta EE 10)
  rutas.json            contrato de la API REST: método + ruta → operación (lo usan el servidor y la interfaz)
  core/                 lógica (com.europesip.orbita.core): operaciones, permisos, Flyway, demo, sesión de DX
  rest/                 orbita-api.war: API REST (/orbita-api/v1)
  mcp/                  orbita-mcp.war: servidor MCP
web/                    interfaz React (Vite): web/src, marca y scripts/scriptapps.mjs (genera las 6 apps)
images/api/             Dockerfile y server.xml de Open Liberty
images/scriptapps/      Dockerfile de la imagen con las Script Applications construidas
chart/hcl-dx-orbita/    chart de Helm
scripts/                ayudas para el entorno de los labs (instalar, verificar, registrar el MCP en IQ)
docs/                   especificación, MCP y pruebas con REST Client (api.http, mcp-pruebas.http)
.github/workflows/      construye, prueba y publica las imágenes y el chart en ghcr.io
```

## Desarrollo

- **Back end**: `mvn -f api/pom.xml package` (Java 21). Las WAR quedan en `api/rest/target` y `api/mcp/target`.
- **Interfaz**: `cd web && npm ci && npm run build:scriptapps` → `web/build/scriptapps/<app>/`.
- **Imágenes**: `docker build -f images/api/Dockerfile .` y `docker build -f images/scriptapps/Dockerfile .`, o en CI:
  un push a `main` o `helm` publica `:<rama>`; un tag `v2.0.0` publica `:2.0.0` y el chart.
- **Una nueva operación**: método en `Api.java` (o `Gastos.java`), su ruta en `api/rutas.json`, y la interfaz la llama
  con `api('op', {...})`.
- **Un cambio de esquema**: un fichero nuevo `V<n>__descripcion.sql` en `db/migration`. Nunca se editan las
  migraciones ya publicadas.

## Notas técnicas

- La API responde 401 sin sesión de DX, 422 con `{"error", "aviso": true}` para los errores de negocio (el mensaje es
  para el usuario) y 500 si algo falla.
- Modales y avisos se pintan en `<body>` (`createPortal`): un contenedor del tema rompe `position: fixed`.
- WCM elimina `[$…]` al servir el JavaScript de una Script Application; `web/scripts/scriptapps.mjs` lo escribe con
  escapes equivalentes y comprueba que el resultado sigue siendo JavaScript válido.
- En Open Liberty, Flyway solo encuentra las migraciones si su carpeta tiene un fichero `flyway.location`.

## Licencia

Copyright © 2026 EuropeSIP. Todos los derechos reservados. Licencia pendiente de decisión (GPLv3 o AGPLv3): ver
[NOTICE](NOTICE), con las licencias de los componentes de terceros.
