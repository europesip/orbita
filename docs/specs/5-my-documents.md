# My documents app

Issue: #5 · Status: Implemented (spec written after the implementation, for review) · Release: 3.2.0

## Summary
An app «Mis documentos» (page `documentos`) with each person's documentation: payslips with their amounts, social
security reports, tax certificates, contracts and certificates published by HR and Accounting, with a receipt when
requested; and documents that each person sends to HR. Part of the epic #2.

## Current behaviour
ÓRBITA has no documents per person.

## Specification
Functional rules: [docs/ESPECIFICACION.md › Mis documentos](../ESPECIFICACION.md). Key rules for review:
- Company categories: NOMINA, COTIZACION, RETENCIONES, CONTRATO, CERTIFICADO, OTRO; employee categories: JUSTIFICANTE,
  TITULACION, BANCARIO, PERSONAL, OTRO. Period AAAA-MM (payslips and social security, required), AAAA (tax certificate).
- Files: PDF, JPG or PNG checked by their content (magic bytes), 6 MB maximum, stored in `DOCUMENTO.FICHERO`.
- Payslip amounts in cents (`NOMINA`): net = gross − income tax − social security − other (±1 cent); at most one
  ordinary and one extra payslip per person and month.
- Visibility: owner; HR and Accounting see company documents of everyone (opening them does not mark them as read);
  employee documents only HR; the manager sees nothing.
- Receipt: asked by the publisher (contracts by default); only the owner signs it; the publisher is notified; a signed
  document cannot be withdrawn. Employee documents can be withdrawn while pending.
- Batch: each file is assigned by its name (DX user or full name, longest match); amounts in a CSV
  `usuario;bruto;irpf;ss[;otras]`, with or without header, decimals with comma or point.
- Default titles («Nómina de octubre de 2026») are composed in the language of the interface (`tituloAuto`).

## Acceptance criteria
- [x] Given a payslip of an employee, when their manager tries to open it, then it is refused.
- [x] Given a batch of PDFs named with the DX user or the full name and a CSV of amounts, when Accounting publishes it, then each person gets their payslip with its amounts and a notification.
- [x] Given a contract that asks for a receipt, when the person signs it, then the publisher is notified and it can no longer be withdrawn.
- [x] Given a file that is not PDF, JPG or PNG (by its content) or is larger than 6 MB, then it is refused.
- [ ] Installs with its Helm chart on the lab cluster and the demo users can use it (deployed on the lab dev volume; pending the new images).

## Out of scope
Digital signature with certificates; integration with a payroll program (the CSV is the interface).

## Plan
`V5__documentos.sql` (`DOCUMENTO`, `NOMINA`), `Documentos.java`, `Pdf.java` (minimal PDF writer for the demo documents,
marked «demo, no validity»), `DemoDocumentos.java`, `Documentos.jsx`, routes `documentos/*`, MCP area `documentos`
(3 read-only tools), My intranet badges, chart page and Script Application `documentos`.

## Test plan
Embedded PostgreSQL 17, Flyway V1-V6: 60 checks (amounts, privacy, receipt, publish, batch and CSV, send and review,
PDF structure, demo restore). Browser walkthrough with real files and a batch with a CSV; English check.
