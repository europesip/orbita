# Servidor MCP de ÓRBITA

Servidor [MCP](https://modelcontextprotocol.io) dentro del back de ÓRBITA. Sirve para que un asistente de IA
(DX IQ, Claude…) consulte y haga gestiones de un empleado: cuántas vacaciones le quedan, pedir unos días, ver sus
gastos, aprobar solicitudes…

## Estado (entrega)

| Pieza | Estado |
|---|---|
| `POST /mcp` (MCP "Streamable HTTP", JSON-RPC 2.0, sin sesión) | ✅ Hecho y probado |
| `GET /probe/ready` (comprueba también la base de datos) | ✅ Hecho y probado |
| Puerto propio **9081**, solo dentro del clúster (sin Ingress) | ✅ Hecho y probado |
| NetworkPolicy: al 9081 solo llega el Integrator de DX IQ | ✅ Hecho y probado |
| Token Bearer opcional (`ORBITA_MCP_TOKEN`) | ✅ Hecho (desactivado: no hay secret `suite-mcp`) |
| Auditoría de cada `tools/call` en el log | ✅ Hecho y probado |
| Confirmación previa en las herramientas que modifican datos | ✅ Hecho y probado |
| Herramientas de ejemplo: `vacaciones_saldo`, `vacaciones_solicitar` | ✅ Hechas y probadas |
| **Resto del catálogo** (tabla de abajo) | ⏳ Pendiente |
| Registro en DX IQ (`k8s/06-mcp-iq.sh`) | ✅ Hecho: el Integrator carga las herramientas de ÓRBITA |
| Prueba con el chat de DX IQ | ✅ «¿Cuántos días de vacaciones le quedan a lucia.martin?» → usa `vacaciones_saldo` |
| Asistente dentro de ÓRBITA (botón «✨ Pregúntale a ÓRBITA», `src/asistente.jsx`) | ✅ Hecho y probado en navegador: pasa el uid del usuario conectado a la IA |
| Probar en DX IQ las herramientas nuevas que se añadan | ⏳ Pendiente (redesplegar y reiniciar el Integrator: `k8s/06-mcp-iq.sh`) |

## Requisitos de partida

1. El back incorpora un servidor MCP con herramientas para preguntar y hacer gestiones con IA: vacaciones (cuántas me
   quedan, pídeme vacaciones para tal fecha), gastos y lo que se considere útil.
2. Cada herramienta recibe como parámetro el **usuario** sobre el que se hace la operación.
3. Métodos **`POST /mcp`** y **`GET /probe/ready`** en el puerto de su URL base.

## Arquitectura

```
 DX IQ Integrator (dx-demo) ──HTTP──► suite-api.dx-shared.svc.cluster.local:9081
                                        ├─ POST /mcp          McpServlet   (orbita-mcp.war, raíz "/")
                                        └─ GET  /probe/ready  ProbeServlet
 Script Applications ──Ingress /suite-api──► :9080 /suite-api/... (suite-api.war, sin cambios)

 Mismo pod y mismo Open Liberty; dos WAR atados cada uno a su puerto con virtual hosts.
 Las herramientas llaman a Despachador.ejecutar(op, parámetros, usuario): la MISMA API y los MISMOS permisos que
 usan las Script Applications.
```

**URL base: `http://suite-api.dx-shared.svc.cluster.local:9081`.** Es lo que se registra en DX IQ: él añade `/mcp` y
`/probe/ready`.

| Fichero | Contenido |
|---|---|
| `mcp/java/com/demo/orbita/mcp/McpServlet.java` | Protocolo: `initialize`, `ping`, `tools/list`, `tools/call`, notificaciones (202), errores JSON-RPC, token y auditoría |
| `mcp/java/com/demo/orbita/mcp/Herramienta.java` | Definición de una herramienta, constructor de esquemas (`Esquema`), llamada a la API (`Llamada.api`) y confirmación |
| `mcp/java/com/demo/orbita/mcp/Herramientas.java` | **Catálogo: aquí se añaden las herramientas** |
| `mcp/java/com/demo/orbita/mcp/ProbeServlet.java` | `/probe/ready` |
| `mcp/web.xml`, `mcp/ibm-web-bnd.xml` | Descriptor del WAR y su enlace al virtual host `mcp_host` (puerto 9081) |
| `k8s/server.xml` | Endpoints 9080/9081, virtual hosts, `jsonp-1.1`, `orbita-mcp.war` en la raíz |
| `k8s/suite-api.yaml` | Puerto `mcp` (9081) en el contenedor y el Service; `ORBITA_MCP_TOKEN` (opcional) |
| `k8s/networkpolicy.yaml` | Quién puede llegar al 9081 |
| `k8s/06-mcp-iq.sh` | Registro en DX IQ |
| `mcp/pruebas.http`, `mcp/claude-code.mcp.json` | Pruebas con REST Client y con Claude Code |

## Protocolo

MCP 2025-06-18 (también acepta 2025-03-26 y 2024-11-05), transporte Streamable HTTP **sin sesión**, igual que el
MCP de HCL DX IQ. Las respuestas siempre son `application/json`: no se abren flujos SSE.

| Petición | Respuesta |
|---|---|
| `initialize` | `protocolVersion`, `capabilities.tools`, `serverInfo` (`orbita-mcp` 1.0.0), `instructions` |
| `notifications/*` (sin `id`) | `202 Accepted`, sin cuerpo |
| `ping` | `{}` |
| `tools/list` | Herramientas con `inputSchema` (JSON Schema) y `annotations` (`readOnlyHint`…) |
| `tools/call` | `content` (texto) + `structuredContent` (JSON) + `isError` |
| Método desconocido / JSON roto / lote (array) | Error JSON-RPC `-32601` / `-32700` / `-32600` |
| `GET` o `DELETE /mcp` | `405` |

Un error de negocio («no te quedan días», «usuario sin ficha de empleado») no es un error JSON-RPC: es un resultado
con `isError: true` y el mensaje en `content`, para que el modelo lo lea y corrija.

## Cómo añadir una herramienta

En `Herramientas.TODAS`, siguiendo los dos ejemplos que ya hay:

```java
new Herramienta("fichaje_hoy", "Fichaje de hoy",
    "Indica si el empleado ha fichado hoy, desde qué hora y cuánto lleva trabajado. Úsala para '¿he fichado?'.",
    Esquema.conUsuario(), true,                 // true = solo consulta
    l -> l.api("fichaje.estado")),
```

- **Nombre** en `snake_case`. La **descripción** es para el modelo: cuándo usarla y qué devuelve. De ella depende que la IA elija bien.
- **`Esquema.conUsuario()`** siempre: `usuario` es obligatorio y la operación se ejecuta con los permisos de esa persona.
  Añade `.texto(...)`, `.fecha(...)` (AAAA-MM-DD), `.entero(...)`, `.opciones(...)`.
- **Ejecutar**: `l.api("<op>", "clave", valor, ...)`. Devuelve el JSON de la API como resultado; si la API responde
  `{"error": ...}`, el resultado es `isError: true`.
- **Si modifica datos**: `soloLectura = false`, `.confirmar()` en el esquema y, si `!l.confirmado()`, devuelve
  `l.pedirConfirmacion("resumen legible")` sin ejecutar nada. Mira `vacaciones_solicitar`.

Para desplegar: tarea de VS Code **ÓRBITA: cambio del MCP (→ orbita-mcp)** (`k8s/01-construir.sh` + `k8s/04-api.sh`).

## Catálogo pendiente

Operaciones de la API en `portlet/java/com/demo/suite/Api.java` (método `ejecutar`) y `Gastos.java`.

| Herramienta | Operación y parámetros | Tipo | Notas |
|---|---|---|---|
| `vacaciones_solicitudes` | `vac.anio` (`anio`) | Consulta | Solicitudes del año y su estado |
| `vacaciones_cancelar` | `vac.cancelar` (`id`) | Modifica | Solo las suyas pendientes. El `id` sale de `vacaciones_solicitudes` |
| `ausencias_equipo` | `vac.calendario` (`anio`, `mes`) | Consulta | Quién falta en su equipo |
| `fichaje_hoy` | `fichaje.estado` | Consulta | Si ha fichado, horas de hoy |
| `fichaje_mes` | `fichaje.mes` (`anio`, `mes`) | Consulta | Horas, saldo e incidencias (días sin cerrar) |
| `gastos_resumen` | `gastos.resumen` | Consulta | Gastos del año por categoría, notas y pendiente de cobro |
| `gastos_nota` | `gastos.nota` (`id`) | Consulta | Detalle de una nota (líneas, importes, estado) |
| `viaje_solicitar` | `viaje.solicitar` (`destino`, `motivo`, `desde`, `hasta`, `estimado` en euros: `350` o `350,50`) | Modifica | Queda pendiente del responsable |
| `aprobaciones_pendientes` | `apr.pendientes` | Consulta | Para responsables, RRHH y administración |
| `aprobar` / `rechazar` | `apr.resolver` (`clase` = `AUSENCIA`/`CORRECCION`/`NOTA`/`VIAJE`, `id`, `decision` = `APROBAR`/`RECHAZAR`, `comentario`) | Modifica | La API comprueba que la solicitud es de su equipo |
| `resumen_dia` | `inicio.resumen` | Consulta | El panel de Mi intranet en una llamada |
| `avisos` | `avisos.lista` | Consulta | Avisos de la campana |

Fuera de alcance a propósito: `demo.reiniciar`, pagos (`gastos.pagar`), borrados de notas o líneas y exportaciones
CSV. Son acciones masivas o irreversibles que no deberían quedar a una sola frase de la IA.

Tipos de ausencia: `VACACIONES`, `ASUNTOS_PROPIOS`, `PERMISO`, `BAJA`. Usuarios de demo y roles: ver `../README.md`.

## Seguridad

El usuario llega **como parámetro** y lo rellena la IA. Quien llegue a `/mcp` puede actuar como cualquier empleado,
y un modelo puede equivocarse de persona o ser manipulado con un texto malicioso (*prompt injection*). Por eso:

1. **Red**: el 9081 no está en el Ingress, y `k8s/networkpolicy.yaml` solo deja entrar al Integrator de DX IQ. Para
   otro cliente del clúster, añade un bloque `from` en ese fichero. `kubectl port-forward` sirve para probar porque
   no pasa por la política.
2. **Token opcional**: crea el secret y redespliega:
   `kubectl -n dx-shared create secret generic suite-mcp --from-literal=token=<valor> && k8s/04-api.sh`.
   A partir de ahí el MCP exige `Authorization: Bearer <valor>`. Antes, comprueba que el cliente (DX IQ) puede enviar
   esa cabecera.
3. **Confirmación**: las herramientas que modifican datos no hacen nada sin `confirmar: true`. La primera llamada
   devuelve un resumen que el asistente debe enseñar al usuario.
4. **Permisos de la API**: cada operación comprueba lo que esa persona puede ver y hacer (un empleado solo lo suyo,
   un responsable solo su equipo).
5. **Auditoría**: cada `tools/call` deja en el log
   `ORBITA MCP auditoria herramienta=… usuario=… resultado=ok|error|confirmacion origen=<ip>`. Tarea de VS Code
   **ÓRBITA: auditoría del MCP**.

**Asistente de ÓRBITA:** el panel de chat de la aplicación añade a la primera pregunta de cada sesión un contexto con
el uid del usuario conectado («cuando una herramienta pida "usuario", usa "lucia.martin"»). Así el empleado pregunta
«¿cuántas vacaciones me quedan?» sin decir quién es. Es una indicación para el modelo, no un control de seguridad.

**Pendiente de decidir:** si DX IQ pasa la identidad del usuario conectado al portal (por cabecera o en los
argumentos), es preferible usarla en lugar de fiarse del parámetro `usuario`, o al menos comprobar que coinciden.
Revisarlo al registrar el MCP en IQ.

## Probar

- **Todo**: `k8s/99-verificar.sh` (al final: probe, initialize, tools/list, `vacaciones_saldo` y la NetworkPolicy).
- **A mano**: tarea **ÓRBITA: túnel MCP (localhost:9081)** y `mcp/pruebas.http` con REST Client. El puerto local
  **tiene que ser 9081**, porque el virtual host del MCP solo acepta `Host: …:9081`.
- **Con Claude Code**, con el túnel abierto: `claude mcp add --transport http orbita http://localhost:9081/mcp`, o copia
  `mcp/claude-code.mcp.json` como `.mcp.json` del proyecto. Después pregunta, por ejemplo: «¿cuántas vacaciones le
  quedan a lucia.martin?».
- **Con DX IQ** (ya registrado): `k8s/06-mcp-iq.sh` añade la URL base a la lista de MCP del Integrator, lo reinicia y
  muestra las herramientas cargadas. Repítelo tras añadir herramientas (el Integrator las lee al arrancar) y después
  de cada `helm upgrade` de IQ (que regenera la lista). Desde el terminal, como un usuario del portal:
  `IQ_USER=lucia.martin IQ_PASSWORD=demo1234 IQ_LANG=es <labs>/lab3-iq-openrouter/06-iq-chat-test.sh "¿Cuántas vacaciones me quedan?"`

## Avisos técnicos

- El virtual host del MCP solo admite el alias `*:9081`: Liberty rechaza `*:*` fuera de `default_host`.
- `orbita-mcp.war` lleva su propia copia de la lógica (`portlet/java`) y usa la misma fuente de datos
  `jdbc/suiteIntranet`. En una instalación desde cero, las tablas las crea quien acceda primero (la API o el MCP).
- La prueba de `vacaciones_solicitar` con `confirmar: true` crea una solicitud real. Cancélala después en Vacaciones,
  o como `wpsadmin` en *Fichaje › Informes › Restaurar datos de demostración*.
