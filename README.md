<p align="center"><img src="web/marca/orbita-logo.svg" alt="ÓRBITA" width="430"></p>

# ÓRBITA · Time tracking, Time off, Expenses and Approvals for HCL DX

**English** · [Español](README.es.md) · [Manual (PDF)](docs/manual/orbita-explained.en.pdf) · [FAQ](docs/faq.md) · [Release history](CHANGELOG.md) · [Contact](#contact-and-services)

**ÓRBITA** is an intranet suite for **HCL DX Compose** (CF239) by **EUROPESIP**. Its React interface is published as
six **Script Applications**; the logic and the data live in a REST API (**`orbita-api`**, Open Liberty) with
PostgreSQL, which also includes an **MCP server** so that **HCL DX IQ** can answer questions and act for the user.
Everything is installed with **one Helm chart**, `hcl-dx-orbita`.

> **Version 3.1.0.** Requires **PostgreSQL** (see [Requirements](#requirements)); other databases will be supported
> in later releases. The interface is in **English and Spanish**, in the language of each user's DX profile.
> It has its **own AI assistant** ([below](#ask-the-ai-about-órbita)), and the integration with HCL DX IQ is optional.

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
- [Ask the AI](#ask-the-ai-about-órbita) · [Requirements](#requirements) · [Installation with Helm](#installation-with-helm) · [HCL DX IQ integration](#hcl-dx-iq-integration-the-mcp-server)
- [Upgrade and uninstall](#upgrade-and-uninstall) · [Repository](#repository) · [Development](#development)
- [Release history](CHANGELOG.md) · [Licence](#licence) · [Contact and services](#contact-and-services)
- **Illustrated manual (PDF)**: [English](docs/manual/orbita-explained.en.pdf) · [Español](docs/manual/orbita-explicada.es.pdf)

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
  It answers with the ÓRBITA MCP tools as the user asking («How many days of holiday do I have left?»).
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

## Ask the AI about ÓRBITA

The «✨ Ask ÓRBITA» button of every app opens **ÓRBITA's own assistant**. It can answer and act **as the user
asking**, with **26 tools** ([you choose which](#choosing-which-mcp-tools-to-publish)): their day, time tracking (also clocking in and out),
time off (balance, requests, team calendar), expenses and travel (reports, adding expenses, sending them), approvals
(approve, reject, comment) and notifications. A few examples:

| Area | Ask, for example |
|---|---|
| My day | «What do I have today?» · «Do I have anything to approve?» |
| Time tracking | «Clock me in, working from home» · «Which days this month did I not clock out?» · «I forgot to clock out on Tuesday at 18:05: ask for the correction» |
| Time off | «How many days of holiday do I have left?» · «Book me holidays from 9 to 11 December» · «Who in the team is away in December?» |
| Expenses | «How much am I owed?» · «Create a report "Visit to Seville" and add a €42.80 lunch from yesterday» · «Send it to my manager» |
| Approvals | «What do I have to approve?» · «Approve macarena's holidays» · «Reject the Barcelona trip: tighter budget» |

**Ask in English or in Spanish**: the assistant answers in the language of the question (the ÓRBITA data, such as
categories and statuses, are in Spanish and the AI translates them). **More than 60 example questions, by area:
[docs/ai-questions.md](docs/ai-questions.md)** (in Spanish: [docs/preguntas-ia.md](docs/preguntas-ia.md)). Anything that changes data
needs your confirmation first; paying, restoring the demo, deleting and exporting stay in the app.

### Three ways to put AI on ÓRBITA

1. **ÓRBITA's own assistant (default, recommended for employees).** `orbita-api` talks to the model through
   **LiteLLM** with **only the ÓRBITA tools**, as the user of the DX session. Its prompt is small: no HCL DX tools and
   no IQ system prompt, so **each question uses far fewer tokens**. The model is a LiteLLM alias, by default the same
   one HCL DX IQ uses (`iq-general-purpose`), so it works with any LiteLLM prepared for IQ. Register another alias to
   give ÓRBITA a different model (cheaper, private, your own…). It does not need HCL DX IQ.

   ```yaml
assistant:
  backend: orbita            # orbita (own assistant, default) | iq (HCL DX IQ chat) | none (no button)
  litellm:
    url: http://litellm.dx-shared.svc.cluster.local:4000   # LiteLLM or any OpenAI-compatible API
    apiKeySecret: {name: litellm-env, key: PROXY_MASTER_KEY}
  model: iq-general-purpose  # LiteLLM alias: the same as HCL DX IQ by default; register another one for ÓRBITA only
```

2. **The HCL DX IQ chat (`assistant.backend: iq`).** IQ is designed for the **DX practitioners** who manage the
   portal. Its chat (the ✨ button of DX) uses the model configured in IQ and **all the MCP servers of the Integrator**
   at once: the 55 HCL DX tools (WCM, DAM, pages) plus the ÓRBITA ones. So one question can mix portal content and
   ÓRBITA data, at the cost of a much larger prompt. It needs the patch of the MCP list described below. With
   `backend: iq` the button of the ÓRBITA apps opens the IQ chat.
3. **Your own AI chat, apart from IQ.** The ÓRBITA MCP server is **standard MCP** (Streamable HTTP, JSON-RPC), and
   the REST API is documented in `api/rutas.json`, so any MCP client or your own chatbot can use them: a chat service of
   yours with any LLM (directly or through the same LiteLLM), Microsoft Copilot Studio, Claude, a Teams or WhatsApp
   bot… The only condition is **identity**: ÓRBITA acts as the user of the DX session it receives. A chat embedded in
   DX pages (for example, the ÓRBITA panel pointing to your own back end) can forward that session; a chat outside DX
   needs an identity exchange (OAuth / token), which EUROPESIP can build as part of the services below.

## Requirements

| | |
|---|---|
| **HCL DX Compose** | CF239 on Kubernetes, with an Ingress (ingress-nginx) for its host name. A DX **administrator** user for DXClient (it pushes the Script Applications and creates the pages with XMLAccess) |
| **PostgreSQL** | **Required in version 2.x** (tested with PostgreSQL 18 / CloudNativePG), reachable from the cluster, and a **superuser** Secret (keys `username` and `password`) so that the chart creates its database and user. If you do not have one, the labs install it in about 3 minutes: [External dependencies](https://github.com/europesip/hcl-dx-compose-labs/blob/main/external-deps/GUIDE.md) (`external-deps/02-postgres.sh`). **Other databases will be supported in later releases** |
| **Users** | The DX users of `demo.people` (in the labs, the OpenLDAP of Lab 2A) |
| **HCL DX IQ** (optional) | For the assistant: IQ installed (Lab 3 of the labs) |
| **Images and chart** | Public, on `ghcr.io/europesip`: no registry login needed |
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
scriptapps:                                       # subchart hcl-dx-scriptapp: repeat the DX settings
  dx:
    host: dx-demo.apps.promox.europesip-lab.com
    credentialsSecret: orbita-dx
    caSecret: orbita-dx-ca
  dxclient:
    acceptLicense: true                           # you accept the HCL DXClient license
# demo.people: who plays each role (default: the labs users)
```

**3. Install**:

```bash
helm upgrade --install orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita --version 3.1.0 \
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

### Options: pages and what the apps show

**Pages (optional).** By default the chart creates one DX page per app under *Home* (`pages.create: true`). To place
the six Script Applications yourself (in your own pages, with your own layout), install with `pages.create: false`:
the apps are still pushed to WCM (*Script Application Library › Script Applications*, titles «ÓRBITA · …»), and you
add each one to the page you want. Then set `pages.base` (and keep the friendly names `mi-intranet`, `fichaje`,
`vacaciones`, `gastos`, `aprobaciones`, `quiosco`), so that the apps link to each other correctly.

**Language.** Each user sees ÓRBITA in the language of their DX profile (`preferredLanguage`). Without one, ÓRBITA uses
the language DX chose for the page, and then the browser language. English is used for any language other than
Spanish or English. Messages, dates, amounts and notifications follow it. The demo data stays in Spanish.

**Settings of each application on its page.** Whoever edits the page in DX (**edit mode**, with the Editor role or
higher on the application) sees «⚙ Settings of this application». There they choose, for that instance only, the
header parts, the footer and the language (*Automatic*, Español, English). They are stored as preferences of the Script
Application in DX, survive chart upgrades, and anything not changed follows the `ui.*` values below.

**Example theme.** By default the chart also deploys an ÓRBITA theme for its pages, so that they look like a finished
intranet that runs on HCL DX:

- A copy of the HCL DX **Portal 8.5** theme, made at install time from **your own DX** (WebDAV only, no EAR: HCL's
  theme files are not part of ÓRBITA), with an ÓRBITA header: the **company logo**, **"Powered by HCL Software"** and a
  **button that opens the ÓRBITA assistant**. Everything else (toolbar, menus, edit mode) is the Portal 8.5 theme.
- The images are in a **DAM collection** (`ÓRBITA`): to put your company logo, upload a new version of
  `company-logo.png` there; the theme always shows its latest version. Or give it at install time with
  `--set theme.logoBase64=$(base64 -w0 logo.png)`.
- It is assigned **to the ÓRBITA pages only**; the rest of the portal keeps its theme.

```yaml
theme:
  enabled: true          # false: the pages keep the theme they have
  hclLogo: true          # "Powered by HCL Software"
  assistantButton: true  # assistant button in the header (only on pages with an ÓRBITA app)
  headerBackground: "linear-gradient(90deg, #15123B 0%, #2A1B6B 55%, #0B2A6F 100%)"
```

**Header and footer.** The apps run inside DX pages, so your DX theme may already show some of their header, such as
the user's name. Hide in the apps whatever the theme already shows:

```yaml
ui:
  header:
    title: true          # ÓRBITA logo, app title and subtitle
    homeLink: auto       # "Mi intranet" link (auto: hidden with the example theme, whose page menu has it)
    assistant: auto      # AI assistant button (auto: hidden when the example theme shows it in the page header)
    notifications: true  # notification bell
    user: auto           # user's name, role and avatar (auto: hidden with the example theme, which already shows it)
  footer: true
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
#  Fetched 26 tools from http://orbita-api.dx-shared.svc.cluster.local:9081
```

In the labs, `scripts/registrar-mcp-en-iq.sh` does exactly this (and does not duplicate the entry).

- **After every `helm upgrade` of IQ, apply the patch again**: the chart regenerates the list. With Helm 4 that
  upgrade also needs `--force-conflicts`, because the key now belongs to `kubectl patch`.
- **Test** in the IQ chat, as a demo user: «How many days of holiday do I have left?» ([more questions](docs/ai-questions.md)). Each call is audited in the
  `orbita-api` log (`ORBITA MCP auditoria herramienta=… usuario=…`).
- Tools and security model: [docs/mcp.md](docs/mcp.md) (in Spanish).

### Choosing which MCP tools to publish

Every tool definition the Integrator receives goes into the prompt of **every** call to the model, so each tool costs
tokens (and money) even when it is not used. All 26 ÓRBITA tools are about **4,700 tokens** (the HCL tools are about
30,000). By default all of them are published; to publish fewer, use `mcp.tools` in your values:

```yaml
mcp:
  tools:
    enabled: [vacaciones, fichaje]   # only these areas or tools (empty: all)
    disabled: [fichar]               # minus these
    readOnly: false                  # true: only the 14 query tools
```

| Area | Tools | ≈ tokens |
|---|---|---|
| `general` | quien_soy, resumen_dia, avisos, avisos_marcar_leidos | 470 |
| `fichaje` | fichaje_hoy, fichaje_mes, equipo_ahora, fichar, fichaje_corregir | 960 |
| `vacaciones` | vacaciones_saldo, vacaciones_solicitudes, ausencias_equipo, vacaciones_solicitar, vacaciones_cancelar | 910 |
| `gastos` | gastos_resumen, nota_gasto, nota_gasto_crear, gasto_anadir, nota_gasto_enviar, viaje_solicitar, viaje_cancelar, pagos_pendientes | 1,550 |
| `aprobaciones` | aprobaciones_pendientes, solicitud_resolver, solicitud_comentarios, solicitud_comentar | 780 |
| `readOnly: true` | the 14 query tools of all areas | 1,860 |

After a `helm upgrade` that changes the tools, restart the Integrator (`kubectl -n dx-demo rollout restart
deployment/dx-iq-integrator`) so that it reads the new list; the `orbita-api` log shows which tools are active.

## Upgrade and uninstall

- **Upgrade**: `helm upgrade orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita --version <new> -n dx-shared -f
  orbita-values.yaml`. New migrations are applied at start-up; data are kept. The Script Applications are updated in
  place on their pages, and the existing pages keep their layout and the settings of each application.
- **From 2.x to 3.0**: the assistant button now opens ÓRBITA's own assistant, which needs a LiteLLM
  (`assistant.litellm.*`). Without LiteLLM, keep the IQ chat with `assistant.backend: iq`, or hide the button with
  `none`. The notifications created from 3.0 are shown in each user's language; the earlier ones stay in Spanish.
- **Uninstall**: `helm -n dx-shared uninstall orbita`. The database, its Secret `orbita-db`, the Script Applications
  and the pages stay (pages may be in use); remove the pages in DX and the database in PostgreSQL if you no longer need
  them. Remove ÓRBITA from the IQ list with the same patch, without its URL. The example theme (`orbita.theme`, WebDAV `OrbitaTheme`) and its DAM collection `ÓRBITA` stay too.

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
docs/                   illustrated manual (PDF, EN/ES), AI questions (EN/ES), functional spec, MCP and REST Client tests
```

## Development

- **Back end**: `mvn -f api/pom.xml package` (Java 21). **Interface**: `cd web && npm ci && npm run build:scriptapps`.
- **Images**: CI builds and tests both images; a push to `main` publishes `:main`, a tag `v3.1.0` publishes `:3.1.0`
  and the chart.
- **A new operation**: method in `Api.java` (or `Gastos.java`), its route in `api/rutas.json`, and the interface calls
  it with `api('op', {...})`. **A schema change**: a new file `V<n>__description.sql` in `db/migration` (never edit a
  published one).

## Licence

ÓRBITA is **free and open source software** under the **[MIT licence](LICENSE)**: you may use, copy, **modify**,
distribute and sell it, also for commercial purposes and in your own products, keeping the copyright and licence
notice. Third-party components keep their own licences: see [NOTICE](NOTICE).

## Contact and services

**Everything you need is here**: the complete source code, the Helm chart and the installation procedures. You can
install and run ÓRBITA on your own, with no obligation.

If you would like some help, EUROPESIP, the team behind ÓRBITA, offers **optional** services around it:

- **Getting started**: installation on your environment, a review of your prerequisites and values, and a first
  hand-over session for your team.
- **Customisation and branding**: your corporate identity, new features, your own rules (holiday policy, expense
  limits, approval flows) and integration with your DX theme.
- **Integrations** with your corporate systems: Microsoft Teams, CRM, HR and payroll, ERP, reporting and metrics, your
  own databases or AI models.
- **Upgrades and support**: new ÓRBITA, HCL DX and HCL DX IQ versions, and support with an agreed response time.
- **Packs of hours** for any of the above, used whenever you need them.

📧 [info@europesip.com](mailto:info@europesip.com) · 🌐 [www.europesip.com](https://www.europesip.com)

Copyright © 2026 EUROPESIP.
