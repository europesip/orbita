package com.europesip.orbita.ia;

import java.io.StringReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.logging.Level;
import java.util.logging.Logger;

import com.europesip.orbita.core.Config;
import com.europesip.orbita.core.Despachador;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonValue;

/**
 * El asistente de IA propio de ÓRBITA: una conversación con el modelo de LiteLLM (o de cualquier API compatible con
 * OpenAI) que solo conoce las herramientas de ÓRBITA, y que las ejecuta como el usuario de DX de la sesión.
 *
 * Frente al chat de HCL DX IQ (pensado para el practitioner que maneja DX), aquí el prompt solo lleva lo que necesita
 * ÓRBITA: unas instrucciones cortas y las herramientas activas (Herramientas.activas), sin las ~55 herramientas de DX
 * ni el prompt de sistema de IQ. La conversación la guarda el navegador; cada petición trae los mensajes anteriores.
 */
public final class Asistente {

    private static final Logger LOG = Logger.getLogger(Asistente.class.getName());
    /** Máximo de vueltas modelo → herramientas → modelo por pregunta. */
    private static final int MAX_VUELTAS = 8;
    /** Máximo de mensajes de la conversación que se envían al modelo (los más recientes). */
    private static final int MAX_MENSAJES = 20;

    private static volatile HttpClient cliente;

    /** Un mensaje de la conversación, como lo guarda la interfaz. */
    public record Mensaje(String rol, String texto) {}

    /** La respuesta del asistente y las herramientas que ha usado para darla. */
    public record Respuesta(String texto, List<String> herramientas) {}

    /** Error para mostrar al usuario (asistente sin configurar, el modelo no responde...). */
    public static final class Fallo extends RuntimeException {
        private static final long serialVersionUID = 1L;
        public final int estado;
        Fallo(int estado, String mensaje) {
            super(mensaje);
            this.estado = estado;
        }
    }

    private Asistente() {}

    public static boolean configurado() {
        return "orbita".equals(Config.asistente()) && Config.llmUrl() != null;
    }

    /**
     * Contesta al último mensaje de la conversación.
     * @param usuario uid del usuario de DX (las herramientas actúan como él)
     * @param idioma  es | en: idioma de la respuesta
     */
    public static Respuesta responder(String usuario, List<Mensaje> conversacion, String idioma) {
        if (!configurado()) throw new Fallo(503, "El asistente de ÓRBITA no está configurado (assistant.* en el chart).");
        if (conversacion.isEmpty() || !"user".equals(conversacion.get(conversacion.size() - 1).rol())) {
            throw new Fallo(400, "La conversación debe terminar con una pregunta del usuario.");
        }
        List<Herramienta> herramientas = Herramientas.activas();
        JsonArrayBuilder mensajes = Json.createArrayBuilder().add(Json.createObjectBuilder()
                .add("role", "system").add("content", instrucciones(usuario, idioma)));
        for (Mensaje m : conversacion.subList(Math.max(0, conversacion.size() - MAX_MENSAJES), conversacion.size())) {
            String rol = "assistant".equals(m.rol()) ? "assistant" : "user";
            mensajes.add(Json.createObjectBuilder().add("role", rol).add("content", m.texto() == null ? "" : m.texto()));
        }
        JsonArrayBuilder funciones = Json.createArrayBuilder();
        for (Herramienta h : herramientas) {
            funciones.add(Json.createObjectBuilder().add("type", "function").add("function", Json.createObjectBuilder()
                    .add("name", h.nombre).add("description", h.descripcion()).add("parameters", h.esquema())));
        }
        JsonArray tools = funciones.build();
        List<String> usadas = new ArrayList<>();
        JsonArray historia = mensajes.build();

        for (int vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
            JsonObject respuesta = llamar(historia, tools);
            JsonObject mensaje = respuesta.getJsonArray("choices").getJsonObject(0).getJsonObject("message");
            JsonArray llamadas = mensaje.containsKey("tool_calls") && mensaje.get("tool_calls").getValueType() == JsonValue.ValueType.ARRAY
                    ? mensaje.getJsonArray("tool_calls") : JsonValue.EMPTY_JSON_ARRAY;
            if (llamadas.isEmpty()) {
                String texto = mensaje.containsKey("content") && mensaje.get("content").getValueType() == JsonValue.ValueType.STRING
                        ? mensaje.getString("content") : "";
                return new Respuesta(texto, usadas);
            }
            // El modelo pide herramientas: se ejecutan como el usuario y sus resultados vuelven al modelo
            JsonArrayBuilder siguiente = Json.createArrayBuilder(historia).add(mensaje);
            for (JsonValue v : llamadas) {
                JsonObject llamada = v.asJsonObject();
                String id = llamada.getString("id", "");
                JsonObject funcion = llamada.getJsonObject("function");
                String nombre = funcion.getString("name", "");
                Herramienta h = Herramientas.buscar(nombre);
                Herramienta.Resultado r;
                if (h == null) {
                    r = Herramienta.Resultado.error("Herramienta desconocida: " + nombre);
                } else {
                    JsonObject args;
                    try (JsonReader jr = Json.createReader(new StringReader(funcion.getString("arguments", "{}")))) {
                        args = jr.readObject();
                    } catch (RuntimeException e) {
                        args = JsonValue.EMPTY_JSON_OBJECT;
                    }
                    try {
                        r = h.ejecutar(new Herramienta.Llamada(usuario, args, (m, t) -> LOG.log(Level.SEVERE, m, t)));
                    } catch (RuntimeException e) {
                        LOG.log(Level.SEVERE, "ORBITA asistente: error en " + nombre, e);
                        r = Herramienta.Resultado.error("Error interno al ejecutar " + nombre + ".");
                    }
                    usadas.add(nombre);
                }
                LOG.info(String.format("ORBITA asistente auditoria herramienta=%s usuario=%s resultado=%s", nombre, usuario, r.estado()));
                siguiente.add(Json.createObjectBuilder().add("role", "tool").add("tool_call_id", id).add("content", r.texto()));
            }
            historia = siguiente.build();
        }
        return new Respuesta("es".equals(idioma)
                ? "Lo siento, no he podido terminar la respuesta (demasiados pasos). Prueba a preguntarlo de otra forma."
                : "Sorry, I could not finish the answer (too many steps). Please try asking in a different way.", usadas);
    }

    /** Instrucciones de sistema: cortas, con quién pregunta, la fecha de hoy (con el día de la semana) y el idioma. */
    private static String instrucciones(String usuario, String idioma) {
        String yo = Despachador.ejecutar("yo", new HashMap<>(), usuario, false, null).json();
        LocalDateTime ahora = LocalDateTime.now();
        Locale loc = "en".equals(idioma) ? Locale.ENGLISH : Locale.forLanguageTag("es");
        String hoy = ahora.getDayOfWeek().getDisplayName(TextStyle.FULL, loc) + " " + ahora.format(DateTimeFormatter.ISO_LOCAL_DATE)
                + " " + ahora.format(DateTimeFormatter.ofPattern("HH:mm"));
        return "Eres el asistente de ÓRBITA, la intranet de la empresa (fichaje, vacaciones y ausencias, gastos y viajes, "
                + "aprobaciones, comunicación con RRHH, encuestas, el directorio de personas y mis documentos y nóminas). Ayudas a la persona que te escribe con SUS datos y gestiones, usando las herramientas de "
                + "ÓRBITA: actúan siempre como esa persona y con sus permisos. No inventes datos: consúltalos con las "
                + "herramientas. Las herramientas que modifican datos devuelven primero un resumen: enséñaselo y repite la "
                + "llamada con confirmar=true solo cuando la persona lo confirme. Si algo no se puede hacer con las "
                + "herramientas (por ejemplo, pagar notas, borrar datos, confirmar la lectura de un comunicado, responder al pulso, editar un perfil, firmar un recibí o subir un documento), "
                + "indica que se hace en la aplicación. Ante una duda para RRHH, busca antes la respuesta (rrhh_buscar_respuesta). Sé breve y "
                + "claro; usa listas o tablas cuando ayuden.\n"
                + "Ahora es " + hoy + " (hora de la empresa). Usa esta fecha para entender 'hoy', 'mañana', 'el viernes'...\n"
                + "La persona que te escribe (ficha de ÓRBITA, JSON): " + yo + "\n"
                + "Los datos de ÓRBITA (categorías, estados, textos) están en español. Responde siempre en "
                + ("en".equals(idioma) ? "inglés (English), traduciendo los datos cuando haga falta." : "español.");
    }

    /**
     * Una pregunta suelta al modelo, sin herramientas ni datos del usuario (p. ej. resumir los comentarios anónimos de
     * una encuesta). Devuelve el texto de la respuesta.
     */
    public static String completar(String sistema, String texto) {
        JsonArray m = Json.createArrayBuilder()
                .add(Json.createObjectBuilder().add("role", "system").add("content", sistema))
                .add(Json.createObjectBuilder().add("role", "user").add("content", texto)).build();
        JsonObject r = llamar(m, Json.createArrayBuilder().build());
        try {
            return r.getJsonArray("choices").getJsonObject(0).getJsonObject("message").getString("content", "").trim();
        } catch (RuntimeException e) {
            throw new Fallo(502, "El modelo de IA no ha respondido correctamente (sin texto).");
        }
    }

    /** Una llamada a /v1/chat/completions de LiteLLM. */
    private static JsonObject llamar(JsonArray mensajes, JsonArray tools) {
        var cuerpo = Json.createObjectBuilder().add("model", Config.llmModelo()).add("messages", mensajes);
        if (!tools.isEmpty()) cuerpo.add("tools", tools);
        if (Config.llmMaxTokens() != null) cuerpo.add("max_tokens", Integer.parseInt(Config.llmMaxTokens()));
        if (Config.llmTemperatura() != null) cuerpo.add("temperature", Double.parseDouble(Config.llmTemperatura()));
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(Config.llmUrl().replaceAll("/+$", "") + "/v1/chat/completions"))
                .timeout(Duration.ofSeconds(120)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(cuerpo.build().toString(), StandardCharsets.UTF_8));
        if (Config.llmClave() != null) req.header("Authorization", "Bearer " + Config.llmClave());
        try {
            HttpResponse<String> r = cliente().send(req.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (r.statusCode() != 200) {
                LOG.warning("ORBITA asistente: el modelo ha respondido " + r.statusCode() + ": " + r.body().substring(0, Math.min(500, r.body().length())));
                throw new Fallo(502, "El modelo de IA no ha respondido correctamente (" + r.statusCode() + ").");
            }
            try (JsonReader jr = Json.createReader(new StringReader(r.body()))) {
                return jr.readObject();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Fallo(503, "Petición interrumpida.");
        } catch (java.io.IOException e) {
            LOG.warning("ORBITA asistente: no se puede conectar con " + Config.llmUrl() + ": " + e);
            throw new Fallo(502, "No se puede conectar con el modelo de IA.");
        }
    }

    private static HttpClient cliente() {
        if (cliente == null) {
            synchronized (Asistente.class) {
                if (cliente == null) cliente = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
            }
        }
        return cliente;
    }
}
