# What to ask the AI about ÓRBITA

**English** · [Español](preguntas-ia.md)

Examples for **ÓRBITA's own assistant** (the «✨ Ask ÓRBITA» button of each app). They also work in the **HCL DX IQ**
chat (the ✨ button of DX), with the ÓRBITA MCP server registered. The AI acts **as the user asking**: each person sees and changes only their own data
(and their team's, if they are a manager). Anything that **changes data** is never done at once: the AI first shows a
summary and waits for you to confirm ("yes, do it"). **You can ask in English or in Spanish**: the AI answers in the
language of the question (ÓRBITA's data, such as categories and statuses, are in Spanish and the AI translates them).
The questions in Spanish: [preguntas-ia.md](preguntas-ia.md).

In brackets, the MCP tool the AI uses ([mcp.md](mcp.md)) and who can ask it in the demo.

## My day

- What do I have today? / Summarise my situation (`resumen_dia`)
- How are my hours this week? (`resumen_dia`)
- Do I have anything to approve? (`resumen_dia`)
- Who in my team is away in the next few days? (`resumen_dia`)
- Who am I in ÓRBITA? Who is my manager? (`quien_soy`)
- Do I have unread notifications? (`avisos`) · Mark them all as read (`avisos_marcar_leidos`)

## Time tracking

- Have I clocked in today? Since when am I working? How many hours today? (`fichaje_hoy`)
- Clock me in, working from home (`fichar`)
- I'm going for lunch: clock a break (`fichar`, reason COMIDA) · I'm back (`fichar`, REANUDAR) · Clock me out (`fichar`, SALIDA)
- I'm going to the doctor: clock a break for the doctor (`fichar`, MEDICO: counts as working time)
- How many hours did I work in October? What is my balance this month? (`fichaje_mes`)
- Which days this month did I not clock out? (`fichaje_mes`)
- On Tuesday I forgot to clock out: I left at 18:05 after a customer visit. Ask for the correction (`fichaje_corregir`)
- *Manager:* Who in my team is working now? Who is working from home today? (`equipo_ahora`; `andres`)
- *Manager / HR:* How many hours did macarena work this month? (`fichaje_mes` with employee; `andres`, `patricia`)

## Time off

- How many days of holiday do I have left? And personal days? When is my next holiday? (`vacaciones_saldo`)
- Which time-off requests do I have this year, and their status? Was my December trip approved? (`vacaciones_solicitudes`)
- Book me holidays from 9 to 11 December (`vacaciones_solicitar`)
- Ask for a personal day next Friday (`vacaciones_solicitar`)
- Cancel my December holiday request (`vacaciones_solicitudes` + `vacaciones_cancelar`)
- Who in the team is on holiday in December? Which bank holidays are there this month? (`ausencias_equipo`)
- Would I overlap with anybody if I take the week of 14 December? (`ausencias_equipo`)

## Expenses and travel

- How much have I spent this year? In which category do I spend most? (`gastos_resumen`)
- Do I have expense reports waiting to be paid? How much am I owed? (`gastos_resumen`)
- What is in my Valencia expense report and how much is it? (`nota_gasto`)
- Create an expense report "Customer visits in Seville" (`nota_gasto_crear`)
- Add a lunch of €42.80 with €3.89 VAT yesterday, with the customer Grupo Sur (`gasto_anadir`)
- Add 186 km Madrid–Toledo and back on Monday (`gasto_anadir`, KILOMETRAJE)
- The lunch was over €30: justify it, we were four (`gasto_anadir` with justification)
- Send the Seville report to my manager (`nota_gasto_enviar`)
- Ask for a trip to Barcelona on 2–3 December to meet the distributor, about €450 (`viaje_solicitar`)
- Cancel my Barcelona trip (`gastos_resumen` + `viaje_cancelar`)
- *Accounting:* Which reports are approved and waiting to be paid? How much in total? (`pagos_pendientes`; `german`)

## Approvals (managers and HR)

- What do I have to approve? Does any holiday request overlap with another one? (`aprobaciones_pendientes`; `andres`)
- What is in eduardo's mileage report? (`aprobaciones_pendientes` + `nota_gasto`)
- Approve macarena's holidays · Approve eduardo's time correction (`solicitud_resolver`)
- Reject the Barcelona trip: ask for a tighter budget (`solicitud_resolver`, with a comment)
- What was said in eduardo's expense report? (`solicitud_comentarios`)
- Ask eduardo whether the Toledo car park was during the customer visit (`solicitud_comentar`)

## Combined questions

- Can I take Friday off? Check my balance and whether someone in the team is away that day.
- Prepare my month-end: hours, days not closed and expenses not sent yet.
- Before I leave: clock me out and tell me my hours this week.
- *Manager:* Give me a team summary: who works today, who is away this week and what I have to approve.

## What the AI does not do (on purpose)

Pay expense reports, restore the demo data, delete reports or lines, and export CSV files: they are bulk or
irreversible actions done in the app, not with one sentence. Nor can it act as somebody else: the identity is your DX
session.
