# ÓRBITA · Frequently asked questions

**English** · [Español](faq.es.md) · [README](../README.md)

- [The product](#the-product)
- [Cost and licence](#cost-and-licence)
- [Installation](#installation)
- [Theme and DAM](#theme-and-dam)
- [Artificial intelligence](#artificial-intelligence)
- [Languages and localisation](#languages-and-localisation)
- [Security and data](#security-and-data)
- [Technology](#technology)
- [Services from EUROPESIP](#services-from-europesip)
- [Contact](#contact)

## The product

**What is ÓRBITA?**
An employee self-service intranet for **HCL DX Compose**: time tracking (also from a kiosk with a PIN or QR card), time
off, expenses and travel, approvals, a home page with each person's day, and an AI assistant that answers and acts for
every employee. It is made by **EUROPESIP**.

**Who is it for?**
Organisations that run, or want to run, their intranet on HCL DX, and HCL partners who want a complete, real
application to show what DX Compose can do. Employees, managers, HR and accounting each see what concerns them.

**Which HCL DX version does it need?**
**HCL DX Compose CF239** (Kubernetes or OpenShift). It uses DX's own features: Script Applications, the DX session,
the DAM, WebDAV themes and, optionally, HCL DX IQ.

**Does it replace our HR or payroll software?**
No. ÓRBITA covers the day-to-day employee processes inside the portal. It can exchange data with your HR, payroll or
ERP systems (CSV exports are included; direct integrations are a [service](#services-from-europesip)).

**Can I try it with sample data?**
Yes. By default the chart loads demo data (people, clockings, holidays, expense reports) mapped to your DX users
(value `demo.people`), and HR can restore them from the app. The demo data are in Spanish.

## Cost and licence

**Is it really free of charge?**
Yes. ÓRBITA is open source under the **MIT licence**: no licence fees, no per-user prices, no time limit. The complete
source code, the Helm chart, the container images and the manuals are public.

**Can we use it commercially, modify it or include it in our own offering?**
Yes. The MIT licence allows use, copy, modification, distribution and sale, also commercially, as long as the
copyright and licence notice is kept.

**So what does cost money?**
What ÓRBITA runs on: your HCL DX Compose licence, the Kubernetes cluster, the PostgreSQL database and, if you use the
AI assistant, the AI model (your own, or the tokens of a provider). EUROPESIP only charges for the
[optional services](#services-from-europesip) you ask for.

**Is there a warranty or official support?**
The software is provided as is (see [LICENSE](../LICENSE)). Professional support, maintenance and upgrades are
available from EUROPESIP as a service. ÓRBITA is not an HCL product and is not supported by HCL.

## Installation

**What do I need?**
HCL DX Compose CF239, Helm, PostgreSQL (ÓRBITA creates its own database and user), a DX administrator for DXClient and
the CA of the DX certificate. For the AI assistant, a LiteLLM or any OpenAI-compatible endpoint (optional).

**How is it installed? How long does it take?**
With **one Helm command** (README, *Installation with Helm*), in about 3 minutes. The chart creates the database,
deploys the API, pushes the six Script Applications with DXClient, creates their pages and the example theme. A
step-by-step guide is in **Lab 5** of the [HCL DX Compose labs](https://github.com/europesip/hcl-dx-compose-labs).

**Do I need HCL DX IQ?**
No. ÓRBITA has its own AI assistant. HCL DX IQ is an optional integration.

**Can I install it without AI?**
Yes: `assistant.backend: none` hides the assistant; everything else works the same.

**Can I place the apps in my own pages?**
Yes: `pages.create: false` pushes the Script Applications to WCM and you add them to the pages you want.

**Our cluster has no internet access. Can we use a private registry?**
Yes. Copy the images (`ghcr.io/europesip/orbita/orbita-api` and `orbita-scriptapps`, amd64 and arm64) to your
registry and set `image.repository`, `scriptapps.bundle.image` and `imagePullSecrets`.

**How are upgrades done? Are data kept?**
`helm upgrade` with the new version. Database changes are Flyway migrations applied at start-up, so data are kept.
Existing pages keep their layout and the settings of each application.

**How is it uninstalled?**
`helm uninstall`. The database, the Script Applications, the pages, the theme and the DAM collection stay (they may be
in use); remove them in DX and PostgreSQL if you no longer need them.

## Theme and DAM

**Does ÓRBITA need its own theme?**
No, it works with any DX theme. By default the chart adds an **example theme** to show a finished intranet on HCL DX.

**What does the example theme do?**
It is a copy of the HCL DX **Portal 8.5** theme with an ÓRBITA header: the **company logo**, **"Powered by HCL
Software"** and a **button that opens the ÓRBITA assistant**. The toolbar, menus, search and edit mode are the
standard Portal 8.5 ones. It is assigned to the ÓRBITA pages only: the rest of the portal keeps its theme.

**Why is it copied from our DX at install time?**
The theme files belong to HCL, so they are not shipped with ÓRBITA: the chart copies them from **your own DX** (WebDAV)
and changes only the header. It needs no EAR or Java code, so it fits the DX Compose model.

**How do we put our company logo?**
The images are in the **DAM collection `ÓRBITA`**. Upload a new version of `company-logo.png` there and the theme shows
it (it always uses the latest version). Or give it at install time: `--set theme.logoBase64=$(base64 -w0 logo.png)`.

**Can we hide the HCL logo or the assistant button?**
Yes: `theme.hclLogo: false` and `theme.assistantButton: false`.

**Can we use our corporate theme instead?**
Yes: `theme.enabled: false` keeps the theme your pages have. Then use `ui.header.*` to hide in the apps what your
theme already shows (user, notifications…). Adapting your theme to ÓRBITA, or ÓRBITA to your theme, is a
[service](#services-from-europesip).

**Who can see the images in the DAM?**
They are logos, so the collection is readable by everyone (anonymous and authenticated users). Only DX
administrators can change them.

**Can each page have different settings?**
Yes. In the DX **edit mode**, «⚙ Settings of this application» chooses the header parts, the footer and the language
of that application on that page. The settings are kept on upgrades.

## Artificial intelligence

**What can the assistant do?**
Answer and act for the employee asking: their day, clocking in and out, holiday balance and requests, expense reports
(create, add expenses, send), approvals for managers, notifications. 26 tools in total; you choose which ones are
published (`mcp.tools`). More than 60 example questions: [ai-questions.md](ai-questions.md).

**What is an MCP server?**
MCP (Model Context Protocol) is the open standard that lets an AI assistant use the tools of an application: read its
data and act on it, on behalf of the user. ÓRBITA includes its own **MCP server with more than 20 tools** (26) to work
with ÓRBITA: time tracking, time off, expenses, approvals and notifications. Its own assistant uses them, and so can
HCL DX IQ or any other MCP client.

**Can we extend the AI beyond the ÓRBITA tools?**
Yes. The AI can be extended and customised as each company needs:

- **More tools**: new MCP tools for ÓRBITA, or for your other systems (HR, ERP, ticketing…), so the assistant can
  answer and act on them too, always as the user asking.
- **RAG (retrieval-augmented generation)**: access to your own information, such as company policies, the collective
  agreement, the travel and expenses policy or internal procedures, so that answers follow your rules
  («Can I claim a taxi from the airport?»).
- **Your own instructions**: tone, language and company rules for the assistant.

EUROPESIP builds these extensions as part of its [services](#services-from-europesip).

**Can the AI do something the user is not allowed to do?**
No. It always acts as the user of the DX session, with their permissions, and asks for confirmation before changing
any data. Paying, deleting and exporting stay in the app.

**Which AI model does it use?**
The one you choose. ÓRBITA talks to **LiteLLM** (or any OpenAI-compatible API), by default with the same model alias as
HCL DX IQ (`iq-general-purpose`). Set `assistant.model` to use another one.

**Can we use our own sovereign AI, so that our data never leave the company?**
Yes. Point `assistant.litellm.url` to a model that runs in your data centre or private cloud (for example, an
open-weight model served by vLLM or Ollama behind LiteLLM). The questions and the ÓRBITA data then never leave your
network. EUROPESIP can set this up for you.

**What is sent to the model?**
The user's question, the conversation of that session, a short description of the ÓRBITA tools and the results of the
tools the model calls for that user. Nothing else from the database, and nothing from other users.

**How much does each question cost?**
The prompt is small (only the ÓRBITA tools, about 4,700 tokens with all 26), much less than a general-purpose chat.
Publishing fewer tools (`mcp.tools.enabled`, `mcp.tools.readOnly`) reduces it further. With your own model there is
no per-token cost.

**Does it work with HCL DX IQ?**
Yes. ÓRBITA includes a standard **MCP server** with the same tools: registered in the IQ Integrator, the IQ chat can
answer and act on ÓRBITA too, mixed with the HCL DX tools. IQ is meant for DX practitioners; for employees the own
assistant is cheaper. See [mcp.md](mcp.md).

**Can we use the assistant in Microsoft Teams or another chat?**
The MCP server and the REST API are standard, so they can be connected to Teams, Copilot Studio or your own chatbot.
The identity of the user must be exchanged securely: EUROPESIP offers this integration as a service.

## Languages and localisation

**Which languages does it speak?**
**English and Spanish**: interface, messages, dates, amounts and notifications. Each user sees it in the language of
their DX profile; without one, in the language of the page and then of the browser. The editor of a page can fix the
language of each application. The assistant answers in the language of the question.

**Can it be translated into other languages?**
Yes. The texts are in one dictionary per language (`web/src/en.js` and the server messages), so a new language is a
new dictionary. EUROPESIP can do it as a service.

**Does it follow the rules of other countries?**
The working time record follows the Spanish regulation (corrections approved by the manager, legal CSV export).
Rules for other countries (calendars, leave types, expense policies, legal records) can be adapted as a service.

## Security and data

**Does ÓRBITA store users or passwords?**
No. It asks DX who the user is with the user's own session (LtpaToken2): there are no passwords, keys or users of its
own. Single sign-on is the DX one.

**Where are the data?**
In **your** PostgreSQL, in a database of its own, inside your infrastructure. ÓRBITA sends nothing to EUROPESIP or to
third parties (only to the AI model you configure, if any).

**Is the MCP server exposed?**
No. It is only reachable inside the cluster, and a NetworkPolicy lets only the IQ Integrator in. An optional token
(`mcp.tokenSecret`) can be required as well.

**Is there an audit trail?**
Every action of the assistant is logged with the user, the tool and the result. Requests and approvals keep who did
what and when.

## Technology

**What is it built with?**

| Part | Technology |
|---|---|
| Interface | React, published as six **HCL DX Script Applications** (one bundle, no Java portlets) |
| API and MCP server | Java 21, Jakarta EE 10 on **Open Liberty**, one container (`orbita-api`) |
| Database | **PostgreSQL**, schema managed with **Flyway** migrations |
| AI | OpenAI-compatible function calling through **LiteLLM**; standard **MCP** (Streamable HTTP) for HCL DX IQ |
| Deployment | One **Helm** chart (`hcl-dx-orbita`); **DXClient** pushes the apps; XMLAccess creates the pages and registers the theme |
| Theme and images | WebDAV theme (copy of Portal 8.5); logos in the **DAM** (REST API) |
| Images | Public on `ghcr.io/europesip`, for amd64 and arm64 |

**Does it modify DX or install Java code in it?**
No. It only uses supported DX Compose mechanisms: Script Applications, XMLAccess, WebDAV themes and the DAM. The
business logic runs in its own container next to DX.

**Can we extend it?**
Yes. The source code is public and documented; the REST API contract is `api/rutas.json`. New features are also
available as a service.

## Services from EUROPESIP

Everything you need to install and use ÓRBITA is included and free. If you want to go further, the team that built it
offers **optional** services:

- **Branding**: your logo, colours and your DX theme.
- **Integrations** with your systems: payroll, ERP, directory, HR tools, reports and metrics.
- **The assistant in Microsoft Teams** or your corporate chat.
- **Sovereign or private AI**: your own model, in your cloud or on your servers, so that data never leave the company.
- **New features** and processes tailored to your organisation.
- **Localisation** to other languages and regulations.
- **Maintenance and upgrades** of ÓRBITA and HCL DX Compose.
- **Installation, go-live, training and professional support.**

## Contact

- **E-mail**: [info@europesip.com](mailto:info@europesip.com)
- **Web**: [www.europesip.com](https://www.europesip.com)
- **Code, issues and suggestions**: [github.com/europesip/orbita](https://github.com/europesip/orbita)

We are happy to give you a demo.
