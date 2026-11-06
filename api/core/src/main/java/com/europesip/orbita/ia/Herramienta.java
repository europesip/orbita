package com.europesip.orbita.ia;

import java.io.StringReader;
import java.util.HashMap;
import java.util.Map;

import jakarta.json.Json;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonReader;
import jakarta.json.JsonValue;

import com.europesip.orbita.core.Despachador;

/**
 * Una herramienta (tool) del MCP de ÓRBITA: nombre, descripción para el modelo, esquema de entrada y qué hace.
 * Las herramientas se declaran en {@link Herramientas}. Cada una suele ser una operación de la lógica de ÓRBITA
 * (Despachador, la misma que usa la API REST) ejecutada como el usuario de DX que pregunta en DX IQ.
 */
public final class Herramienta {

    /** Lo que hace la herramienta con los argumentos recibidos. */
    interface Ejecutor {
        Resultado ejecutar(Llamada llamada);
    }

    public final String nombre;
    private final String titulo, descripcion;
    private final JsonObject esquema;
    private final boolean soloLectura;
    private final Ejecutor ejecutor;

    Herramienta(String nombre, String titulo, String descripcion, Esquema esquema, boolean soloLectura, Ejecutor ejecutor) {
        this.nombre = nombre;
        this.titulo = titulo;
        this.descripcion = descripcion;
        this.esquema = esquema.build();
        this.soloLectura = soloLectura;
        this.ejecutor = ejecutor;
    }

    public boolean soloLectura() {
        return soloLectura;
    }

    public Resultado ejecutar(Llamada llamada) {
        return ejecutor.ejecutar(llamada);
    }

    /** Definición para tools/list. */
    /** Descripción para el modelo (también en la definición de funciones del asistente). */
    public String descripcion() {
        return descripcion;
    }

    /** El inputSchema (JSON Schema) de la herramienta. */
    public JsonObject esquema() {
        return esquema;
    }

    public JsonObject definicion() {
        return Json.createObjectBuilder()
                .add("name", nombre)
                .add("title", titulo)
                .add("description", descripcion)
                .add("inputSchema", esquema)
                .add("annotations", Json.createObjectBuilder()
                        .add("title", titulo)
                        .add("readOnlyHint", soloLectura)
                        .add("destructiveHint", false)
                        .add("idempotentHint", soloLectura)
                        .add("openWorldHint", false))
                .build();
    }

    // --- Llamada: argumentos + acceso a la API de la suite ---------------------------------------------------------

    /** Una invocación concreta: el usuario de DX que pregunta (su sesión) y los argumentos. */
    public static final class Llamada {
        final String usuario;
        final JsonObject args;
        private final Despachador.Registro registro;

        public Llamada(String usuario, JsonObject args, Despachador.Registro registro) {
            this.usuario = usuario;
            this.args = args;
            this.registro = registro;
        }

        /** Argumento de texto (o null). */
        String texto(String clave) {
            JsonValue v = args.get(clave);
            if (v == null || v == JsonValue.NULL) return null;
            return v.getValueType() == JsonValue.ValueType.STRING ? args.getString(clave) : v.toString();
        }

        /** true si el modelo ha pasado confirmar=true (el usuario ha confirmado la acción). */
        boolean confirmado() {
            return args.containsKey("confirmar") && args.get("confirmar") == JsonValue.TRUE;
        }

        /**
         * Ejecuta una operación de la lógica como el usuario (mismos permisos que en las Script Applications).
         * Ejemplo: api("vac.resumen") o api("vac.solicitar", "tipo", "VACACIONES", "desde", ...).
         */
        Resultado api(String op, String... clavesYValores) {
            Map<String, String> p = new HashMap<String, String>();
            for (int i = 0; i + 1 < clavesYValores.length; i += 2) {
                if (clavesYValores[i + 1] != null) p.put(clavesYValores[i], clavesYValores[i + 1]);
            }
            String json = Despachador.ejecutar(op, p, usuario, false, registro).json();
            JsonValue v;
            try (JsonReader r = Json.createReader(new StringReader(json))) {
                v = r.readValue();
            }
            JsonObject o = v.getValueType() == JsonValue.ValueType.OBJECT ? (JsonObject) v
                    : Json.createObjectBuilder().add("datos", v).build();
            return o.containsKey("error") ? Resultado.error(o.getString("error", "Error")) : Resultado.ok(o);
        }

        /**
         * Para las herramientas que modifican datos: si no hay confirmar=true, no hace nada y devuelve el resumen de lo
         * que se haría, para que el modelo lo enseñe al usuario y repita la llamada con confirmar=true.
         */
        Resultado pedirConfirmacion(String resumen) {
            return Resultado.confirmacion(resumen);
        }
    }

    // --- Resultado de tools/call -------------------------------------------------------------------------------------

    public static final class Resultado {
        private final JsonObject datos;
        private final String texto, estado;
        private final boolean error;

        private Resultado(JsonObject datos, String texto, boolean error, String estado) {
            this.datos = datos;
            this.texto = texto;
            this.error = error;
            this.estado = estado;
        }

        static Resultado ok(JsonObject datos) {
            return new Resultado(datos, datos.toString(), false, "ok");
        }

        /** Error de negocio o de argumentos: el modelo lo ve (isError=true) y puede corregir la llamada. */
        public static Resultado error(String mensaje) {
            return new Resultado(Json.createObjectBuilder().add("error", mensaje).build(), mensaje, true, "error");
        }

        static Resultado confirmacion(String resumen) {
            JsonObject d = Json.createObjectBuilder()
                    .add("requiereConfirmacion", true)
                    .add("resumen", resumen)
                    .add("instrucciones", "No se ha hecho ningún cambio. Muestra el resumen al usuario y, si lo confirma, "
                            + "repite la llamada con los mismos argumentos y confirmar=true.")
                    .build();
            return new Resultado(d, d.toString(), false, "confirmacion");
        }

        public String estado() {
            return estado;
        }

        /** Cuerpo de result de tools/call: texto (para todos los clientes) + structuredContent. */
        /** Texto del resultado, tal como lo lee el modelo. */
        public String texto() {
            return texto;
        }

        public JsonObject json() {
            JsonArrayBuilder contenido = Json.createArrayBuilder()
                    .add(Json.createObjectBuilder().add("type", "text").add("text", texto));
            return Json.createObjectBuilder().add("content", contenido).add("structuredContent", datos).add("isError", error).build();
        }
    }

    // --- Esquema de entrada (JSON Schema) ----------------------------------------------------------------------------

    /**
     * Constructor del inputSchema. No hay parámetro de usuario: la herramienta actúa siempre como el usuario de DX que
     * pregunta (su sesión), nunca como otro que el modelo elija.
     */
    static final class Esquema {
        private final JsonObjectBuilder props = Json.createObjectBuilder();
        private final JsonArrayBuilder obligatorios = Json.createArrayBuilder();

        static Esquema nuevo() {
            return new Esquema();
        }

        Esquema texto(String nombre, String descripcion, boolean obligatorio) {
            return propiedad(nombre, Json.createObjectBuilder().add("type", "string").add("description", descripcion), obligatorio);
        }

        /** Fecha en formato AAAA-MM-DD. */
        Esquema fecha(String nombre, String descripcion, boolean obligatorio) {
            return propiedad(nombre, Json.createObjectBuilder().add("type", "string").add("format", "date")
                    .add("description", descripcion + " (AAAA-MM-DD)"), obligatorio);
        }

        Esquema entero(String nombre, String descripcion, boolean obligatorio) {
            return propiedad(nombre, Json.createObjectBuilder().add("type", "integer").add("description", descripcion), obligatorio);
        }

        Esquema opciones(String nombre, String descripcion, boolean obligatorio, String... valores) {
            JsonArrayBuilder e = Json.createArrayBuilder();
            for (String v : valores) e.add(v);
            return propiedad(nombre, Json.createObjectBuilder().add("type", "string").add("enum", e).add("description", descripcion), obligatorio);
        }

        /** Para herramientas que modifican datos. */
        Esquema confirmar() {
            return propiedad("confirmar", Json.createObjectBuilder().add("type", "boolean")
                    .add("description", "true solo cuando el usuario ya ha confirmado el resumen devuelto por la primera llamada"), false);
        }

        private Esquema propiedad(String nombre, JsonObjectBuilder def, boolean obligatorio) {
            props.add(nombre, def);
            if (obligatorio) obligatorios.add(nombre);
            return this;
        }

        JsonObject build() {
            return Json.createObjectBuilder().add("type", "object").add("properties", props)
                    .add("required", obligatorios).add("additionalProperties", false).build();
        }
    }
}
