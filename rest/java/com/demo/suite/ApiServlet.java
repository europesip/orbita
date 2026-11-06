package com.demo.suite;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * Servicio REST de ÓRBITA para HCL DX Compose (o cualquier servidor Java EE 8 / Open Liberty).
 * Misma API que el portlet: POST application/x-www-form-urlencoded con op=... y respuesta JSON.
 *
 *  /api      exige usuario autenticado (web.xml); en DX Compose llega con la sesión del portal (LTPA / SSO)
 *  /publico  sin sesión, solo operaciones del quiosco de fichaje (kiosco.*)
 *
 * Los errores de negocio vuelven como {"error": ...} con 200 (igual que en el portlet), y un 401 si falta la sesión.
 */
public class ApiServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        req.setCharacterEncoding("UTF-8");
        Map<String, String> p = new HashMap<String, String>();
        for (Map.Entry<String, String[]> e : req.getParameterMap().entrySet()) {
            if (e.getValue() != null && e.getValue().length > 0) p.put(e.getKey(), e.getValue()[0]);
        }
        boolean publico = "/publico".equals(req.getServletPath());
        String u = usuario(req);
        if (!publico && u == null) {
            resp.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        String salida = Despachador.ejecutar(p.get("op"), p, u, publico, (m, t) -> log(m, t));
        resp.setCharacterEncoding("UTF-8");
        resp.setContentType("application/json");
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(salida);
    }

    /** GET /api?op=yo para comprobar rápidamente el servicio y la sesión desde el navegador. */
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String op = req.getParameter("op");
        if (!"yo".equals(op)) {
            resp.setContentType("application/json");
            String u = usuario(req);
            resp.setContentType("application/json");
            resp.getWriter().write("{\"servicio\":\"suite-api\",\"usuario\":" + (u == null ? "null"
                    : "\"" + u.replace("\"", "") + "\"") + "}");
            return;
        }
        doPost(req, resp);
    }

    /**
     * Identificador del empleado (uid). Con el repositorio federado de DX Compose (registro básico + LDAP) el nombre
     * puede llegar como DN (uid=lucia.martin,ou=users,dc=dxdemo,dc=com): se queda el valor del primer RDN.
     */
    static String usuario(HttpServletRequest req) {
        String u = req.getRemoteUser();
        if (u == null && req.getUserPrincipal() != null) u = req.getUserPrincipal().getName();
        if (u == null) return null;
        int igual = u.indexOf('='), coma = u.indexOf(',');
        if (igual > 0 && coma > igual) u = u.substring(igual + 1, coma);
        return u.trim();
    }
}
