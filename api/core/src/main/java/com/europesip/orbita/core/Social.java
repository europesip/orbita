package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Conversación en cada solicitud (ausencias, correcciones, notas de gasto y viajes) y avisos para cada persona.
 * Los avisos se crean desde Api y Gastos al pedir, resolver, pagar o comentar.
 */
final class Social {

    private Social() {}

    /** Tabla y app de la persona que pide, por clase de solicitud. */
    private static String tabla(String clase) {
        switch (clase) {
            case "AUSENCIA": return "AUSENCIA";
            case "CORRECCION": return "CORRECCION";
            case "NOTA": return "NOTA_GASTO";
            case "VIAJE": return "VIAJE";
            default: throw new Api.Aviso("Tipo de solicitud desconocido.");
        }
    }

    static String appDe(String clase) {
        return "AUSENCIA".equals(clase) ? "vacaciones" : "CORRECCION".equals(clase) ? "fichaje" : "gastos";
    }

    // ---------------------------------------------------------------- Avisos

    static void avisar(Connection c, String usuario, String app, String clase, Integer objeto, String texto) throws SQLException {
        if (usuario == null) return;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO AVISO (USUARIO, APP, CLASE, OBJETO, TEXTO, LEIDO, CREADO) VALUES (?,?,?,?,?,0,?)")) {
            ps.setString(1, usuario);
            ps.setString(2, app);
            ps.setString(3, clase);
            if (objeto == null) ps.setNull(4, java.sql.Types.INTEGER); else ps.setInt(4, objeto);
            ps.setString(5, texto.length() > 300 ? texto.substring(0, 297) + "…" : texto);
            ps.setTimestamp(6, Timestamp.valueOf(LocalDateTime.now()));
            ps.executeUpdate();
        }
    }

    static Map<String, Object> avisos(Connection c, String usuario) throws SQLException {
        List<Object> l = new ArrayList<Object>();
        int noLeidos = 0;
        try (PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM AVISO WHERE USUARIO = ? AND LEIDO = 0")) {
            ps.setString(1, usuario);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                noLeidos = rs.getInt(1);
            }
        }
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM AVISO WHERE USUARIO = ? ORDER BY CREADO DESC, ID DESC")) {
            ps.setMaxRows(30);
            ps.setString(1, usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int o = rs.getInt("OBJETO");
                    Integer objeto = rs.wasNull() ? null : o;
                    l.add(obj("id", rs.getInt("ID"), "app", rs.getString("APP"), "clase", rs.getString("CLASE"), "objeto", objeto,
                            "texto", rs.getString("TEXTO"), "leido", rs.getInt("LEIDO") == 1,
                            "creado", rs.getTimestamp("CREADO").toLocalDateTime().withNano(0).toString()));
                }
            }
        }
        return obj("noLeidos", noLeidos, "avisos", l);
    }

    static Map<String, Object> leer(Connection c, String usuario, String id) throws SQLException {
        String sql = "UPDATE AVISO SET LEIDO = 1 WHERE USUARIO = ?" + (id == null || id.isEmpty() ? "" : " AND ID = ?");
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, usuario);
            if (id != null && !id.isEmpty()) ps.setInt(2, Integer.parseInt(id));
            ps.executeUpdate();
        }
        return avisos(c, usuario);
    }

    // ---------------------------------------------------------------- Conversación

    /** Dueño de la solicitud, comprobando que el usuario puede verla (dueño, su responsable, RRHH o, en notas, Administración). */
    private static String dueno(Connection c, Api api, String clase, int objeto) throws SQLException {
        String dueno;
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO FROM " + tabla(clase) + " WHERE ID = ?")) {
            ps.setInt(1, objeto);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("La solicitud ya no existe.");
                dueno = rs.getString(1);
            }
        }
        Api.Emp yo = api.yo();
        boolean ok = dueno.equals(yo.usuario) || api.aprueboA().contains(dueno) || "RRHH".equals(yo.rol)
                || ("NOTA".equals(clase) && "ADMINISTRACION".equals(yo.rol));
        if (!ok) throw new Api.Aviso("No tienes acceso a esa conversación.");
        return dueno;
    }

    static List<Object> comentarios(Connection c, Api api, String clase, int objeto) throws SQLException {
        dueno(c, api, clase, objeto);
        List<Object> l = new ArrayList<Object>();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM COMENTARIO WHERE CLASE = ? AND OBJETO = ? ORDER BY CREADO, ID")) {
            ps.setString(1, clase);
            ps.setInt(2, objeto);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Api.Emp e = api.emp(rs.getString("USUARIO"));
                    l.add(obj("id", rs.getInt("ID"), "usuario", rs.getString("USUARIO"), "nombre", e == null ? rs.getString("USUARIO") : e.nombre,
                            "yo", rs.getString("USUARIO").equals(api.yo().usuario), "texto", rs.getString("TEXTO"),
                            "creado", rs.getTimestamp("CREADO").toLocalDateTime().withNano(0).toString()));
                }
            }
        }
        return l;
    }

    static List<Object> comentar(Connection c, Api api, String clase, int objeto, String texto) throws SQLException {
        texto = texto == null ? "" : texto.trim();
        if (texto.isEmpty()) throw new Api.Aviso("Escribe el comentario.");
        if (texto.length() > 1000) texto = texto.substring(0, 1000);
        String dueno = dueno(c, api, clase, objeto);
        Api.Emp yo = api.yo();
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO COMENTARIO (CLASE, OBJETO, USUARIO, TEXTO, CREADO) VALUES (?,?,?,?,?)")) {
            ps.setString(1, clase);
            ps.setInt(2, objeto);
            ps.setString(3, yo.usuario);
            ps.setString(4, texto);
            ps.setTimestamp(5, Timestamp.valueOf(LocalDateTime.now()));
            ps.executeUpdate();
        }
        String corto = texto.length() > 120 ? texto.substring(0, 117) + "…" : texto;
        if (dueno.equals(yo.usuario)) {
            Api.Emp d = api.emp(dueno);
            avisar(c, d.responsable, "aprobaciones", clase, objeto, yo.nombre + " ha comentado su solicitud: «" + corto + "»");
        } else {
            avisar(c, dueno, appDe(clase), clase, objeto, yo.nombre + " ha comentado tu solicitud: «" + corto + "»");
        }
        return comentarios(c, api, clase, objeto);
    }

    /** Número de comentarios por "CLASE:ID". */
    static Map<String, Integer> contar(Connection c) throws SQLException {
        Map<String, Integer> m = new HashMap<String, Integer>();
        try (PreparedStatement ps = c.prepareStatement("SELECT CLASE, OBJETO, COUNT(*) FROM COMENTARIO GROUP BY CLASE, OBJETO");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) m.put(rs.getString(1) + ":" + rs.getInt(2), rs.getInt(3));
        }
        return m;
    }

    /** Añade "comentarios" (número) a cada elemento con "id"; clase fija o la del propio elemento. */
    @SuppressWarnings("unchecked")
    static void anotar(Map<String, Integer> cuenta, List<?> items, String clase) {
        for (Object o : items) {
            Map<String, Object> m = (Map<String, Object>) o;
            String k = (clase != null ? clase : (String) m.get("clase")) + ":" + m.get("id");
            m.put("comentarios", cuenta.containsKey(k) ? cuenta.get(k) : 0);
        }
    }
}
