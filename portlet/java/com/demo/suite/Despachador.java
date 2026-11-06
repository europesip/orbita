package com.demo.suite;

import java.sql.Connection;
import java.util.Map;

/**
 * Punto de entrada común de la API de la suite, sin dependencias del contenedor: lo usan el portlet del Portal 8.5
 * (SuitePortlet) y el servicio REST para HCL DX Compose / Open Liberty (ApiServlet). Recibe la operación (op=...) con
 * sus parámetros y el usuario autenticado, y devuelve el JSON de respuesta (o {"error": ...}).
 */
public final class Despachador {

    /** Lo que se escribe en el registro del servidor cuando algo falla. */
    public interface Registro {
        void error(String mensaje, Throwable t);
    }

    private Despachador() {}

    /**
     * @param usuario uid del usuario autenticado (o el nombre distinguido completo); null si es anónimo
     * @param soloQuiosco true en el punto de acceso público: solo se admiten las operaciones del quiosco
     */
    public static String ejecutar(String op, Map<String, String> p, String usuario, boolean soloQuiosco, Registro log) {
        op = String.valueOf(op);
        try (Connection c = Db.conexion()) {
            if (op.startsWith("kiosco.")) return Json.of(Kiosco.ejecutar(c, op, p));
            if (soloQuiosco) throw new Api.Aviso("Operación no permitida sin iniciar sesión.");
            return Json.of(new Api(c, uid(usuario)).ejecutar(op, p));
        } catch (Api.Aviso e) {
            return Json.of(Json.obj("error", e.getMessage(), "aviso", true));
        } catch (Exception e) {
            if (log != null) log.error("ORBITA: error en " + op, e);
            return Json.of(Json.obj("error", "Error interno: " + e));
        }
    }

    /** uid a partir del usuario del contenedor, aunque llegue como nombre distinguido (uid=...,o=...). */
    static String uid(String u) {
        if (u == null || u.isEmpty()) throw new Api.Aviso("Inicia sesión para usar la aplicación.");
        if (u.toLowerCase().startsWith("uid=")) u = u.substring(4, u.indexOf(',') > 0 ? u.indexOf(',') : u.length());
        return u;
    }
}
