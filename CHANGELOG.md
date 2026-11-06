# Release history

**English** · [Español](CHANGELOG.es.md)

## 3.1.0 · 2026-11-06 · An example theme

- **ÓRBITA theme** for its pages, deployed by the chart (`theme.*`, on by default): a copy of the HCL DX Portal 8.5
  theme made from your own DX at install time, with an ÓRBITA header showing the **company logo**, **"Powered by HCL
  Software"** and a **button that opens the ÓRBITA assistant**. Assigned to the ÓRBITA pages only.
- The logos are in a **DAM collection** (`ÓRBITA`): change the company logo there, or give it at install time
  (`theme.logoBase64`). `theme.hclLogo` and `theme.assistantButton` can be turned off.

## 3.0.0 · 2026-11-06 · Its own assistant, in English and Spanish

- **ÓRBITA's own AI assistant** (default): the «✨ Ask ÓRBITA» button talks to the model through **LiteLLM** with only
  the ÓRBITA tools, as the user of the DX session. A much smaller prompt than the HCL DX IQ chat, so each question uses
  far fewer tokens. Model configurable (`assistant.model`, by default the same alias as HCL DX IQ,
  `iq-general-purpose`). The HCL DX IQ integration is still available (`assistant.backend: iq`) and is meant for DX
  practitioners.
- **English and Spanish**: interface, messages, dates, amounts and notifications in the language of each user's DX
  profile (`preferredLanguage`), then the page language and the browser. Notifications are stored with their data and
  shown in the reader's language. The demo data stay in Spanish.
- **Settings of each application on its page**: in the DX edit mode, «⚙ Settings of this application» chooses the
  header parts, the footer and the language for that instance only. They are kept on upgrades.
- Upgrades keep the existing pages and their layout. Amounts can be typed as 12,30 or 12.30.
- **From 2.x**: the own assistant needs a LiteLLM; without one, use `assistant.backend: iq` or `none`.

## 2.3.0 · 2026-11-06 · Fits your DX theme

- **`ui.header.*` and `ui.footer`** in the chart values: choose what the apps show in their header (title, home link,
  AI assistant, notifications, user's name and role) and footer, so that nothing appears twice when your DX theme
  already shows it. Everything is shown by default.
- Documented how to install **without pages** (`pages.create: false`) and place the Script Applications yourself.
- **Illustrated manual** in English and Spanish (PDF, `docs/manual/`).
- New **Contact and services** section: optional EUROPESIP services, with the complete code and procedures included.

## 2.2.1 · 2026-11-06 · Ask in English or Spanish

- The «✨ Pregúntale a ÓRBITA» panel answers in the language of each question (English or Spanish; before, always in
  Spanish), and the MCP server tells the model to answer in the user's language and translate ÓRBITA's data.
- English examples in the English documentation (README, Lab 5).

## 2.2.0 · 2026-11-06 · Choose the MCP tools

- **`mcp.tools`** in the chart values: publish only some areas or tools (`enabled`), remove some (`disabled`) or only
  the query ones (`readOnly`). All 26 by default (about 4,700 tokens in every prompt); areas `general`, `fichaje`,
  `vacaciones`, `gastos`, `aprobaciones`. A tool that is not published cannot be called either.
- Installation without registry login (images and chart are public), and Lab 5 in the
  [HCL DX Compose labs](https://github.com/europesip/hcl-dx-compose-labs).

## 2.1.0 · 2026-11-06 · The AI can do much more

- **MCP server with 26 tools** (2 before): my day and notifications, time tracking (status, month, team now, **clock
  in and out**, ask for a correction), time off (balance, requests, team calendar, request, cancel), expenses and travel
  (summary, report detail, **create a report, add expenses, send it**, request or cancel a trip, payments pending for
  Accounting) and approvals (pending, **approve or reject**, read and write comments). Everything that changes data
  asks for confirmation first; paying, restoring the demo, deleting and exporting stay out on purpose.
- **More than 60 example questions** by area: `docs/ai-questions.md` (EN) and `docs/preguntas-ia.md` (ES).
- README: the two ways of adding AI to ÓRBITA (the HCL DX IQ Integrator, or your own chat).
- **Public repository, images and chart**: no registry login or pull Secret is needed any more.

## 2.0.0 · 2026-11-06 · Helm chart

**Installation**
- One Helm chart, **`hcl-dx-orbita`** (`oci://ghcr.io/europesip/charts`), instead of the `k8s/01`–`06` scripts. A Job
  creates the database, a Deployment runs the API, and the subchart `hcl-dx-scriptapp` 0.2.0 pushes the six Script
  Applications and creates the pages. No `kubectl cp`, no volume for the code, no `envsubst`.
- Container images built and tested by CI: **`orbita-api`** (Open Liberty 26.0.0.9, Java 21) and
  **`orbita-scriptapps`** (the built apps), on `ghcr.io/europesip/orbita`.
- **Requires PostgreSQL** (with a superuser Secret, so that the chart creates its database and user). Other databases
  will be supported in later releases.

**Users and security**
- **Who the user is, DX says**: the API forwards the user's DX session cookie to the DX profile API. The LTPA keys
  are no longer copied from the DX Web Engine, the LDAP and basic registry are no longer replicated, and the API
  stores no DX administrator or LDAP bind credentials.
- **The MCP server acts as the IQ chat user**, identified by the DX session that the Integrator forwards. The
  `usuario` argument is gone: the model can no longer choose on whose behalf it acts.
- **Demo users by role**: the demo story is written by roles and each role is played by an existing DX user
  (`demo.people`; default: the labs users `patricia`, `andres`, `macarena`, `eduardo`, `enrique`, `jordi`, `german`).
  Users are no longer added to the OpenLDAP.
- Kiosk key generated by the chart (Secret), instead of a fixed key in the code.

**Data**
- **Flyway migrations** (`V1__esquema.sql`, …) create and upgrade the schema; an upgrade never drops data. Before,
  a schema change dropped every table and reloaded the demo.
- PostgreSQL only (Derby, from the WebSphere Portal times, is gone). Database `orbita`, user `orbita`.
- Restoring the demo empties the tables (`TRUNCATE`) and loads the data again.

**Code and API**
- Repository restructured: `api/` (Maven, Java 21, Jakarta EE 10: `core`, `rest`, `mcp`), `web/`, `images/`, `chart/`,
  `docs/`. Package `com.europesip.orbita`.
- **REST API `/orbita-api/v1`** with real HTTP methods, routes and status codes (401, 422, 404, 405), described in
  `api/rutas.json` and shared by server and interface. Before: `POST /suite-api/api` with `op=…`, always HTTP 200.
- Leftovers of WebSphere Portal 8.5 removed: `portlet/java/com/demo/suite`, `web.xml`, `ibm-web-bnd.xml`, Java 8.
- Portal pages and kiosk key come from the API (`GET /v1/config`), not from the HTML of the Script Applications.

**Licence**: PolyForm Noncommercial 1.0.0 (source-available; use and modification allowed for noncommercial
purposes).

## 1.0.0 · 2026-11-06 · First version for DX Compose

- The intranet suite of WebSphere Portal 8.5 (JSR 286 portlets) migrated to **HCL DX Compose CF238** without
  portlets: six Script Applications and a REST service, `suite-api`, on Open Liberty 26.0.0.8.
- Installation with scripts `k8s/01-construir.sh` … `06-mcp-iq.sh`: local build of the WARs (Java 8), employees added
  to the labs OpenLDAP (`lucia.martin`, `javier.gomez`… with password `demo1234`), database `suite_intranet` in the
  labs PostgreSQL, WARs copied to a volume with `kubectl cp`, Script Applications and pages with DXClient.
- SSO with the LTPA keys copied from the DX Web Engine and the DX registries replicated in the service.
- First MCP server for HCL DX IQ (`vacaciones_saldo`, `vacaciones_solicitar`), with the employee as an argument.
