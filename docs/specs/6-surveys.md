# Surveys app

Issue: #6 · Status: Implemented (spec written after the implementation, for review) · Release: 3.2.0

## Summary
The anonymous pulse of HR communication becomes its own app, «Encuestas» (page `encuestas`): templates, eight question
types, dimensions, guided answering, a report with favourability, trend and heat map, and an action plan. Part of the
epic #2.

## Current behaviour
The pulse lived in `Comunicacion.java` (V3): three question types (ESCALA, ENPS, TEXTO), up to 10 questions, no draft
or preview, results as averages per question and department.

## Specification
Functional rules: [docs/ESPECIFICACION.md › Encuestas](../ESPECIFICACION.md). Key rules for review:
- States BORRADOR → (PROGRAMADA) → ABIERTA → CERRADA (also closed when `CIERRE` has passed). Only drafts and scheduled
  surveys can be edited or deleted. A scheduled survey opens by itself on the next request after its time and notifies
  the recipients once (`UPDATE … RETURNING`).
- Types: ACUERDO, ESCALA (1-5), ENPS (0-10), SINO, UNICA, MULTIPLE, MATRIZ (items 1-5), TEXTO; up to 30 questions;
  2-10 options or statements; required/optional (text optional by default).
- Answers: `ENCUESTA_PARTICIPACION` (who) and `ENCUESTA_RESPUESTA` (what, with a random submission id, department and
  item, never user or time), in one transaction.
- Favourability: answers 4-5 of ACUERDO, ESCALA and MATRIZ, and «yes» of SINO, pooled per dimension and overall. eNPS
  from the first eNPS question. Trend: the previous survey of the same `SERIE` with enough answers.
- A block (total or department) needs `MINIMO` answers (3 to 50); a department is also hidden if it could be worked out
  by subtraction. HR sees everything; a manager only their department, no comments, no trend.
- Reminder: to recipients who have not answered, at most once every 24 hours. AI summary: only HR, only the anonymous
  comment texts, at least 3, only if the ÓRBITA assistant is configured.
- Action plan: HR (whole staff or a department) and managers (their department); visible to the recipients of the
  survey (department actions only to that department); the owner is notified.
- Existing pulse data is kept (`SERIE = 'PULSO'`); the `pulso.*` operations remain as aliases for the MCP tools.

## Acceptance criteria
- [x] Given a department with fewer answers than the minimum, or that could be worked out by subtraction, when HR opens the report, then that department is hidden.
- [x] Given a scheduled survey, when its time arrives, then it opens by itself and notifies the recipients once.
- [x] Given the previous survey of the same series has results, then the report shows the trend of the index and of each dimension.
- [x] Given a manager, when they open a report, then they see only their department and no comments.
- [x] Existing pulse surveys and answers are kept after the migration.
- [ ] Installs with its Helm chart on the lab cluster and the demo users can use it (deployed on the lab dev volume; pending the new images).
- [ ] The AI summary works with a configured model (not tested: no model in the test environment).

## Out of scope
Recurring surveys created automatically; identified (non-anonymous) surveys.

## Plan
`V6__encuestas.sql` (new columns in the pulse tables, primary key with `ITEM`, `ENCUESTA_ACCION`), `Encuestas.java`
(the pulse code leaves `Comunicacion.java`), `DemoEncuestas.java`, `Asistente.completar`, `Encuestas.jsx`,
routes `encuestas/*`, MCP area `encuestas` (3 read-only tools), chart page and Script Application `encuestas`.

## Test plan
Embedded PostgreSQL 17, Flyway V1-V6: 70 checks (anonymity columns, list visibility, all question types, validation,
favourability maths, heat map and subtraction, trend, scheduling, duplicate, reminder, action plan permissions, demo
restore). Browser walkthrough: answer, report, builder, preview, action plan, manager view, mobile and English.
