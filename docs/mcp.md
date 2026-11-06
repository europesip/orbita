# Servidor MCP de ÓRBITA

Servidor [MCP](https://modelcontextprotocol.io) dentro del back de ÓRBITA. Sirve para que HCL DX IQ (u otro asistente
de IA) consulte y haga gestiones **del usuario que pregunta**: cuántas vacaciones le quedan, pedir unos días, ver sus
gastos, aprobar solicitudes…

## Estado

| Pieza | Estado |
|---|---|
| `POST /mcp` (MCP "Streamable HTTP", JSON-RPC 2.0, sin sesión MCP) | ✅ |
| `GET /probe/ready` (comprueba la base de datos y su esquema) | ✅ |
| Puerto propio **9081**, solo dentro del clúster (sin Ingress) | ✅ |
| **Identidad por la sesión de DX** del usuario (las cookies que reenvía el Integrator) | ✅ |
| NetworkPolicy: al 9081 solo llega el Integrator de DX IQ (chart, `mcp.networkPolicy`) | ✅ |
| Token Bearer opcional (`mcp.tokenSecret`) | ✅ (desactivado por defecto) |
| Auditoría de cada `tools/call` en el log | ✅ |
| Confirmación previa en las herramientas que modifican datos | ✅ |
| Herramientas de ejemplo: `vacaciones_saldo`, `vacaciones_solicitar` | ✅ |
| **Resto del catálogo** (tabla de abajo) | ⏳ Pendiente |
| Registro en DX IQ | Manual: `scripts/registrar-mcp-en-iq.sh` (el chart de IQ no permite ampliar la lista) |

## Arquitectura

```
 DX IQ Integrator (dx-demo) ──HTTP + cookies de DX del usuario──► orbita-api.dx-shared.svc.cluster.local:9081
                                                                    ├─ POST /mcp          McpServlet   (orbita-mcp.war, raíz "/")
                                                                    └─ GET  /probe/ready  ProbeServlet
 Script Applications ──Ingress /orbita-api (host de DX)──► :9080 /orbita-api/v1/...  (orbita-api.war)

 Mismo pod y mismo Open Liberty; cada WAR atado a su puerto con un virtual host (images/api/server.xml).
 Las herramientas llaman a Despachador.ejecutar(op, parámetros, usuario): la MISMA lógica y los MISMOS permisos que
 la API REST de las Script Applications.
```

**URL base: `http://<release>-api.<namespace>.svc.cluster.local:9081`** (en los labs,
`http://orbita-api.dx-shared.svc.cluster.local:9081`). Es lo que se registra en DX IQ: él añade `/mcp` y `/probe/ready`.

| Fichero | Contenido |
|---|---|
| `api/mcp/src/main/java/com/europesip/orbita/mcp/McpServlet.java` | Protocolo: `initialize`, `ping`, `tools/list`, `tools/call`, notificaciones (202), errores JSON-RPC, identidad, token y auditoría |
| `.../mcp/Herramienta.java` | Definición de una herramienta, constructor de esquemas (`Esquema`), llamada a la lógica (`Llamada.api`) y confirmación |
| `.../mcp/Herramientas.java` | **Catálogo: aquí se añaden las herramientas** |
| `.../mcp/ProbeServlet.java` | `/probe/ready` |
| `api/core/.../SesionDx.java` | Quién es el usuario: se lo pregunta a DX con su cookie de sesión |
| `images/api/server.xml` | Puertos 9080/9081, virtual hosts y `orbita-mcp.war` en la raíz del 9081 |
| `chart/hcl-dx-orbita` | Puerto `mcp` del Service, NetworkPolicy y token opcional |
| `docs/mcp-pruebas.http`, `docs/mcp-claude-code.json` | Pruebas con REST Client y con Claude Code |

## Protocolo

MCP 2025-06-18 (también acepta 2025-03-26 y 2024-11-05), transporte Streamable HTTP **sin sesión**, igual que el
MCP de HCL DX IQ. Las respuestas siempre son `application/json`: no se abren flujos SSE.

| Petición | Respuesta |
|---|---|
| `initialize` | `protocolVersion`, `capabilities.tools`, `serverInfo` (`orbita-mcp` 2.0.0), `instructions` |
| `notifications/*` (sin `id`) | `202 Accepted`, sin cuerpo |
| `ping` | `{}` |
| `tools/list` | Herramientas con `inputSchema` (JSON Schema) y `annotations` (`readOnlyHint`…) |
| `tools/call` | `content` (texto) + `structuredContent` (JSON) + `isError` |
| Método desconocido / JSON roto / lote (array) | Error JSON-RPC `-32601` / `-32700` / `-32600` |
| `GET` o `DELETE /mcp` | `405` |

Un error de negocio («no te quedan días», «sin sesión de DX») no es un error JSON-RPC: es un resultado con
`isError: true` y el mensaje en `content`, para que el modelo lo lea.

## Cómo añadir una herramienta

En `Herramientas.TODAS`, siguiendo los dos ejemplos que ya hay:

```java
new Herramienta("fichaje_hoy", "Fichaje de hoy",
    "Indica si el usuario ha fichado hoy, desde qué hora y cuánto lleva trabajado. Úsala para '¿he fichado?'.",
    Esquema.nuevo(), true,                       // true = solo consulta
    l -> l.api("fichaje.estado")),
```

- **Nombre** en `snake_case`. La **descripción** es para el modelo: cuándo usarla y qué devuelve. De ella depende que
  la IA elija bien.
- **`Esquema.nuevo()`**: no hay parámetro de usuario. La herramienta actúa siempre como el usuario de DX que pregunta,
  con sus permisos. Añade `.texto(...)`, `.fecha(...)` (AAAA-MM-DD), `.entero(...)`, `.opciones(...)`.
- **Ejecutar**: `l.api("<op>", "clave", valor, ...)`, con las operaciones de `api/rutas.json`. Devuelve el JSON de la
  operación; si responde `{"error": ...}`, el resultado es `isError: true`.
- **Si modifica datos**: `soloLectura = false`, `.confirmar()` en el esquema y, si `!l.confirmado()`, devuelve
  `l.pedirConfirmacion("resumen legible")` sin ejecutar nada. Mira `vacaciones_solicitar`.

Para desplegarla: nueva versión de la imagen `orbita-api` (tag `v*` o push a la rama), `helm upgrade`, y
`scripts/registrar-mcp-en-iq.sh` para que el Integrator, que lee las herramientas al arrancar, las vuelva a cargar.

## Catálogo pendiente

Operaciones en `api/core/.../Api.java` (método `ejecutar`) y `Gastos.java`; rutas en `api/rutas.json`.

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
| `aprobar` / `rechazar` | `apr.resolver` (`clase` = `AUSENCIA`/`CORRECCION`/`NOTA`/`VIAJE`, `id`, `decision` = `APROBAR`/`RECHAZAR`, `comentario`) | Modifica | La lógica comprueba que la solicitud es de su equipo |
| `resumen_dia` | `inicio.resumen` | Consulta | El panel de Mi intranet en una llamada |
| `avisos` | `avisos.lista` | Consulta | Avisos de la campana |

Fuera de alcance a propósito: `demo.reiniciar`, pagos (`gastos.pagar`), borrados de notas o líneas y exportaciones
CSV. Son acciones masivas o irreversibles que no deberían quedar a una sola frase de la IA.

Tipos de ausencia: `VACACIONES`, `ASUNTOS_PROPIOS`, `PERMISO`, `BAJA`.

## Seguridad

**Quién pregunta lo dice DX, no la IA.** En cada `tools/call` el Integrator de DX IQ reenvía las cookies de sesión de
DX del usuario del chat (`LtpaToken2`). El MCP se las pasa a la API de perfil de DX (`SesionDx`) y DX contesta quién
es. No hay parámetro `usuario`: el modelo no puede elegir en nombre de quién actúa, ni un texto malicioso (*prompt
injection*) puede hacerle actuar como otra persona. Sin sesión válida, las herramientas no hacen nada.

Además:

1. **Red**: el 9081 no está en el Ingress, y la NetworkPolicy del chart solo deja entrar al Integrator de DX IQ
   (`mcp.networkPolicy.integratorNamespace` e `integratorPodLabels`). `kubectl port-forward` sirve para probar porque
   no pasa por la política.
2. **Token opcional**: `kubectl -n dx-shared create secret generic orbita-mcp --from-literal=token=<valor>` y
   `helm upgrade ... --set mcp.tokenSecret=orbita-mcp`. A partir de ahí el MCP exige `Authorization: Bearer <valor>`.
   Antes, comprueba que el cliente (DX IQ) puede enviar esa cabecera.
3. **Confirmación**: las herramientas que modifican datos no hacen nada sin `confirmar: true`. La primera llamada
   devuelve un resumen que el asistente debe enseñar al usuario.
4. **Permisos de la lógica**: cada operación comprueba lo que esa persona puede ver y hacer (un empleado solo lo suyo,
   un responsable solo su equipo).
5. **Auditoría**: cada `tools/call` deja en el log
   `ORBITA MCP auditoria herramienta=… usuario=… resultado=ok|error|confirmacion origen=<ip>`.

**Solo para desarrollo**: con la variable `ORBITA_MCP_DEV_USER=<uid>` el MCP actúa como ese usuario cuando la
llamada no trae sesión (para probar con Claude Code o REST Client). El chart no la pone nunca.

## Probar

- **Túnel**: `kubectl -n dx-shared port-forward svc/orbita-api 9081:9081`. El puerto local **tiene que ser 9081**,
  porque el virtual host del MCP solo acepta `Host: …:9081`.
- **A mano**: `docs/mcp-pruebas.http` con REST Client. Para `tools/call` hace falta la cookie `LtpaToken2` de un
  usuario de DX (cópiala del navegador, con la sesión iniciada en el portal).
- **Con Claude Code**: `docs/mcp-claude-code.json` como `.mcp.json` del proyecto, con el túnel abierto. Claude Code no
  tiene sesión de DX: solo funciona con `ORBITA_MCP_DEV_USER` en un entorno de desarrollo.
- **Con DX IQ**: `scripts/registrar-mcp-en-iq.sh` añade la URL base a la lista de MCP del Integrator, lo reinicia y
  muestra las herramientas cargadas. Repítelo tras añadir herramientas y después de cada `helm upgrade` de IQ (que
  regenera la lista). Después, en el chat de IQ con un usuario de la demo: «¿cuántas vacaciones me quedan?».

## Avisos técnicos

- El virtual host del MCP solo admite el alias `*:9081`: Liberty rechaza `*:*` fuera de `default_host`.
- `orbita-mcp.war` lleva su propia copia de la lógica (`orbita-core`) y usa la misma fuente de datos `jdbc/orbita`. El
  esquema lo crea y lo migra `orbita-api` al arrancar (Flyway); hasta entonces `/probe/ready` contesta 503.
- La prueba de `vacaciones_solicitar` con `confirmar: true` crea una solicitud real. Cancélala después en Vacaciones,
  o como RRHH en *Fichaje › Informes › Restaurar datos de demostración*.
