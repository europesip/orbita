<p align="center"><img src="web/marca/orbita-logo.svg" alt="ÓRBITA" width="430"></p>

# ÓRBITA · Fichaje, Vacaciones, Gastos y Aprobaciones para HCL DX

[English](README.md) · **Español** · [Historial de versiones](CHANGELOG.es.md) · [Licencia](#licencia-y-servicios)

**ÓRBITA** es una suite de intranet para **HCL DX Compose** (CF239), de **EUROPESIP**. Su interfaz React se publica
como seis **Script Applications**; la lógica y los datos están en una API REST (**`orbita-api`**, Open Liberty) con
PostgreSQL, que incluye también un **servidor MCP** para que **HCL DX IQ** responda y actúe en nombre del usuario. Todo
se instala con **un chart de Helm**, `hcl-dx-orbita`. Qué hace cada aplicación:
[docs/ESPECIFICACION.md](docs/ESPECIFICACION.md).

> **Versión 2.0.0.** Necesita **PostgreSQL** (ver [Requisitos](#requisitos)); en las siguientes versiones se podrán
> usar otras bases de datos.

| Página (solo usuarios con sesión) | URL en los labs de HCL DX Compose |
|---|---|
| Mi intranet | https://dx-demo.apps.promox.europesip-lab.com/wps/myportal/Home/mi-intranet |
| Fichaje | .../wps/myportal/Home/fichaje |
| Vacaciones | .../wps/myportal/Home/vacaciones |
| Gastos y viajes | .../wps/myportal/Home/gastos |
| Aprobaciones | .../wps/myportal/Home/aprobaciones |
| Quiosco de fichaje | .../wps/myportal/Home/quiosco |

## Contenido

- [Usuarios de la demo](#usuarios-de-la-demo) · [Funciones](#funciones) · [Arquitectura](#arquitectura)
- [Requisitos](#requisitos) · [Instalación con Helm](#instalación-con-helm) · [Integración con HCL DX IQ](#integración-con-hcl-dx-iq-el-servidor-mcp)
- [Actualizar y desinstalar](#actualizar-y-desinstalar) · [Repositorio](#repositorio) · [Desarrollo](#desarrollo)
- [Historial de versiones](CHANGELOG.es.md) · [Licencia y servicios](#licencia-y-servicios)

## Usuarios de la demo

La historia de la demo (quién pide vacaciones, quién olvida fichar, quién aprueba, quién paga) se escribe por
**papeles**, y cada papel lo hace un **usuario de DX que ya existe**: no hay que dar de alta usuarios en el directorio.
El reparto es el valor `demo.people` del chart; por defecto, los usuarios del OpenLDAP de los
[labs](https://github.com/europesip/hcl-dx-compose-labs):

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

## Funciones

- **Asistente «✨ Pregúntale a ÓRBITA»** (cabecera de todas las aplicaciones): chat con HCL DX IQ en un panel
  lateral, con la sesión del portal. Responde con las herramientas del MCP de ÓRBITA como el usuario que pregunta
  («¿cuántas vacaciones me quedan?», «pídeme del 9 al 11 de diciembre»…).
- **Mi intranet**: saludo con fichaje rápido, horas de las últimas seis semanas, saldo de vacaciones, gastos del año por
  categoría, solicitudes por aprobar, quién falta los próximos 14 días y últimos avisos.
- **Fichaje**, **vacaciones y ausencias**, **gastos y viajes** (tickets con OCR en el navegador, con Tesseract.js),
  **aprobaciones** con conversación, **avisos** (campana) y **quiosco de fichaje** (PIN o tarjeta QR).

## Arquitectura

```
 Navegador ── https://<host de DX> ──┬── /wps/...         HCL DX: páginas con las 6 Script Applications (WCM)
                                     └── /orbita-api/v1   Ingress ──► orbita-api (Open Liberty, :9080)
                                                                        │  ¿quién es? ── cookie LtpaToken2 ──► API de perfil de DX
                                                                        └─ PostgreSQL: base "orbita" (Flyway)
 Integrator de DX IQ ── cookies de DX del usuario ──► orbita-api :9081 /mcp (solo dentro del clúster)
```

- **Quién es el usuario lo dice DX.** La API reenvía la cookie de sesión del usuario (`LtpaToken2`) a la API de perfil
  de DX. Sin claves LTPA compartidas, sin configuración de LDAP y sin credenciales de administrador de DX en la API.
- **Base de datos**: su propia base y su usuario, que crea el chart; las tablas las crean y actualizan **migraciones
  Flyway**. Nunca se borran datos al actualizar.
- **Servidor MCP**: `POST /mcp` y `GET /probe/ready` en el puerto 9081 del mismo pod, solo para el Integrator de IQ
  (NetworkPolicy). Las herramientas actúan como el usuario del chat de IQ, identificado por su sesión de DX.

## Requisitos

| | |
|---|---|
| **HCL DX Compose** | CF239 en Kubernetes, con un Ingress (ingress-nginx) para su nombre de host. Un usuario **administrador** de DX para DXClient (sube las Script Applications y crea las páginas con XMLAccess) |
| **PostgreSQL** | **Obligatorio en la versión 2.0.0** (probado con PostgreSQL 18 / CloudNativePG), accesible desde el clúster, y un Secret con un **superusuario** (claves `username` y `password`) para que el chart cree su base de datos y su usuario. Si no lo tienes, los labs lo instalan en unos 3 minutos: [Dependencias externas](https://github.com/europesip/hcl-dx-compose-labs/blob/main/external-deps/GUIDE.es.md) (`external-deps/02-postgres.sh`). **En las siguientes versiones se podrán usar otras bases de datos** |
| **Usuarios** | Los usuarios de DX de `demo.people` (en los labs, los del OpenLDAP del Lab 2A) |
| **HCL DX IQ** (opcional) | Para el asistente: IQ instalado (Lab 3 de los labs) |
| **Imágenes** | `ghcr.io/europesip/orbita/...`. Mientras el repositorio sea privado, un Secret de descarga (un token de GitHub con `read:packages`) |
| **Herramientas** | `kubectl` y Helm 3.8 o superior (charts OCI) |

## Instalación con Helm

Se instala en el namespace de las herramientas de terceros, junto a PostgreSQL (en los labs, `dx-shared`).

**1. Secrets** (una vez):

```bash
NS=dx-shared
# Administrador de DX para DXClient (Script Applications y páginas)
kubectl -n $NS create secret generic orbita-dx --from-literal=username=wpsadmin --from-literal=password='<contraseña>'
# CA del certificado de DX (autofirmado o de una CA privada). En los labs: el propio certificado
kubectl -n dx-demo get secret dx-tls-cert -o jsonpath='{.data.tls\.crt}' | base64 -d > dx-ca.crt
kubectl -n $NS create secret generic orbita-dx-ca --from-file=ca.crt=dx-ca.crt
# Mientras las imágenes sean privadas: un token de GitHub con read:packages
kubectl -n $NS create secret docker-registry ghcr-pull --docker-server=ghcr.io \
  --docker-username=<usuario de GitHub> --docker-password=<token>
```

**2. Valores** (`orbita-values.yaml`; cada valor está explicado en [values.yaml](chart/hcl-dx-orbita/values.yaml)):

```yaml
dx:
  host: dx-demo.apps.promox.europesip-lab.com     # nombre de host público de DX
  caSecret: orbita-dx-ca
database:
  host: dx-pg-rw.dx-shared.svc.cluster.local      # PostgreSQL (requisito)
  create:
    superuserSecret: dx-pg-superuser              # crea la base y el usuario "orbita"
mcp:
  networkPolicy:
    integratorNamespace: dx-demo                  # namespace de HCL DX IQ
imagePullSecrets: [{ name: ghcr-pull }]
scriptapps:                                       # subchart hcl-dx-scriptapp: se repiten los datos de DX
  dx:
    host: dx-demo.apps.promox.europesip-lab.com
    credentialsSecret: orbita-dx
    caSecret: orbita-dx-ca
  dxclient:
    acceptLicense: true                           # aceptas la licencia de HCL DXClient
  job:
    imagePullSecrets: [{ name: ghcr-pull }]
# demo.people: quién hace cada papel (por defecto, los usuarios de los labs)
```

**3. Instalar**:

```bash
helm registry login ghcr.io -u <usuario de GitHub>   # mientras el chart sea privado (el mismo token)
helm upgrade --install orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita --version 2.0.0 \
  -n dx-shared -f orbita-values.yaml --timeout 15m
```

Qué ocurre, por orden:

1. Un **Job** crea el usuario y la base de datos en PostgreSQL (idempotente). La contraseña de ÓRBITA la genera el
   chart y se conserva entre actualizaciones (Secret `orbita-db`).
2. Arranca **`orbita-api`**: Flyway crea las tablas y se cargan los datos de la demo. Además, el Service, el Ingress en
   `/orbita-api` del host de DX y la NetworkPolicy del MCP.
3. El **Job de scriptapps** sube las seis Script Applications a WCM con HCL DXClient y crea las seis páginas bajo
   *Home* con XMLAccess.

**4. Comprobar**: `kubectl -n dx-shared logs job/orbita-scriptapps-push -c dxclient | tail -3`, y
`https://<host de DX>/orbita-api/v1/salud` debe contestar `ok`. Después, entra en DX con un usuario de la demo y abre
*Mi intranet*.

**En los labs de HCL DX Compose**, lo mismo con un script (lee el `env.sh` de los labs y crea los secrets):

```bash
DXCLIENT_ACCEPT_LICENSE=yes scripts/instalar-en-labs.sh
scripts/verificar.sh
```

## Integración con HCL DX IQ (el servidor MCP)

Para que el asistente de IQ use ÓRBITA, el Integrator de IQ tiene que conocer el servidor MCP de ÓRBITA: hay que
añadir su URL base, `http://orbita-api.dx-shared.svc.cluster.local:9081` (`<release>-api.<namespace>`), a su **lista
de servidores MCP**. IQ añade `/mcp` y `/probe/ready` por su cuenta.

**Por qué hace falta un parche (bug de HCL DX IQ, caso CS1479102).** HCL documenta la variable `MCP_SERVER_LIST`
(`environment.pod.integrator` en el chart `hcl-dx-iq`) para esa lista, pero no tiene efecto: el chart genera además el
ConfigMap `<release de IQ>-integrator` con su propia lista fija (clave `dx.config.integrator.mcp_server_list`, solo con
el MCP de HCL), y esa es la lista que lee el Integrator. Sigue presente en CF239 (IQ 1.0.3). Hasta que HCL lo corrija,
la solución es **parchear esa clave del ConfigMap** y reiniciar el Integrator:

```bash
# Lista actual (se conserva lo que hay: el MCP de HCL y cualquier otro)
LIST=$(kubectl -n dx-demo get configmap dx-iq-integrator -o jsonpath='{.data.dx\.config\.integrator\.mcp_server_list}')
# Se añade ÓRBITA y se reinicia el Integrator (lee la lista y las herramientas al arrancar)
kubectl -n dx-demo patch configmap dx-iq-integrator --type merge \
  -p "{\"data\":{\"dx.config.integrator.mcp_server_list\":\"$LIST,http://orbita-api.dx-shared.svc.cluster.local:9081\"}}"
kubectl -n dx-demo rollout restart deployment/dx-iq-integrator
# Comprobar: tienen que aparecer las herramientas de ÓRBITA
kubectl -n dx-demo logs deploy/dx-iq-integrator | grep Fetched
#  Fetched 2 tools from http://orbita-api.dx-shared.svc.cluster.local:9081
```

En los labs, `scripts/registrar-mcp-en-iq.sh` hace exactamente esto (y no duplica la entrada).

- **Después de cada `helm upgrade` de IQ hay que volver a aplicar el parche**: el chart regenera la lista. Con Helm 4
  ese upgrade necesita además `--force-conflicts`, porque la clave pasa a pertenecer a `kubectl patch`.
- **Probar** en el chat de IQ, con un usuario de la demo: «¿Cuántos días de vacaciones me quedan?». Cada llamada queda
  auditada en el log de `orbita-api` (`ORBITA MCP auditoria herramienta=… usuario=…`).
- Herramientas y modelo de seguridad: [docs/mcp.md](docs/mcp.md).

## Actualizar y desinstalar

- **Actualizar**: `helm upgrade orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita --version <nueva> -n dx-shared -f
  orbita-values.yaml`. Las migraciones nuevas se aplican al arrancar y los datos se conservan. Las Script Applications
  se actualizan en sus páginas.
- **Desinstalar**: `helm -n dx-shared uninstall orbita`. Se quedan la base de datos, su Secret `orbita-db`, las Script
  Applications y las páginas (puede haber páginas que las usen); borra las páginas en DX y la base en PostgreSQL si ya
  no las necesitas. Quita ÓRBITA de la lista de IQ con el mismo parche, sin su URL.

## Repositorio

```
api/                    back end (Maven, Java 21, Jakarta EE 10)
  rutas.json            contrato de la API REST: método + ruta → operación (lo usan el servidor y la interfaz)
  core/                 lógica (com.europesip.orbita.core): operaciones, permisos, Flyway, demo, sesión de DX
  rest/                 orbita-api.war: API REST (/orbita-api/v1)
  mcp/                  orbita-mcp.war: servidor MCP
web/                    interfaz React (Vite); scripts/scriptapps.mjs genera las 6 Script Applications
images/                 Dockerfiles: orbita-api (Open Liberty) y orbita-scriptapps (las apps construidas)
chart/hcl-dx-orbita/    chart de Helm
scripts/                ayudas para los labs (instalar, verificar, registrar el MCP en IQ)
docs/                   especificación, MCP y pruebas con REST Client (api.http, mcp-pruebas.http)
```

## Desarrollo

- **Back end**: `mvn -f api/pom.xml package` (Java 21). **Interfaz**: `cd web && npm ci && npm run build:scriptapps`.
- **Imágenes**: CI construye y prueba las dos imágenes; un push a `main` publica `:main`, un tag `v2.0.0` publica
  `:2.0.0` y el chart.
- **Una operación nueva**: método en `Api.java` (o `Gastos.java`), su ruta en `api/rutas.json`, y la interfaz la llama
  con `api('op', {...})`. **Un cambio de esquema**: un fichero nuevo `V<n>__descripcion.sql` en `db/migration` (nunca
  se edita uno publicado).
- La API responde 401 sin sesión de DX, 422 con `{"error", "aviso": true}` para los errores de negocio y 500 si algo
  falla. WCM elimina `[$…]` al servir el JavaScript: `web/scripts/scriptapps.mjs` lo escribe con escapes equivalentes.
  En Open Liberty, Flyway solo encuentra las migraciones si su carpeta tiene un fichero `flyway.location`.

## Licencia y servicios

El código de ÓRBITA es **abierto** (*source-available*) con la licencia **[PolyForm Noncommercial 1.0.0](LICENSE)**:
puedes usarlo, estudiarlo, **modificarlo** y redistribuirlo con cualquier fin **no comercial** (uso personal, estudio,
investigación, evaluación, y organizaciones sin ánimo de lucro, educativas y públicas). **No se permite el uso
comercial** sin un acuerdo con EUROPESIP. Los componentes de terceros mantienen sus licencias: ver [NOTICE](NOTICE).

**Servicios de EUROPESIP.** Si quieres usar ÓRBITA en tu organización, EUROPESIP tiene un catálogo de servicios
relacionados: **personalización** y nuevas funciones, **branding** con tu imagen corporativa, **adaptación** a tus
procesos y sistemas (directorio, nómina, ERP), **soporte** y **bolsas de horas** para una instalación a medida.
Contacto: [www.europesip.com](https://www.europesip.com).

Copyright © 2026 EUROPESIP.
