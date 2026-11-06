<p align="center"><img src="web/marca/orbita-logo.svg" alt="ÓRBITA" width="430"></p>

# ÓRBITA · Time tracking, Time off, Expenses and Approvals for HCL DX

**English** · [Español](README.es.md) · [Release history](CHANGELOG.md) · [Licence](#licence-and-services)

**ÓRBITA** is an intranet suite for **HCL DX Compose** (CF239) by **EUROPESIP**. Its React interface is published as
six **Script Applications**; the logic and the data live in a REST API (**`orbita-api`**, Open Liberty) with
PostgreSQL, which also includes an **MCP server** so that **HCL DX IQ** can answer questions and act for the user.
Everything is installed with **one Helm chart**, `hcl-dx-orbita`.

> **Version 2.0.0.** Requires **PostgreSQL** (see [Requirements](#requirements)); other databases will be supported
> in later releases. The application interface is in Spanish.

| Page (signed-in users only) | URL in the HCL DX Compose labs |
|---|---|
| My intranet | https://dx-demo.apps.promox.europesip-lab.com/wps/myportal/Home/mi-intranet |
| Time tracking | .../wps/myportal/Home/fichaje |
| Time off | .../wps/myportal/Home/vacaciones |
| Expenses and travel | .../wps/myportal/Home/gastos |
| Approvals | .../wps/myportal/Home/aprobaciones |
| Time clock kiosk | .../wps/myportal/Home/quiosco |

## Contents

- [Demo users](#demo-users) · [Features](#features) · [Architecture](#architecture)
- [Requirements](#requirements) · [Installation with Helm](#installation-with-helm) · [HCL DX IQ integration](#hcl-dx-iq-integration-the-mcp-server)
- [Upgrade and uninstall](#upgrade-and-uninstall) · [Repository](#repository) · [Development](#development)
- [Release history](CHANGELOG.md) · [Licence and services](#licence-and-services)

## Demo users

The demo story (who asks for time off, who forgets to clock out, who approves, who pays) is written by **roles**, and
each role is played by a **DX user that already exists**: no users have to be added to the directory. The cast is the
chart value `demo.people`; by default, the users of the [labs](https://github.com/europesip/hcl-dx-compose-labs)
OpenLDAP:

| Role | User (labs) | Role in ÓRBITA | Kiosk PIN |
|---|---|---|---|
| `rrhh` | `patricia` | HR: sees everybody, exports, restores the demo | 1000 |
| `ventas-responsable` | `andres` | Sales manager: approves their team | 2001 |
| `ventas-1` | `macarena` | Sales | 1111 |
| `ventas-2` | `eduardo` | Sales | 2222 |
| `tecnologia-responsable` | `enrique` | IT manager | 3001 |
| `tecnologia-1` | `jordi` | Developer | 3333 |
| `administracion` | `german` | Accounting: pays the expense reports | 6001 |
| `tecnologia-2`, `tecnologia-3` | (fictitious) | In the data; nobody signs in with them | 4444, 5555 |

To run the demo again from scratch: HR › *Fichaje* › *Informes* › **Restaurar datos de demostración**. The data are
relative to the day they are loaded.

## Features

- **Assistant «✨ Pregúntale a ÓRBITA»** (header of every app): HCL DX IQ chat in a side panel, with the portal session.
  It answers with the ÓRBITA MCP tools as the user asking («¿cuántas vacaciones me quedan?»).
- **My intranet**: quick clock-in, hours of the last six weeks, time-off balance, expenses by category, pending
  approvals, who is away in the next 14 days and the latest notifications.
- **Time tracking**, **time off**, **expenses and travel** (receipts with in-browser OCR), **approvals** with
  conversations, **notifications** and a **time clock kiosk** (PIN or QR card).

## Architecture

```
 Browser ── https://<DX host> ──┬── /wps/...         HCL DX: pages with the 6 Script Applications (WCM)
                                └── /orbita-api/v1   Ingress ──► orbita-api (Open Liberty, :9080)
                                                                   │  who is it? ── LtpaToken2 cookie ──► DX profile API
                                                                   └─ PostgreSQL: database "orbita" (Flyway)
 DX IQ Integrator ── user's DX cookies ──► orbita-api :9081 /mcp (cluster only)
```

- **Who the user is, DX says.** The API forwards the user's DX session cookie (`LtpaToken2`) to the DX profile API.
  No shared LTPA keys, no LDAP settings and no DX administrator credentials in the API.
- **Database**: its own database and user, created by the chart; tables created and upgraded by **Flyway
  migrations**. Data are never dropped on upgrade.
- **MCP server**: `POST /mcp` and `GET /probe/ready` on port 9081 of the same pod, only for the IQ Integrator
  (NetworkPolicy). The tools act as the IQ chat user, identified by their DX session.

## Requirements

| | |
|---|---|
| **HCL DX Compose** | CF239 on Kubernetes, with an Ingress (ingress-nginx) for its host name. A DX **administrator** user for DXClient (it pushes the Script Applications and creates the pages with XMLAccess) |
| **PostgreSQL** | **Required in version 2.0.0** (tested with PostgreSQL 18 / CloudNativePG), reachable from the cluster, and a **superuser** Secret (keys `username` and `password`) so that the chart creates its database and user. If you do not have one, the labs install it in about 3 minutes: [External dependencies](https://github.com/europesip/hcl-dx-compose-labs/blob/main/external-deps/GUIDE.md) (`external-deps/02-postgres.sh`). **Other databases will be supported in later releases** |
| **Users** | The DX users of `demo.people` (in the labs, the OpenLDAP of Lab 2A) |
| **HCL DX IQ** (optional) | For the assistant: IQ installed (Lab 3 of the labs) |
| **Images** | `ghcr.io/europesip/orbita/...`. While the repository is private, a pull Secret (a GitHub token with `read:packages`) |
| **Tools** | `kubectl` and Helm 3.8+ (OCI charts) |

## Installation with Helm

Install it in the namespace of your third-party tools, next to PostgreSQL (the labs use `dx-shared`).

**1. Secrets** (once):

```bash
NS=dx-shared
# DX administrator for DXClient (Script Applications and pages)
kubectl -n $NS create secret generic orbita-dx --from-literal=username=wpsadmin --from-literal=password='<password>'
# CA of the DX certificate (self-signed or private CA). In the labs: the certificate itself
kubectl -n dx-demo get secret dx-tls-cert -o jsonpath='{.data.tls\.crt}' | base64 -d > dx-ca.crt
kubectl -n $NS create secret generic orbita-dx-ca --from-file=ca.crt=dx-ca.crt
# While the images are private: a GitHub token with read:packages
kubectl -n $NS create secret docker-registry ghcr-pull --docker-server=ghcr.io \
  --docker-username=<GitHub user> --docker-password=<token>
```

**2. Values** (`orbita-values.yaml`; every value is explained in [values.yaml](chart/hcl-dx-orbita/values.yaml)):

```yaml
dx:
  host: dx-demo.apps.promox.europesip-lab.com     # public host name of DX
  caSecret: orbita-dx-ca
database:
  host: dx-pg-rw.dx-shared.svc.cluster.local      # PostgreSQL (prerequisite)
  create:
    superuserSecret: dx-pg-superuser              # creates the "orbita" database and user
mcp:
  networkPolicy:
    integratorNamespace: dx-demo                  # namespace of HCL DX IQ
imagePullSecrets: [{ name: ghcr-pull }]
scriptapps:                                       # subchart hcl-dx-scriptapp: repeat the DX settings
  dx:
    host: dx-demo.apps.promox.europesip-lab.com
    credentialsSecret: orbita-dx
    caSecret: orbita-dx-ca
  dxclient:
    acceptLicense: true                           # you accept the HCL DXClient license
  job:
    imagePullSecrets: [{ name: ghcr-pull }]
# demo.people: who plays each role (default: the labs users)
```

**3. Install**:

```bash
helm registry login ghcr.io -u <GitHub user>      # while the chart is private (same token)
helm upgrade --install orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita --version 2.0.0 \
  -n dx-shared -f orbita-values.yaml --timeout 15m
```

What happens, in order:

1. A **Job** creates the PostgreSQL user and database (idempotent). The ÓRBITA password is generated by the chart
   and kept across upgrades (Secret `orbita-db`).
2. **`orbita-api`** starts: Flyway creates the tables and the demo data are loaded. Then the Service, the Ingress on
   `/orbita-api` of the DX host and the MCP NetworkPolicy.
3. The **scriptapps Job** pushes the six Script Applications to WCM with HCL DXClient and creates the six pages under
   *Home* with XMLAccess.

**4. Check**: `kubectl -n dx-shared logs job/orbita-scriptapps-push -c dxclient | tail -3`, and
`https://<DX host>/orbita-api/v1/salud` must answer `ok`. Then sign in to DX as a demo user and open *Mi intranet*.

**In the HCL DX Compose labs**, the same with one script (it reads the labs `env.sh` and creates the secrets):

```bash
DXCLIENT_ACCEPT_LICENSE=yes scripts/instalar-en-labs.sh
scripts/verificar.sh
```

## HCL DX IQ integration (the MCP server)

So that the IQ assistant can use ÓRBITA, the IQ Integrator must know the ÓRBITA MCP server: add its base URL,
`http://orbita-api.dx-shared.svc.cluster.local:9081` (`<release>-api.<namespace>`), to its **MCP server list**. IQ
adds `/mcp` and `/probe/ready` itself.

**Why a patch is needed (HCL DX IQ bug, case CS1479102).** HCL documents the variable `MCP_SERVER_LIST`
(`environment.pod.integrator` in the `hcl-dx-iq` chart) for that list, but it has no effect: the chart also generates
the ConfigMap `<IQ release>-integrator` with its own fixed list (key `dx.config.integrator.mcp_server_list`, only the
HCL MCP server), and that is the list the Integrator reads. Still present in CF239 (IQ 1.0.3). Until HCL fixes it, the
workaround is to **patch that ConfigMap key** and restart the Integrator:

```bash
# Current list (keep what is there: the HCL MCP server and any other)
LIST=$(kubectl -n dx-demo get configmap dx-iq-integrator -o jsonpath='{.data.dx\.config\.integrator\.mcp_server_list}')
# Add ÓRBITA and restart the Integrator (it reads the list and the tools at start-up)
kubectl -n dx-demo patch configmap dx-iq-integrator --type merge \
  -p "{\"data\":{\"dx.config.integrator.mcp_server_list\":\"$LIST,http://orbita-api.dx-shared.svc.cluster.local:9081\"}}"
kubectl -n dx-demo rollout restart deployment/dx-iq-integrator
# Check: the ÓRBITA tools must be there
kubectl -n dx-demo logs deploy/dx-iq-integrator | grep Fetched
#  Fetched 2 tools from http://orbita-api.dx-shared.svc.cluster.local:9081
```

In the labs, `scripts/registrar-mcp-en-iq.sh` does exactly this (and does not duplicate the entry).

- **After every `helm upgrade` of IQ, apply the patch again**: the chart regenerates the list. With Helm 4 that
  upgrade also needs `--force-conflicts`, because the key now belongs to `kubectl patch`.
- **Test** in the IQ chat, as a demo user: «¿Cuántos días de vacaciones me quedan?». Each call is audited in the
  `orbita-api` log (`ORBITA MCP auditoria herramienta=… usuario=…`).
- Tools and security model: [docs/mcp.md](docs/mcp.md) (in Spanish).

## Upgrade and uninstall

- **Upgrade**: `helm upgrade orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita --version <new> -n dx-shared -f
  orbita-values.yaml`. New migrations are applied at start-up; data are kept. The Script Applications are updated in
  place on their pages.
- **Uninstall**: `helm -n dx-shared uninstall orbita`. The database, its Secret `orbita-db`, the Script Applications
  and the pages stay (pages may be in use); remove the pages in DX and the database in PostgreSQL if you no longer need
  them. Remove ÓRBITA from the IQ list with the same patch, without its URL.

## Repository

```
api/                    back end (Maven, Java 21, Jakarta EE 10)
  rutas.json            REST API contract: method + route → operation (used by server and interface)
  core/                 logic (com.europesip.orbita.core): operations, permissions, Flyway, demo, DX session
  rest/                 orbita-api.war: REST API (/orbita-api/v1)
  mcp/                  orbita-mcp.war: MCP server
web/                    React interface (Vite); scripts/scriptapps.mjs builds the 6 Script Applications
images/                 Dockerfiles: orbita-api (Open Liberty) and orbita-scriptapps (the built apps)
chart/hcl-dx-orbita/    Helm chart
scripts/                helpers for the labs (install, verify, register the MCP in IQ)
docs/                   functional spec, MCP and REST Client tests (in Spanish)
```

## Development

- **Back end**: `mvn -f api/pom.xml package` (Java 21). **Interface**: `cd web && npm ci && npm run build:scriptapps`.
- **Images**: CI builds and tests both images; a push to `main` publishes `:main`, a tag `v2.0.0` publishes `:2.0.0`
  and the chart.
- **A new operation**: method in `Api.java` (or `Gastos.java`), its route in `api/rutas.json`, and the interface calls
  it with `api('op', {...})`. **A schema change**: a new file `V<n>__description.sql` in `db/migration` (never edit a
  published one).

## Licence and services

ÓRBITA is **source-available** under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**: you may use, study,
**modify** and redistribute it for any **noncommercial** purpose (personal use, study, research, evaluation, and
charitable, educational and public organisations). **Commercial use is not allowed** without an agreement with
EUROPESIP. Third-party components keep their own licences: see [NOTICE](NOTICE).

**EUROPESIP services.** If you want to use ÓRBITA in your organisation, EUROPESIP offers a catalogue of related
services: **customisation** and new features, **branding** with your corporate identity, **adaptation** to your
processes and systems (directory, payroll, ERP), **support**, and **packs of hours** for a tailored installation.
Contact: [www.europesip.com](https://www.europesip.com).

Copyright © 2026 EUROPESIP.
