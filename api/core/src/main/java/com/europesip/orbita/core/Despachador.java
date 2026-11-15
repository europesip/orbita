package com.europesip.orbita.core;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
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

    /** Una foto de Personas para servirla tal cual (no va en JSON): tipo, bytes y versión para la caché. */
    public record Foto(String tipo, byte[] datos, long version) {}

    /**
     * Una imagen de una noticia (GET /v1/noticias/imagenes/{id} de orbita-rest), o null si no existe. La ve quien tiene
     * ficha en ÓRBITA (las noticias se publican para toda la plantilla).
     */
    public static Foto imagenNoticia(String solicitante, int id) throws Exception {
        if (solicitante == null || solicitante.isEmpty()) throw new SinPermiso("Inicia sesión en DX para usar la aplicación.");
        try (Connection c = Db.conexion()) {
            try (PreparedStatement ps = c.prepareStatement("SELECT 1 FROM EMPLEADO WHERE USUARIO = ?")) {
                ps.setString(1, solicitante);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) throw new SinPermiso("Tu usuario de DX (" + solicitante + ") no tiene ficha de empleado en ÓRBITA.");
                }
            }
            Noticias.Imagen i = Noticias.imagen(c, id);
            return i == null ? null : new Foto(i.tipo(), i.datos(), id);
        }
    }

    /** Quien pide una foto no puede verla (no tiene ficha en ÓRBITA): el mensaje es para el usuario. */
    public static final class SinPermiso extends RuntimeException {
        SinPermiso(String mensaje) { super(mensaje); }
    }

    /**
     * La foto de una persona (GET /v1/fotos/{usuario} de orbita-rest), o null si no tiene. La ve quien tiene ficha en
     * ÓRBITA, igual que el directorio. "yo" es la foto de quien la pide (la usa la cabecera del tema).
     *
     * @throws SinPermiso si quien la pide no tiene ficha de empleado
     */
    public static Foto foto(String solicitante, String usuario) throws Exception {
        if (solicitante == null || solicitante.isEmpty()) throw new SinPermiso("Inicia sesión en DX para usar la aplicación.");
        try (Connection c = Db.conexion()) {
            try (PreparedStatement ps = c.prepareStatement("SELECT 1 FROM EMPLEADO WHERE USUARIO = ?")) {
                ps.setString(1, solicitante);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) throw new SinPermiso("Tu usuario de DX (" + solicitante + ") no tiene ficha de empleado en ÓRBITA.");
                }
            }
            Fotos.Imagen i = Fotos.imagen(c, "yo".equals(usuario) ? solicitante : usuario);
            return i == null ? null : new Foto(i.tipo(), i.datos(), i.version());
        }
    }
}
