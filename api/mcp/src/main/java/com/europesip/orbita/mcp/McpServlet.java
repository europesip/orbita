package com.europesip.orbita.mcp;

import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

import jakarta.json.Json;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonException;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonReader;
import jakarta.json.JsonStructure;
import jakarta.json.JsonValue;
import com.europesip.orbita.core.Config;
import com.europesip.orbita.ia.Herramienta;
import com.europesip.orbita.ia.Herramientas;
import com.europesip.orbita.core.SesionDx;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Servidor MCP de ÓRBITA: POST /mcp (transporte "Streamable HTTP" de MCP, sin sesión) en el puerto propio del MCP.
 *
 * Mensajes JSON-RPC 2.0 que atiende: initialize, notifications/initialized (y cualquier notificación: 202 sin cuerpo),
 * ping, tools/list y tools/call. Responde siempre application/json (no abre flujos SSE: no hay notificaciones del
 * servidor). GET y DELETE /mcp devuelven 405, como el MCP de HCL DX IQ.
 *
 * Quién pregunta: el Integrator de DX IQ reenvía en cada tools/call las cookies de sesión de DX del usuario del chat, y
 * DX dice quién es (SesionDx). Las herramientas actúan siempre como ese usuario, con sus permisos; sin sesión no hacen
 * nada. Además (docs/mcp.md): el puerto del MCP no se publica en el Ingress, una NetworkPolicy solo deja entrar al
 * Integrator y, si ORBITA_MCP_TOKEN tiene valor, se exige "Authorization: Bearer <token>".
 * Cada tools/call queda en el registro del servidor (auditoría: herramienta, usuario y resultado).
 */
@WebServlet("/mcp")
public class McpServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    /** Versiones del protocolo MCP que acepta este servidor (la primera es la preferida). */
    static final List<String> VERSIONES = Arrays.asList("2025-06-18", "2025-03-26", "2024-11-05");
    static final String NOMBRE = "orbita-mcp";
    static final String VERSION = "2.3.0";
    static final String INSTRUCCIONES = "ÓRBITA es la intranet de la empresa (fichaje, vacaciones y ausencias, gastos y viajes, "
            + "aprobaciones). Las herramientas actúan siempre como el usuario que pregunta (su sesión de HCL DX) y solo "
            + "devuelven o cambian lo que esa persona puede ver o hacer. Las herramientas que modifican datos devuelven "
            + "primero un resumen; repite la llamada con confirmar=true solo si el usuario lo confirma. Los datos de ÓRBITA "
            + "(categorías, estados, textos) están en español: responde en el idioma en que pregunta el usuario (español o "
            + "inglés) y tradúcelos si hace falta.";

    // Errores JSON-RPC
    private static final int PARSE_ERROR = -32700, INVALID_REQUEST = -32600, METHOD_NOT_FOUND = -32601, INVALID_PARAMS = -32602;

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String token = Config.tokenMcp();
        if (token != null && !java.security.MessageDigest.isEqual(("Bearer " + token).getBytes(StandardCharsets.UTF_8),
                String.valueOf(req.getHeader("Authorization")).getBytes(StandardCharsets.UTF_8))) {
            resp.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        req.setCharacterEncoding("UTF-8");
        StringBuilder cuerpo = new StringBuilder();
        char[] buf = new char[8192];
        for (int n; (n = req.getReader().read(buf)) > 0; ) cuerpo.append(buf, 0, n);

        JsonStructure mensaje;
        try (JsonReader r = Json.createReader(new StringReader(cuerpo.toString()))) {
            mensaje = r.read();
        } catch (JsonException e) {
            escribir(resp, error(JsonValue.NULL, PARSE_ERROR, "JSON no válido"));
            return;
        }
        if (!(mensaje instanceof JsonObject)) {   // MCP 2025-06-18 eliminó los lotes (arrays) de JSON-RPC
            escribir(resp, error(JsonValue.NULL, INVALID_REQUEST, "Se esperaba un único mensaje JSON-RPC (sin lotes)"));
            return;
        }
        JsonObject m = (JsonObject) mensaje;
        JsonValue id = m.get("id");
        String metodo = m.containsKey("method") && m.get("method").getValueType() == JsonValue.ValueType.STRING ? m.getString("method") : null;
        if (id == null || metodo == null) {       // notificación o respuesta del cliente: se acepta sin cuerpo
            resp.setStatus(HttpServletResponse.SC_ACCEPTED);
            return;
        }
        JsonObject params = m.containsKey("params") && m.get("params").getValueType() == JsonValue.ValueType.OBJECT
                ? m.getJsonObject("params") : JsonValue.EMPTY_JSON_OBJECT;
        switch (metodo) {
            case "initialize": escribir(resp, resultado(id, initialize(params))); break;
            case "ping": escribir(resp, resultado(id, JsonValue.EMPTY_JSON_OBJECT)); break;
            case "tools/list": escribir(resp, resultado(id, toolsList())); break;
            case "tools/call": escribir(resp, toolsCall(id, params, req)); break;
            default: escribir(resp, error(id, METHOD_NOT_FOUND, "Método no soportado: " + metodo));
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        resp.setHeader("Allow", "POST");
        resp.sendError(HttpServletResponse.SC_METHOD_NOT_ALLOWED);   // sin flujo SSE de servidor
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        resp.setHeader("Allow", "POST");
        resp.sendError(HttpServletResponse.SC_METHOD_NOT_ALLOWED);   // sin sesiones que cerrar
    }

    private JsonObject initialize(JsonObject params) {
        String pedida = params.getString("protocolVersion", "");
        return Json.createObjectBuilder()
                .add("protocolVersion", VERSIONES.contains(pedida) ? pedida : VERSIONES.get(0))
                .add("capabilities", Json.createObjectBuilder().add("tools", Json.createObjectBuilder().add("listChanged", false)))
                .add("serverInfo", Json.createObjectBuilder().add("name", NOMBRE).add("title", "ÓRBITA").add("version", VERSION))
                .add("instructions", INSTRUCCIONES)
                .build();
    }

    private JsonObject toolsList() {
        JsonArrayBuilder lista = Json.createArrayBuilder();
        for (Herramienta h : Herramientas.activas()) lista.add(h.definicion());
        return Json.createObjectBuilder().add("tools", lista).build();
    }

    private JsonObject toolsCall(JsonValue id, JsonObject params, HttpServletRequest req) {
        String nombre = params.getString("name", null);
        Herramienta h = Herramientas.buscar(nombre);   // solo las activas (Herramientas.activas)
        if (h == null) return error(id, INVALID_PARAMS, "Herramienta desconocida: " + nombre);
        JsonObject args = params.containsKey("arguments") && params.get("arguments").getValueType() == JsonValue.ValueType.OBJECT
                ? params.getJsonObject("arguments") : JsonValue.EMPTY_JSON_OBJECT;
        Herramienta.Resultado r;
        String usuario = SesionDx.usuario(req.getHeader("Cookie"));
        if (usuario == null && Config.usuarioMcpDesarrollo() != null) usuario = Config.usuarioMcpDesarrollo();   // solo desarrollo
        if (usuario == null) {
            r = Herramienta.Resultado.error("No hay sesión de DX del usuario en esta llamada: ÓRBITA solo actúa como el "
                    + "usuario que pregunta. Pide que vuelva a iniciar sesión en el portal.");
        } else {
            try {
                r = h.ejecutar(new Herramienta.Llamada(usuario, args, (msg, t) -> log(msg, t)));
            } catch (RuntimeException e) {
                log("ORBITA MCP: error en " + nombre, e);
                r = Herramienta.Resultado.error("Error interno al ejecutar " + nombre + ".");
            }
        }
        // Auditoría: quién (origen), en nombre de quién, qué y con qué resultado
        log(String.format("ORBITA MCP auditoria herramienta=%s usuario=%s resultado=%s origen=%s",
                nombre, usuario, r.estado(), req.getRemoteAddr()));
        return resultado(id, r.json());
    }

    // --- JSON-RPC -------------------------------------------------------------------------------------------------

    private static JsonObject resultado(JsonValue id, JsonObject result) {
        return Json.createObjectBuilder().add("jsonrpc", "2.0").add("id", id).add("result", result).build();
    }

    private static JsonObject error(JsonValue id, int codigo, String mensaje) {
        JsonObjectBuilder e = Json.createObjectBuilder().add("code", codigo).add("message", mensaje);
        return Json.createObjectBuilder().add("jsonrpc", "2.0").add("id", id).add("error", e).build();
    }

    private static void escribir(HttpServletResponse resp, JsonObject o) throws IOException {
        resp.setCharacterEncoding("UTF-8");
        resp.setContentType("application/json");
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(o.toString());
    }
}
