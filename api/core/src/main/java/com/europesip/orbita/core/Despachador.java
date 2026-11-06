package com.europesip.orbita.core;

import java.sql.Connection;
import java.util.Map;

/**
 * Punto de entrada común de la lógica de ÓRBITA, sin dependencias del contenedor: lo usan la API REST (orbita-api) y
 * el servidor MCP (orbita-mcp). Recibe la operación (op=...) con sus parámetros y el usuario de DX, y devuelve el JSON
 * de la respuesta con su código HTTP.
 */
public final class Despachador {

    /** Lo que se escribe en el registro del servidor cuando algo falla. */
    public interface Registro {
        void error(String mensaje, Throwable t);
    }

    /**
     * Respuesta: 200 con los datos; 422 con {"error", "aviso": true} si la operación no se puede hacer (validación,
     * permisos, reglas de negocio: el mensaje es para el usuario); 500 con {"error"} si algo falla.
     */
    public record Respuesta(int estado, String json) {
        public boolean ok() { return estado == 200; }
    }

    private Despachador() {}

    /**
     * @param usuario uid del usuario de DX; null si la petición no trae sesión
     * @param soloQuiosco true en el punto de acceso sin sesión: solo se admiten las operaciones del quiosco
     */
    public static Respuesta ejecutar(String op, Map<String, String> p, String usuario, boolean soloQuiosco, Registro log) {
        op = String.valueOf(op);
        try (Connection c = Db.conexion()) {
            if (op.startsWith("kiosco.")) return new Respuesta(200, Json.of(Kiosco.ejecutar(c, op, p)));
            if (soloQuiosco) throw new Api.Aviso("Operación no permitida sin iniciar sesión.");
            if (usuario == null || usuario.isEmpty()) throw new Api.Aviso("Inicia sesión en DX para usar la aplicación.");
            return new Respuesta(200, Json.of(new Api(c, usuario).ejecutar(op, p)));
        } catch (Api.Aviso e) {
            return new Respuesta(422, Json.of(Json.obj("error", e.getMessage(), "aviso", true)));
        } catch (Exception e) {
            if (log != null) log.error("ORBITA: error en " + op, e);
            return new Respuesta(500, Json.of(Json.obj("error", "Error interno del servidor.")));
        }
    }
}
