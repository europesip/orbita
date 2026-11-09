# HR communication app

Issue: #3 · Status: Implemented (spec written after the implementation, for review) · Release: 3.2.0

## Summary
A seventh app, «Comunicación con RRHH» (page `comunicacion`): notices from HR with read tracking and acknowledgement,
private questions to HR with suggested answers, and the FAQ. Part of the epic #2.

## Current behaviour
Before this change there was no channel between HR and the staff; only the notification bell of each app.

## Specification
The functional rules are in [docs/ESPECIFICACION.md › Comunicación con RRHH](../ESPECIFICACION.md). In short:
- Notices to everybody, a department (`DEPARTAMENTO:<name>`) or a role (`ROL:<role>`); optional acknowledgement with a
  deadline; HR sees who has read and acknowledged, reminds and archives. Links only `https://` or a portal path `/...`.
- Questions to HR: visible only to the employee and HR (never to the manager); OPEN → IN_PROGRESS (when HR comments) →
  RESOLVED with a final answer; rating 1-5 and reopen by the employee. Suggested answers from the FAQ and notices.
- FAQ maintained by HR. The anonymous pulse started here and moved to the Surveys app (#6).

## Acceptance criteria
- [x] Given HR publishes a notice that needs acknowledgement, when a recipient opens it, then they can acknowledge it and HR sees who is missing and can send a reminder.
- [x] Given an employee sends a question to HR, when their manager opens the app, then the manager cannot see it.
- [x] Given an employee types a question, when it matches the FAQ or a notice, then suggested answers appear.
- [ ] Installs with its Helm chart on the lab cluster and the demo users can use it (pending the new images).

## Out of scope
Attachments in questions; email notifications.

## Plan
`Comunicacion.java`, `DemoComunicacion.java`, `V3__comunicacion.sql`, `Comunicacion.jsx`, routes in `api/rutas.json`,
MCP area `comunicacion` (5 tools), chart page and Script Application `comunicacion`.

## Test plan
Embedded PostgreSQL 17 (Flyway V3) with permission and privacy checks; browser walkthrough as macarena, jordi, patricia.
