# One chart: own site, Simple-based theme and WCM settings

Issue: #28 · Status: Implemented (PR) · Release: 4.0.0 · Based on the "ÓRBITA on the Simple theme" work by Macarena
(EUROPESIP): her installer `orbita-simple` (and its chart variant `site.mode: simple`, files under `files/simple/`).

## Summary
ÓRBITA as a site of its own (`/wps/myportal/orbita/`) with a theme whose header, footer and logos are edited in WCM
(Setting page), built by the same `helm install` / `helm upgrade` as the rest of ÓRBITA: no second installer.

## Current behaviour (3.2.0)
`after-push.sh` (scriptapps Job) runs `tema.mjs` (copy of the Portal 8.5 theme with the ÓRBITA header, DAM images)
and `paginas.mjs` (one page per app below `pages.parent`). `pages.base` is the link base of the apps.

## Specification
- `pages.mode`: `site` (default) | `home` (3.x layout, unique names `orbita.<app>`). Any other value fails the render.
  Naming: we keep `pages.mode` (with `pages.site`) instead of Macarena's `site.mode: home|simple`, because it belongs
  to the other `pages.*` values (create, parent, base, items) and `site`/`home` say where the pages go.
- One step `files/sitio.mjs` (from her `install.mjs`), run by `after-push.sh`: theme, authoring templates, theme
  setting contents, ÓRBITA library (Setting fields filled only when empty), pages, access. Idempotent; adds or updates.
- Theme: copy of the static part of Simple from the portal; **`theme.html` generated from the portal's Simple
  `theme.html` + `files/site/theme/parts/`** (head links, header, footer, end of body): no HCL file in the repository
  (her open question, answered). Registration copied from Simple with a marker parameter
  `com.europesip.orbita.theme.base`.
- Migration: a registered `orbita.theme` without the marker (or with another base) is replaced: base files copied over,
  old files removed, registration updated in place (same object ID).
- Files of the site in `files/site/` (her `theme/nls.json`, `theme/images/`, `wcm/**`, `orbita.config.json`), shipped
  in the `<release>-pages` ConfigMap (`site-files.json`, `site-img-*`, `sitio.json` with the values). `{{pagesBase}}`
  placeholders in the WCM HTML.
- Credentials: the Job's `DX_USERNAME`/`DX_PASSWORD`; Basic authentication (the XMLAccess servlet answers 403 to a
  session cookie), the session cookie only for the DAM/Core APIs and as a fallback when DX refuses Basic.
- `pages.base` empty = derived (`/wps/myportal/<site.friendly>/` or `/wps/myportal/Home/`), in the API env and NOTES.

## Acceptance criteria
- [x] Defaults on a portal without ÓRBITA content: theme, libraries, Setting, site with 6 app pages + Setting, access.
- [x] Pages render with the header TOP, logo, footer and the Script Application.
- [x] A second upgrade reports everything "same / already there"; fields edited in Setting are kept.
- [x] `pages.mode: home` uses the 3.x pages (`orbita.<app>` below Home) with the new theme.
- [x] Migration path (registered theme with another base): files replaced, 69 old files removed, registration updated.
- [ ] A real 3.x → 4.0.0 upgrade on a portal with DAM (3.x needs DAM): not tested yet.

## Out of scope
Removing the 3.x pages below Home when moving to `site`; multilingual WCM content; the manual DAM tick.

## Test plan (done on a lab Compose CF239 without DAM)
`helm lint`, `helm template`; ÓRBITA 3.2.0 installed (pages below Home), then 4.0.0: site, idempotent run, home
mode, simulated migration; WebDAV writes retried (the DX WebDAV answered 400 to some parallel PUTs).
