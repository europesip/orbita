# People app

Issue: #4 · Status: Implemented (spec written after the implementation, for review) · Release: 3.2.0

## Summary
An app «Personas» (page `personas`): directory with today's availability, profile, org chart, celebrations and public
recognition between colleagues. Each person edits their profile; HR adds records and keeps the organisation details.
Part of the epic #2.

## Current behaviour
`EMPLEADO` (V1) only has name, job title, department, manager and role. There is no directory, and a DX user without a
record cannot use ÓRBITA until it is inserted in the database (`Api` throws «no tiene ficha de empleado»).

## Specification
Functional rules: [docs/ESPECIFICACION.md › Personas](../ESPECIFICACION.md). Key rules for review:
- Availability comes from today's clockings and approved absences: OFICINA, TELETRABAJO, PAUSA, FUERA, AUSENTE (with
  the return date, joining consecutive absences). Never the reason of a break, the type of an absence, clocking times,
  PIN, card or pending absences.
- Birthday (MM-DD, no year) only if the person makes it visible; the person always sees their own.
- HR: add the record of an existing DX user (unique uid, valid email, default joining date today, 22/2 days) and edit
  name, job title, department, manager, role, email, office, location, joining date and days. No manager loops; a
  person cannot be their own manager; HR cannot change its own role. A new manager and the person are notified.
- Recognition: to a colleague (not oneself), with a reason (EQUIPO, CLIENTE, IDEA, AYUDA, LOGRO) and up to 300
  characters; public; the person and their manager are notified; the sender or HR can remove it.
- Skills: up to 15, 40 characters each, without duplicates (case-insensitive).

## Acceptance criteria
- [x] Given a person is on sick leave, when a colleague opens the directory, then they see «out · back on …» and never the type of absence.
- [x] Given HR changes a manager so that someone would depend on their own team, when saving, then it is refused with a clear message.
- [x] Given HR adds the record of a DX user, when that user opens ÓRBITA, then they can use it.
- [x] Given a colleague is recognised, then they and their manager get a notification and the recognition is public.
- [ ] Installs with its Helm chart on the lab cluster and the demo users can use it (deployed on the lab dev volume; pending the new images).

## Out of scope
Profile photos; deactivating employees.

## Plan
`V4__personas.sql` (contact and profile columns in `EMPLEADO`, table `RECONOCIMIENTO`), `Directorio.java`,
`DemoPersonas.java`, `Personas.jsx`, routes `personas`, `organigrama`, `celebraciones`, `perfil`, `reconocimientos`,
MCP area `personas` (6 tools), My intranet card, chart page and Script Application `personas`.

## Test plan
Embedded PostgreSQL 17, Flyway V1-V6: 91 checks (privacy of the directory, permissions, loops, celebrations, profile
validation, recognition, demo restore, MCP count). Browser walkthrough on desktop and mobile, Spanish and English.
