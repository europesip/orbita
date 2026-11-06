package com.demo.orbita.mcp;

import java.io.IOException;
import java.sql.Connection;

import javax.naming.InitialContext;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.sql.DataSource;

/**
 * GET /probe/ready: el Integrator de DX IQ lo llama antes de pedir las herramientas (como con el MCP de HCL).
 * 200 "ready" si el servidor está arriba y la base de datos de la suite responde; 503 si no.
 */
public class ProbeServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        resp.setContentType("text/plain");
        resp.setCharacterEncoding("UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        try (Connection c = ((DataSource) new InitialContext().lookup("jdbc/suiteIntranet")).getConnection()) {
            if (!c.isValid(5)) throw new IllegalStateException("conexión no válida");
            resp.getWriter().write("ready");
        } catch (Exception e) {
            log("ORBITA MCP: probe/ready sin base de datos", e);
            resp.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            resp.getWriter().write("not ready");
        }
    }
}
