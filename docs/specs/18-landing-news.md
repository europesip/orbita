# Landing page and news from WCM templates (phase 1)

Issue: #18 · Part of #17 · Status: Implemented (for review) · Release: 3.2.0

## Summary
A company landing page («Portada») for ÓRBITA with news, HR notices, events, people and quick links. The news are HCL
DX WCM content created from WCM templates; anybody proposes a news item from a template in ÓRBITA, HR reviews it in
ÓRBITA and publishes it in WCM.

## Current behaviour
ÓRBITA had a personal dashboard (My intranet) but no company landing page and no news. HR notices exist in HR
communication (#3). The chart already talks to DX at install time (DXClient Job: Script Applications, pages, theme).

## Specification
**WCM, set up by the scriptapps Job** (`files/noticias.mjs`, after the theme; idempotent, what exists is kept):
- Library `news.library` (default `orbita-noticias`, title `news.title`). Access: User for all authenticated users;
  Editor for each DN in `news.editors` (LDAP groups `cn=...`/`ou=...` or users).
- Site areas: `empresa`, `personas`, `eventos`, `equipos`.
- Authoring templates, each with a presentation template linked as its default presentation:
  `noticia` (Entradilla, Imagen, Cuerpo), `breve` (Entradilla, Enlace), `evento` (Entradilla, Imagen, Fecha, FechaFin,
  Lugar, Cuerpo), `bienvenida` (Entradilla, Imagen, Puesto, Cuerpo), `logro` (Entradilla, Imagen, Equipo, Cuerpo).
  No WCM workflow (`ENABLE_WORKFLOW=false`): content is created published.
- `news.demo`: six demo news when the library is empty; their images in the DAM collection `news.damCollection`
  (readable by all authenticated users).

**Element naming** (how ÓRBITA's form shows a template element): rich text → editor; text → long text; short text whose
name starts with `Imagen` → image upload, `Fecha` → date and time, `Enlace` → link; other short text → short text.
Other element types are not filled from ÓRBITA.

**Landing page** (`portada` Script Application, first page; the theme logo links to it):
- News read from WCM v2 (`/wps/mycontenthandler/wcmrest-v2`) with the viewer's DX session; newest first; the first one
  featured; filter by section; reader with all fields. Rich text cleaned with an allowlist before rendering.
- Side column: HR notices (to acknowledge first), the open survey, upcoming events (news with `Fecha`) and holidays,
  celebrations and recognition (People).
- Quick links to the apps.

**Proposals** (ÓRBITA, table `NOTICIA_PROPUESTA`, migration V8):
- States: BORRADOR → REVISION → PUBLICADA; REVISION → DEVUELTA (back to the author) or RECHAZADA.
- The author edits in BORRADOR/DEVUELTA, sends (needs a standfirst or a body), deletes when not in review or published.
- HR (role RRHH): sees sent proposals, corrects them in REVISION, returns or rejects (comment required), publishes.
- Publishing: the reviewer's browser creates the WCM content (`POST /contents`) with their WCM rights, then
  `noticias.publicada` stores its id. Without WCM Editor rights the browser shows how to get them (`news.editors`).
- Validation on the server: headline 1-160; field types texto (≤1000, tags removed), largo (≤4000), rico (allowlist
  HTML, ≤40000), imagen (only ÓRBITA news images), fecha (ISO), enlace (http(s) or portal path, ≤500).
- Notifications: HR on a new proposal; the author on published, returned or rejected.

**Images** (table `NOTICIA_IMAGEN`): JPG or PNG by content, ≥ 200 × 100 px, ≤ 10 MB, redrawn as JPEG up to 1600 px wide
without metadata; served by `GET /orbita-api/v1/noticias/imagenes/{id}` (DX session and an ÓRBITA record; immutable
cache).

**API**: `portada.resumen`, `noticias.propuestas|propuesta|guardar|enviar|devolver|rechazar|publicada|borrar|imagen`
(see `api/rutas.json`); `/config` returns `noticias.biblioteca` and `noticias.contentComposer`.

## Why the review is in ÓRBITA and not in a WCM workflow
Tested on the lab cluster (CF238): a WCM workflow (Draft → Review → Published, stage-defined access, approvers with the
Reviewer role on the stage and on the item) works when an administrator moves items with
`POST /wcmrest-v2/item/{id}/next-stage|approve`, but the same calls answer 403 `UNAUTHORISED_ACCESS_0` for users with
Reviewer (and even Manager) rights. Creating content as an employee also needs Editor on the library's content item
type. Keeping the review in ÓRBITA lets employees have only read access in WCM.

## Acceptance criteria
- [x] Given a fresh installation, then the WCM library, sections and templates exist and the demo news are published
      (run twice: nothing is duplicated).
- [x] Given an employee, when they propose a news item from a template, then it stays in review and does not appear on
      the landing page until HR publishes it.
- [x] Given a published news item, then every employee sees it on the landing page, in Spanish or English interface.
- [x] Given an employee without WCM Editor rights, then WCM refuses direct publishing (403) and they must propose.
- [ ] Installs with its Helm chart on the lab cluster and the demo users can use it (tested through the dev volume and
      the scriptapps Job; pending new images).

## Out of scope
Events sign-up (#19) and the visual template designer (#20). Editing or withdrawing published news from ÓRBITA (done in
Content Composer).

## Test plan
- Embedded PostgreSQL 17, Flyway V1-V8: 56 automatic checks (HTML allowlist and XSS cases, images, field validation,
  permissions, states, notifications, landing summary, demo restore).
- Lab cluster: `noticias.mjs` run twice (idempotent) and from the Job; reading as an employee; publishing as an editor
  and refused as an employee; browser walkthrough: landing page (desktop and mobile), reader, propose with image and
  rich text, preview, send, review and publish as HR, the author sees it published.
