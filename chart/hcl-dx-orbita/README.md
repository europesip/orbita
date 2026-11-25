<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 EUROPESIP -->
# ÓRBITA, by EUROPESIP

**English** · [Español](https://github.com/europesip/orbita/blob/main/chart/hcl-dx-orbita/README.es.md)

An open source (MIT) employee intranet for HCL DX Compose: six Script Applications (home, time tracking, time off,
expenses, approvals and kiosk), their REST API (Open Liberty + PostgreSQL), an assistant and an MCP server for HCL DX
IQ. One `helm install` pushes the apps to WCM, deploys the ÓRBITA theme (generated from your portal's Simple theme) and
its WCM content, and creates ÓRBITA's own site `/wps/myportal/orbita/` (signed-in users only by default). It does not
need the DX Delivery Operator.

## Prerequisites

- HCL DX Compose (CF239) on Kubernetes, Helm 3.8+.
- A Secret with a DX **administrator** (keys `username`, `password`), and acceptance of the HCL DXClient licence.
- A PostgreSQL for ÓRBITA's data: yours (`database.type: external`) or the one of DX (`dxPersistence`).

## Install

```bash
helm upgrade --install orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita \
  -n orbita --create-namespace -f orbita-values.yaml --timeout 30m
```

Values file, verification and upgrade notes from 3.x: [full guide](https://github.com/europesip/orbita#readme).
With DAM, one manual step remains (no DX API): tick "Show digital asset resource" in the four image fields of the
template *Setting Site Area - ST*.

## Usual and recommended values


| Value | Recommended | What it does |
|---|---|---|
| `dx.host` | **required** | Public host name of DX (the Ingress `/orbita-api` and the links of the apps use it) |
| `scriptapps.dx.host` | **required**, same as `dx.host` | DX host for the subchart that pushes the Script Applications |
| `scriptapps.dx.credentialsSecret` | **required** | Secret (keys `username`, `password`) of a DX **administrator**: pushes the apps, deploys the theme and WCM content, creates the site |
| `scriptapps.dxclient.acceptLicense` | **required** `true` | You accept the HCL DXClient licence |
| `dx.caSecret` / `scriptapps.dx.caSecret` | when DX has a self-signed or private CA | Secret with `ca.crt` to trust the DX certificate |
| `database.type` | `external` (your PostgreSQL) or `dxPersistence` (the PostgreSQL of DX) | Where ÓRBITA keeps its data; see below |
| `database.host` + `database.create.superuserSecret` | with `external` | Your PostgreSQL and a superuser Secret so the chart creates the `orbita` database and user |
| `database.dxPersistence.release` / `.namespace` | with `dxPersistence` | Release and namespace of `hcl-dx-deployment` |
| `pages.mode` | `site` (default) | `site`: own site `/wps/myportal/orbita/` with a hidden Setting page; `home`: pages under Home (3.x layout) |
| `pages.site.friendly` / `.title` | default `orbita` / «ÓRBITA» | URL and title of the site |
| `pages.site.anonymous` | `false` (default) | `false`: only signed-in users see the site, anonymous users go to the login; `true`: anonymous users see it too (the apps still need a user). Setting is always administrators only |
| `theme.enabled` | `true` | ÓRBITA theme (copy of Simple made from your DX) and its WCM content; `false`: use your own theme |
| `theme.hclLogo` / `theme.assistantButton` | `true` | «Powered by HCL Software» and the assistant button in the header |
| `assistant.backend` + `assistant.litellm.url` | `orbita` (default) with your LiteLLM URL, or `none` | `orbita`: ÓRBITA's own assistant (needs a LiteLLM), `iq` (HCL DX IQ chat) or `none` (no button) |
| `mcp.enabled` + `mcp.networkPolicy.integratorNamespace` | `true` with HCL DX IQ | MCP server for the IQ Integrator, only reachable from its namespace |

All values: [values.yaml](https://github.com/europesip/orbita/blob/main/chart/hcl-dx-orbita/values.yaml).

## Licence

MIT. Redistributions must keep the copyright notice and the licence. ÓRBITA is not an HCL product; HCL, HCL DX and
HCL DX Compose are trademarks of HCL Technologies.
