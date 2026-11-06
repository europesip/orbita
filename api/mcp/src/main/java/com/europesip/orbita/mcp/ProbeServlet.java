package com.europesip.orbita.mcp;

import java.io.IOException;

import com.europesip.orbita.core.Db;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * GET /probe/ready: el Integrator de DX IQ lo llama antes de pedir las herramientas (como con el MCP de HCL).
 * 200 "ready" si la base de datos de ÓRBITA responde y tiene el esquema; 503 si no.
 */
@WebServlet("/probe/ready")
public class ProbeServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        resp.setContentType("text/plain");
        resp.setCharacterEncoding("UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        boolean lista = Db.lista();
        if (!lista) resp.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
        resp.getWriter().write(lista ? "ready" : "not ready");
    }
}
