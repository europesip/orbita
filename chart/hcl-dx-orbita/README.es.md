<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 EUROPESIP -->
# ÓRBITA, by EUROPESIP

[English](https://github.com/europesip/orbita/blob/main/chart/hcl-dx-orbita/README.md) · **Español**

Una intranet de empleados de código abierto (MIT) para HCL DX Compose: seis Script Applications (inicio, fichaje,
vacaciones, gastos, aprobaciones y quiosco), su API REST (Open Liberty + PostgreSQL), un asistente y un servidor MCP para
HCL DX IQ. Un solo `helm install` sube las apps a WCM, despliega el tema de ÓRBITA (generado a partir del tema Simple de
tu portal) y su contenido WCM, y crea el site propio `/wps/myportal/orbita/` (por defecto solo para usuarios
autenticados). No necesita el DX Delivery Operator.

## Requisitos

- HCL DX Compose (CF239) en Kubernetes, Helm 3.8+.
- Un Secret con un **administrador** de DX (claves `username`, `password`) y aceptar la licencia de HCL DXClient.
- Un PostgreSQL para los datos de ÓRBITA: el tuyo (`database.type: external`) o el de DX (`dxPersistence`).

## Instalación

```bash
helm upgrade --install orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita \
  -n orbita --create-namespace -f orbita-values.yaml --timeout 30m
```

Fichero de valores, comprobación y notas para pasar de la 3.x: [guía completa](https://github.com/europesip/orbita/blob/main/README.es.md).
Con DAM queda un paso a mano (DX no tiene API para ello): marcar «Mostrar recurso de activo digital» en los cuatro
campos de imagen de la plantilla *Setting Site Area - ST*.

## Valores habituales y recomendados

| Valor | Recomendado | Qué hace |
|---|---|---|
| `dx.host` | **obligatorio** | Nombre público de DX (lo usan el Ingress `/orbita-api` y los enlaces de las apps) |
| `scriptapps.dx.host` | **obligatorio**, igual que `dx.host` | Host de DX para el subchart que sube las Script Applications |
| `scriptapps.dx.credentialsSecret` | **obligatorio** | Secret (claves `username`, `password`) de un **administrador** de DX: sube las apps, despliega el tema y el contenido WCM y crea el sitio |
| `scriptapps.dxclient.acceptLicense` | **obligatorio** `true` | Aceptas la licencia de HCL DXClient |
| `dx.caSecret` / `scriptapps.dx.caSecret` | si DX usa una CA autofirmada o privada | Secret con `ca.crt` para confiar en el certificado de DX |
| `database.type` | `external` (tu PostgreSQL) o `dxPersistence` (el PostgreSQL de DX) | Dónde guarda ÓRBITA sus datos; ver más abajo |
| `database.host` + `database.create.superuserSecret` | con `external` | Tu PostgreSQL y un Secret de superusuario para que el chart cree la base y el usuario `orbita` |
| `database.dxPersistence.release` / `.namespace` | con `dxPersistence` | Release y namespace de `hcl-dx-deployment` |
| `pages.mode` | `site` (por defecto) | `site`: sitio propio `/wps/myportal/orbita/` con una página Setting oculta; `home`: páginas bajo Home (como en el 3.x) |
| `pages.site.friendly` / `.title` | por defecto `orbita` / «ÓRBITA» | URL y título del sitio |
| `pages.site.anonymous` | `false` (por defecto) | `false`: solo los usuarios que han iniciado sesión ven el sitio y los anónimos van al login; `true`: los anónimos también lo ven (las apps siguen necesitando usuario). Setting es siempre solo para administradores |
| `theme.enabled` | `true` | Tema de ÓRBITA (copia de Simple hecha a partir de tu DX) y su contenido WCM; `false`: usas tu propio tema |
| `theme.hclLogo` / `theme.assistantButton` | `true` | «Powered by HCL Software» y el botón del asistente en la cabecera |
| `assistant.backend` + `assistant.litellm.url` | `orbita` (por defecto) con la URL de tu LiteLLM, o `none` | `orbita`: asistente propio de ÓRBITA (necesita un LiteLLM), `iq` (chat de HCL DX IQ) o `none` (sin botón) |
| `mcp.enabled` + `mcp.networkPolicy.integratorNamespace` | `true` con HCL DX IQ | Servidor MCP para el Integrator de IQ, accesible solo desde su namespace |
| `demo.people` | tus usuarios de DX | Quién hace cada papel de la demo (RR. HH., aprobadores, empleados) |
| `ingress.className` / `ingress.tlsSecret` | tu clase de Ingress / Secret TLS | Ingress de `/orbita-api` en el host de DX |

Todos los valores: [values.yaml](https://github.com/europesip/orbita/blob/main/chart/hcl-dx-orbita/values.yaml).

## Licencia

MIT. Quien redistribuya debe conservar el aviso de copyright y la licencia. ÓRBITA no es un producto de HCL; HCL, HCL
DX y HCL DX Compose son marcas de HCL Technologies.
