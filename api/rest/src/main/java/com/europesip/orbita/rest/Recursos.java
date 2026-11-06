package com.europesip.orbita.rest;

import java.io.StringReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import com.europesip.orbita.core.Config;
import com.europesip.orbita.core.Db;
import com.europesip.orbita.core.Despachador;
import com.europesip.orbita.core.SesionDx;
import com.europesip.orbita.ia.Asistente;

import jakarta.json.Json;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;
import jakarta.json.stream.JsonParsingException;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;

/**
 * Todas las rutas de rutas.json, más dos propias:
 *   GET /v1/salud    sin sesión: 200 si la base de datos está lista (sonda de Kubernetes)
 *   GET /v1/config   con sesión: lo que la interfaz necesita saber de esta instalación
 *
 * Quién es el usuario lo dice DX (SesionDx) con la cookie de sesión que envía el navegador. Sin sesión válida: 401.
 * Las operaciones del quiosco son públicas y se protegen con la clave del dispositivo.
 */
@Path("/")
public class Recursos {

    private static final Logger LOG = Logger.getLogger(Recursos.class.getName());

    @Context
    HttpHeaders cabeceras;

    @Context
    UriInfo uri;

    @GET
    @Path("salud")
    public Response salud() {
        boolean lista = Arranque.listo() && Db.lista();
        return Response.status(lista ? 200 : 503).type(MediaType.TEXT_PLAIN).entity(lista ? "ok" : "no lista").build();
    }

    @GET
    @Path("config")
    public Response config() {
        if (usuario() == null) return sinSesion();
        JsonObject o = Json.createObjectBuilder()
                .add("paginas", Config.paginas())
                .add("quiosco", Config.paginaQuiosco())
                .add("claveQuiosco", Config.claveQuiosco() == null ? "" : Config.claveQuiosco())
                .add("demo", Config.demo())
                .add("cabecera", Json.createObjectBuilder()
                        .add("titulo", Config.cabecera("title"))
                        .add("inicio", Config.cabecera("homelink"))
                        .add("asistente", Config.cabecera("assistant"))
                        .add("avisos", Config.cabecera("notifications"))
                        .add("usuario", Config.cabecera("user")))
                .add("pie", Config.pie())
                // Asistente: orbita (chat propio, POST /v1/asistente), iq (chat de HCL DX IQ) o none
                .add("asistente", Asistente.configurado() ? "orbita" : "iq".equals(Config.asistente()) ? "iq" : "none")
                .build();
        return json(200, o.toString());
    }

    /**
     * El asistente de IA de ÓRBITA: {"mensajes": [{"rol": "user"|"assistant", "texto": "..."}], "idioma": "es"|"en"}
     * → {"respuesta": "...", "herramientas": [...]}. Las herramientas actúan como el usuario de la sesión de DX.
     */
    @POST
    @Path("asistente")
    public Response asistente(String cuerpo) {
        String usuario = usuario();
        if (usuario == null) return sinSesion();
        if (!Arranque.listo()) return error(503, "ÓRBITA se está iniciando: inténtalo en unos segundos.");
        List<Asistente.Mensaje> conversacion = new ArrayList<>();
        String idioma;
        try (JsonReader r = Json.createReader(new StringReader(cuerpo == null ? "{}" : cuerpo))) {
            JsonObject o = r.readObject();
            idioma = "en".equals(o.getString("idioma", "es")) ? "en" : "es";
            for (JsonValue v : o.getJsonArray("mensajes")) {
                JsonObject m = v.asJsonObject();
                String texto = m.getString("texto", "");
                if (texto.length() > 8000) texto = texto.substring(0, 8000);
                conversacion.add(new Asistente.Mensaje(m.getString("rol", "user"), texto));
            }
        } catch (RuntimeException e) {
            return error(400, "Petición no válida: {\"mensajes\": [...], \"idioma\": \"es\"|\"en\"}.");
        }
        try {
            Asistente.Respuesta a = Asistente.responder(usuario, conversacion, idioma);
            JsonArrayBuilder h = Json.createArrayBuilder();
            a.herramientas().forEach(h::add);
            return json(200, Json.createObjectBuilder().add("respuesta", a.texto()).add("herramientas", h).build().toString());
        } catch (Asistente.Fallo f) {
            return error(f.estado, f.getMessage());
        }
    }

    @GET
    @Path("{ruta: .+}")
    public Response get(@PathParam("ruta") String ruta) { return atender("GET", ruta, null); }

    @DELETE
    @Path("{ruta: .+}")
    public Response delete(@PathParam("ruta") String ruta) { return atender("DELETE", ruta, null); }

    @POST
    @Path("{ruta: .+}")
    public Response post(@PathParam("ruta") String ruta, String cuerpo) { return atender("POST", ruta, cuerpo); }

    @PUT
    @Path("{ruta: .+}")
    public Response put(@PathParam("ruta") String ruta, String cuerpo) { return atender("PUT", ruta, cuerpo); }

    private Response atender(String metodo, String ruta, String cuerpo) {
        Rutas.Encontrada e = Rutas.buscar(metodo, ruta);
        if (e == null) {
            return error(Rutas.existeConOtroMetodo(ruta) ? 405 : 404, "No existe " + metodo + " /" + ruta);
        }
        if (!Arranque.listo()) return error(503, "ÓRBITA se está iniciando: inténtalo en unos segundos.");
        String usuario = null;
        if (!e.ruta().publica()) {
            usuario = usuario();
            if (usuario == null) return sinSesion();
        }
        Map<String, String> p = new HashMap<>();
        // Consulta, cuerpo y ruta, en este orden: los parámetros de la ruta mandan
        for (Map.Entry<String, List<String>> q : uri.getQueryParameters().entrySet()) {
            if (!q.getValue().isEmpty()) p.put(q.getKey(), q.getValue().get(0));
        }
        if (cuerpo != null && !cuerpo.isBlank()) {
            try (JsonReader r = Json.createReader(new StringReader(cuerpo))) {
                for (Map.Entry<String, JsonValue> c : r.readObject().entrySet()) p.put(c.getKey(), texto(c.getValue()));
            } catch (JsonParsingException | ClassCastException ex) {
                return error(400, "El cuerpo de la petición no es un objeto JSON.");
            }
        }
        p.putAll(e.parametros());
        Despachador.Respuesta r = Despachador.ejecutar(e.ruta().op(), p, usuario, e.ruta().publica(),
                (m, t) -> LOG.log(Level.SEVERE, m, t));
        return json(r.estado(), r.json());
    }

    /** Valor de un campo JSON como lo esperan las operaciones (texto; null si es null). */
    private static String texto(JsonValue v) {
        return switch (v.getValueType()) {
            case NULL -> null;
            case STRING -> ((JsonString) v).getString();
            default -> v.toString();
        };
    }

    private String usuario() {
        return SesionDx.usuario(cabeceras.getHeaderString(HttpHeaders.COOKIE));
    }

    private static Response sinSesion() {
        return error(401, "No hay sesión de DX: vuelve a iniciar sesión en el portal.");
    }

    private static Response error(int estado, String mensaje) {
        return json(estado, Json.createObjectBuilder().add("error", mensaje).build().toString());
    }

    private static Response json(int estado, String json) {
        return Response.status(estado).type(MediaType.APPLICATION_JSON_TYPE.withCharset("UTF-8"))
                .header("Cache-Control", "no-store").entity(json).build();
    }
}
