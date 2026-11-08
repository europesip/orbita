package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.io.StringReader;
import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import jakarta.json.JsonArray;
import jakarta.json.JsonNumber;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

/**
 * Comunicación con RRHH (op=comunicados.* / consultas.* / faq.* / pulso.*):
 *
 *  - Comunicados de RRHH a la plantilla, a todos, a un departamento o a un rol, con acuse de lectura opcional
 *    («He leído y acepto»). RRHH ve quién lo ha leído y confirmado, y puede enviar un recordatorio.
 *  - Consultas de los empleados a RRHH (nómina, certificados, datos...), con su conversación (COMENTARIO, clase
 *    CONSULTA). Las ven solo quien pregunta y RRHH: su responsable no. Antes de preguntar se sugieren respuestas de
 *    las preguntas frecuentes y de los comunicados.
 *  - Pulso: encuestas cortas y anónimas (escala de 1 a 5, eNPS de 0 a 10 y texto libre). Las respuestas se guardan sin
 *    usuario ni hora; ENCUESTA_PARTICIPACION solo dice quién ha respondido. Un resultado (total, por departamento o los
 *    comentarios) solo se muestra si han respondido al menos MINIMO personas.
 *
 * Publican y gestionan RRHH; los responsables ven los resultados del pulso de su departamento.
 */
final class Comunicacion {

    static final List<String> CATEGORIAS_COMUNICADO = Arrays.asList("POLITICA", "AVISO", "EVENTO", "BENEFICIO");
    static final List<String> CATEGORIAS_CONSULTA = Arrays.asList("NOMINA", "CERTIFICADO", "DATOS", "CONTRATO", "FORMACION", "OTRA");
    static final List<String> TIPOS_PREGUNTA = Arrays.asList("ESCALA", "ENPS", "TEXTO");
    static final List<String> ROLES = Arrays.asList("EMPLEADO", "RESPONSABLE", "RRHH", "ADMINISTRACION");
    /** Mínimo de respuestas que se puede fijar en una encuesta (anonimato). */
    static final int MINIMO_ANONIMATO = 3;

    private final Api api;
    private final Connection c;
    private final Api.Emp yo;

    Comunicacion(Api api, Connection c) {
        this.api = api;
        this.c = c;
        this.yo = api.yo();
    }

    Object ejecutar(String op, Map<String, String> p) throws SQLException {
        switch (op) {
            case "comunicacion.resumen": return resumen();
            case "comunicados.lista": return comunicados();
            case "comunicados.detalle": return comunicado(Api.entero(p, "id"), !"false".equals(p.get("marcar")));
            case "comunicados.publicar": return publicar(p);
            case "comunicados.confirmar": return confirmar(Api.entero(p, "id"));
            case "comunicados.lecturas": return lecturas(Api.entero(p, "id"));
            case "comunicados.recordar": return recordar(Api.entero(p, "id"));
            case "comunicados.archivar": return archivar(Api.entero(p, "id"));
            case "consultas.lista": return consultas();
            case "consultas.detalle": return consulta(Api.entero(p, "id"));
            case "consultas.crear": return crearConsulta(p);
            case "consultas.estado": return estadoConsulta(Api.entero(p, "id"), p.get("estado"), p.get("respuesta"));
            case "consultas.valorar": return valorar(Api.entero(p, "id"), Api.entero(p, "valoracion"));
            case "consultas.buscar": return buscar(p.get("q"));
            case "faq.lista": return obj("preguntas", preguntasFrecuentes());
            case "faq.guardar": return guardarPregunta(p);
            case "faq.borrar": return borrarPregunta(Api.entero(p, "id"));
            case "pulso.lista": return encuestas();
            case "pulso.detalle": return encuesta(Api.entero(p, "id"));
            case "pulso.responder": return responder(Api.entero(p, "id"), p.get("respuestas"));
            case "pulso.crear": return crearEncuesta(p);
            case "pulso.resultados": return resultados(Api.entero(p, "id"));
            case "pulso.cerrar": return cerrarEncuesta(Api.entero(p, "id"));
            default: throw new Api.Aviso("Operación desconocida: " + op);
        }
    }

    private boolean rrhh() {
        return "RRHH".equals(yo.rol);
    }

    private void soloRrhh(String que) {
        if (!rrhh()) throw new Api.Aviso("Solo RRHH puede " + que + ".");
    }

    // ---------------------------------------------------------------- Ámbito (a quién va un comunicado o una encuesta)

    /** TODOS, DEPARTAMENTO:<nombre> o ROL:<rol>; lanza Aviso si no es válido. */
    private String ambito(String a) {
        a = a == null || a.isBlank() ? "TODOS" : a.trim();
        if ("TODOS".equals(a)) return a;
        if (a.startsWith("DEPARTAMENTO:")) {
            String d = a.substring(13);
            for (Api.Emp e : api.plantilla()) if (d.equals(e.departamento)) return a;
            throw new Api.Aviso("Ese departamento no existe.");
        }
        if (a.startsWith("ROL:") && ROLES.contains(a.substring(4))) return a;
        throw new Api.Aviso("Destinatarios no válidos.");
    }

    static boolean incluye(String ambito, Api.Emp e) {
        if (ambito == null || "TODOS".equals(ambito)) return true;
        if (ambito.startsWith("DEPARTAMENTO:")) return ambito.substring(13).equals(e.departamento);
        if (ambito.startsWith("ROL:")) return ambito.substring(4).equals(e.rol);
        return false;
    }

    private List<Api.Emp> destinatarios(String ambito) {
        List<Api.Emp> l = new ArrayList<>();
        for (Api.Emp e : api.plantilla()) if (incluye(ambito, e)) l.add(e);
        return l;
    }

    /** Departamentos de la plantilla, para elegir destinatarios. */
    private List<String> departamentos() {
        Set<String> s = new java.util.TreeSet<>();
        for (Api.Emp e : api.plantilla()) if (e.departamento != null) s.add(e.departamento);
        return new ArrayList<>(s);
    }

    // ---------------------------------------------------------------- Resumen (Mi intranet y el asistente)

    Map<String, Object> resumen() throws SQLException {
        int porLeer = 0, porConfirmar = 0;
        Map<String, Object> ultimo = null;
        for (Map<String, Object> m : listaComunicados(false)) {
            boolean leido = (Boolean) m.get("leido"), confirmado = (Boolean) m.get("confirmado");
            if (!leido) porLeer++;
            if ((Boolean) m.get("confirmar") && !confirmado) porConfirmar++;
            // El más urgente: el primero por confirmar y, si no hay, el primero sin leer
            boolean confirmarlo = (Boolean) m.get("confirmar") && !confirmado;
            if (confirmarlo && (ultimo == null || !(Boolean) ultimo.get("confirmar") || ((Boolean) ultimo.get("confirmado")))) ultimo = m;
            else if (ultimo == null && !leido) ultimo = m;
        }
        int encuestas = 0;
        for (Map<String, Object> e : listaEncuestas()) if ("ABIERTA".equals(e.get("estado")) && !(Boolean) e.get("respondida") && (Boolean) e.get("paraMi")) encuestas++;
        int abiertas = contar("SELECT COUNT(*) FROM CONSULTA WHERE USUARIO = ? AND ESTADO <> 'RESUELTA'", yo.usuario);
        Map<String, Object> r = obj("comunicadosPorLeer", porLeer, "comunicadosPorConfirmar", porConfirmar,
                "comunicado", ultimo == null ? null : obj("id", ultimo.get("id"), "titulo", ultimo.get("titulo"), "confirmar", ultimo.get("confirmar"),
                        "limite", ultimo.get("limite")),
                "encuestasPendientes", encuestas, "consultasAbiertas", abiertas, "rrhh", rrhh());
        if (rrhh()) r.put("consultasSinAtender", contar("SELECT COUNT(*) FROM CONSULTA WHERE ESTADO = 'ABIERTA'", null));
        return r;
    }

    private int contar(String sql, String usuario) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            if (usuario != null) ps.setString(1, usuario);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    // ---------------------------------------------------------------- Comunicados

    private Map<String, Object> comunicados() throws SQLException {
        List<Map<String, Object>> todos = listaComunicados(rrhh());
        int porConfirmar = 0, porLeer = 0;
        for (Map<String, Object> m : todos) {
            if (!(Boolean) m.get("paraMi")) continue;
            if (!(Boolean) m.get("leido")) porLeer++;
            if ((Boolean) m.get("confirmar") && !(Boolean) m.get("confirmado")) porConfirmar++;
        }
        return obj("comunicados", todos, "porLeer", porLeer, "porConfirmar", porConfirmar, "rrhh", rrhh(),
                "departamentos", departamentos(), "categorias", CATEGORIAS_COMUNICADO);
    }

    /** Lecturas por comunicado: comunicado → (usuario → [leído, confirmado]). */
    private Map<Integer, Map<String, Timestamp[]>> lecturas() throws SQLException {
        Map<Integer, Map<String, Timestamp[]>> m = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT COMUNICADO, USUARIO, LEIDO, CONFIRMADO FROM COMUNICADO_LECTURA");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                m.computeIfAbsent(rs.getInt(1), k -> new HashMap<>()).put(rs.getString(2), new Timestamp[] {rs.getTimestamp(3), rs.getTimestamp(4)});
            }
        }
        return m;
    }

    /**
     * Comunicados no archivados: los dirigidos al usuario y, con todos=true (RRHH), también el resto, con el recuento
     * de lecturas y confirmaciones de sus destinatarios.
     */
    private List<Map<String, Object>> listaComunicados(boolean todos) throws SQLException {
        Map<Integer, Map<String, Timestamp[]>> lect = lecturas();
        List<Map<String, Object>> l = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM COMUNICADO WHERE ARCHIVADO = 0 ORDER BY PUBLICADO DESC, ID DESC");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String ambito = rs.getString("AMBITO");
                boolean paraMi = incluye(ambito, yo);
                if (!paraMi && !todos) continue;
                int id = rs.getInt("ID");
                Map<String, Timestamp[]> mias = lect.getOrDefault(id, Collections.emptyMap());
                Timestamp[] mia = mias.get(yo.usuario);
                Map<String, Object> m = comunicadoJson(rs, false);
                m.put("paraMi", paraMi);
                m.put("leido", mia != null);
                m.put("confirmado", mia != null && mia[1] != null);
                if (todos) {
                    int dest = 0, leidos = 0, confirmados = 0;
                    for (Api.Emp e : destinatarios(ambito)) {
                        dest++;
                        Timestamp[] x = mias.get(e.usuario);
                        if (x != null) leidos++;
                        if (x != null && x[1] != null) confirmados++;
                    }
                    m.put("estadisticas", obj("destinatarios", dest, "leidos", leidos, "confirmados", confirmados));
                }
                l.add(m);
            }
        }
        return l;
    }

    private Map<String, Object> comunicadoJson(ResultSet rs, boolean completo) throws SQLException {
        Api.Emp autor = api.emp(rs.getString("AUTOR"));
        String texto = rs.getString("TEXTO");
        Date limite = rs.getDate("LIMITE");
        Map<String, Object> m = obj("id", rs.getInt("ID"), "titulo", rs.getString("TITULO"), "categoria", rs.getString("CATEGORIA"),
                "ambito", rs.getString("AMBITO"), "confirmar", rs.getInt("CONFIRMAR") == 1, "enlace", rs.getString("ENLACE"),
                "limite", limite == null ? null : limite.toString(), "autor", autor == null ? rs.getString("AUTOR") : autor.nombre,
                "publicado", rs.getTimestamp("PUBLICADO").toLocalDateTime().withNano(0).toString());
        m.put(completo ? "texto" : "extracto", completo ? texto : extracto(texto, 220));
        return m;
    }

    private static String extracto(String s, int n) {
        if (s == null) return null;
        s = s.replaceAll("\\s+", " ").trim();
        return s.length() > n ? s.substring(0, n - 1).trim() + "…" : s;
    }

    /** Comunicado que el usuario puede ver (destinatario o RRHH) con su columna AMBITO; Aviso si no. */
    private Map<String, Object> leerComunicado(int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM COMUNICADO WHERE ID = ? AND ARCHIVADO = 0")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("El comunicado ya no existe.");
                if (!incluye(rs.getString("AMBITO"), yo) && !rrhh()) throw new Api.Aviso("Ese comunicado no va dirigido a ti.");
                return comunicadoJson(rs, true);
            }
        }
    }

    private Map<String, Object> comunicado(int id, boolean marcar) throws SQLException {
        Map<String, Object> m = leerComunicado(id);
        boolean paraMi = incluye((String) m.get("ambito"), yo);
        if (marcar && paraMi) {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO COMUNICADO_LECTURA (COMUNICADO, USUARIO, LEIDO) VALUES (?,?,?)"
                    + " ON CONFLICT (COMUNICADO, USUARIO) DO NOTHING")) {
                ps.setInt(1, id);
                ps.setString(2, yo.usuario);
                ps.setTimestamp(3, Timestamp.valueOf(LocalDateTime.now()));
                ps.executeUpdate();
            }
        }
        Timestamp[] mia = lecturas().getOrDefault(id, Collections.emptyMap()).get(yo.usuario);
        m.put("paraMi", paraMi);
        m.put("leido", mia != null);
        m.put("confirmado", mia != null && mia[1] != null);
        m.put("confirmadoEl", mia != null && mia[1] != null ? mia[1].toLocalDateTime().withNano(0).toString() : null);
        return m;
    }

    private Map<String, Object> confirmar(int id) throws SQLException {
        Map<String, Object> m = leerComunicado(id);
        if (!incluye((String) m.get("ambito"), yo)) throw new Api.Aviso("Ese comunicado no va dirigido a ti.");
        if (!(Boolean) m.get("confirmar")) throw new Api.Aviso("Este comunicado no necesita confirmación.");
        Timestamp ahora = Timestamp.valueOf(LocalDateTime.now());
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO COMUNICADO_LECTURA (COMUNICADO, USUARIO, LEIDO, CONFIRMADO) VALUES (?,?,?,?)"
                + " ON CONFLICT (COMUNICADO, USUARIO) DO UPDATE SET CONFIRMADO = COALESCE(COMUNICADO_LECTURA.CONFIRMADO, EXCLUDED.CONFIRMADO)")) {
            ps.setInt(1, id);
            ps.setString(2, yo.usuario);
            ps.setTimestamp(3, ahora);
            ps.setTimestamp(4, ahora);
            ps.executeUpdate();
        }
        Map<String, Object> r = comunicado(id, false);
        r.put("mensaje", "Lectura confirmada.");
        return r;
    }

    private Map<String, Object> publicar(Map<String, String> p) throws SQLException {
        soloRrhh("publicar comunicados");
        String titulo = limpio(p.get("titulo"), 160), texto = limpio(p.get("texto"), 8000), enlace = limpio(p.get("enlace"), 500);
        if (titulo == null) throw new Api.Aviso("Escribe el título del comunicado.");
        if (texto == null) throw new Api.Aviso("Escribe el texto del comunicado.");
        String categoria = p.get("categoria") == null ? "AVISO" : p.get("categoria");
        if (!CATEGORIAS_COMUNICADO.contains(categoria)) throw new Api.Aviso("Categoría no válida.");
        // https://... o una ruta del portal (/...), nunca //otro-dominio
        if (enlace != null && !enlace.matches("(?i)https?://\\S+|/(?!/)\\S*")) throw new Api.Aviso("El enlace tiene que empezar por https:// o por /.");
        String ambito = ambito(p.get("ambito"));
        boolean confirmarLectura = si(p.get("confirmar"));
        LocalDate limite = p.get("limite") == null || p.get("limite").isBlank() ? null : Api.fecha(p.get("limite"));
        if (limite != null && limite.isBefore(LocalDate.now())) throw new Api.Aviso("La fecha límite no puede ser anterior a hoy.");
        List<Api.Emp> dest = destinatarios(ambito);
        if (dest.isEmpty()) throw new Api.Aviso("No hay nadie en esos destinatarios.");
        int id;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO COMUNICADO (TITULO, TEXTO, CATEGORIA, AMBITO, CONFIRMAR, ENLACE, LIMITE,"
                + " AUTOR, PUBLICADO) VALUES (?,?,?,?,?,?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, titulo);
            ps.setString(2, texto);
            ps.setString(3, categoria);
            ps.setString(4, ambito);
            ps.setInt(5, confirmarLectura ? 1 : 0);
            ps.setString(6, enlace);
            ps.setDate(7, limite == null ? null : Date.valueOf(limite));
            ps.setString(8, yo.usuario);
            ps.setTimestamp(9, Timestamp.valueOf(LocalDateTime.now()));
            ps.executeUpdate();
            id = clave(ps);
        }
        for (Api.Emp e : dest) {
            if (e == yo) continue;
            if (confirmarLectura) {
                Social.avisar(c, e.usuario, "comunicacion", "COMUNICADO", id, "comunicado.confirmar",
                        obj("titulo", titulo, "fecha", limite == null ? null : limite.toString()),
                        "RRHH ha publicado «" + titulo + "»: léelo y confírmalo" + (limite == null ? "." : " antes del " + Api.corta(limite) + "."));
            } else {
                Social.avisar(c, e.usuario, "comunicacion", "COMUNICADO", id, "comunicado.nuevo", obj("titulo", titulo),
                        "Nuevo comunicado de RRHH: «" + titulo + "».");
            }
        }
        return obj("ok", true, "id", id, "mensaje", "Comunicado publicado para " + dest.size() + " personas.");
    }

    private Map<String, Object> lecturas(int id) throws SQLException {
        soloRrhh("ver quién ha leído un comunicado");
        Map<String, Object> m = leerComunicado(id);
        Map<String, Timestamp[]> l = lecturas().getOrDefault(id, Collections.emptyMap());
        List<Object> personas = new ArrayList<>();
        int leidos = 0, confirmados = 0;
        for (Api.Emp e : destinatarios((String) m.get("ambito"))) {
            Timestamp[] x = l.get(e.usuario);
            if (x != null) leidos++;
            if (x != null && x[1] != null) confirmados++;
            personas.add(obj("persona", e.json(), "leido", x == null ? null : x[0].toLocalDateTime().withNano(0).toString(),
                    "confirmado", x == null || x[1] == null ? null : x[1].toLocalDateTime().withNano(0).toString()));
        }
        m.put("personas", personas);
        m.put("estadisticas", obj("destinatarios", personas.size(), "leidos", leidos, "confirmados", confirmados));
        return m;
    }

    private Map<String, Object> recordar(int id) throws SQLException {
        soloRrhh("enviar recordatorios");
        Map<String, Object> m = leerComunicado(id);
        boolean confirmarLectura = (Boolean) m.get("confirmar");
        Map<String, Timestamp[]> l = lecturas().getOrDefault(id, Collections.emptyMap());
        int n = 0;
        for (Api.Emp e : destinatarios((String) m.get("ambito"))) {
            Timestamp[] x = l.get(e.usuario);
            boolean pendiente = confirmarLectura ? x == null || x[1] == null : x == null;
            if (!pendiente || e == yo) continue;
            Social.avisar(c, e.usuario, "comunicacion", "COMUNICADO", id, "comunicado.recordatorio", obj("titulo", m.get("titulo")),
                    "Recordatorio de RRHH: " + (confirmarLectura ? "confirma que has leído" : "lee") + " «" + m.get("titulo") + "».");
            n++;
        }
        if (n == 0) throw new Api.Aviso(confirmarLectura ? "Todos los destinatarios lo han confirmado." : "Todos los destinatarios lo han leído.");
        return obj("ok", true, "mensaje", "Recordatorio enviado a " + n + " personas.");
    }

    private Map<String, Object> archivar(int id) throws SQLException {
        soloRrhh("archivar comunicados");
        leerComunicado(id);
        try (PreparedStatement ps = c.prepareStatement("UPDATE COMUNICADO SET ARCHIVADO = 1 WHERE ID = ?")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        }
        return obj("ok", true, "mensaje", "Comunicado archivado.");
    }

    // ---------------------------------------------------------------- Consultas a RRHH

    private Map<String, Object> consultaJson(ResultSet rs, Map<String, Integer> comentarios, boolean completa) throws SQLException {
        int id = rs.getInt("ID");
        Api.Emp quien = api.emp(rs.getString("USUARIO")), atiende = api.emp(rs.getString("ATIENDE"));
        Timestamp res = rs.getTimestamp("RESUELTO");
        int v = rs.getInt("VALORACION");
        Integer valoracion = rs.wasNull() ? null : v;
        Map<String, Object> m = obj("id", id, "persona", quien == null ? obj("usuario", rs.getString("USUARIO"), "nombre", rs.getString("USUARIO")) : quien.json(),
                "categoria", rs.getString("CATEGORIA"), "asunto", rs.getString("ASUNTO"), "estado", rs.getString("ESTADO"),
                "atiende", atiende == null ? null : atiende.nombre, "atiendeUsuario", rs.getString("ATIENDE"),
                "mia", rs.getString("USUARIO").equals(yo.usuario),
                "creado", rs.getTimestamp("CREADO").toLocalDateTime().withNano(0).toString(),
                "actualizado", rs.getTimestamp("ACTUALIZADO").toLocalDateTime().withNano(0).toString(),
                "resuelto", res == null ? null : res.toLocalDateTime().withNano(0).toString(), "valoracion", valoracion,
                "comentarios", comentarios == null ? 0 : comentarios.getOrDefault("CONSULTA:" + id, 0));
        m.put(completa ? "texto" : "extracto", completa ? rs.getString("TEXTO") : extracto(rs.getString("TEXTO"), 160));
        return m;
    }

    private Map<String, Object> consultas() throws SQLException {
        Map<String, Integer> cuenta = Social.contar(c);
        List<Object> mias = new ArrayList<>(), bandeja = new ArrayList<>();
        String orden = " ORDER BY CASE ESTADO WHEN 'ABIERTA' THEN 0 WHEN 'EN_CURSO' THEN 1 ELSE 2 END, ACTUALIZADO DESC";
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM CONSULTA WHERE USUARIO = ?" + orden)) {
            ps.setString(1, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) mias.add(consultaJson(rs, cuenta, false));
            }
        }
        if (rrhh()) {
            try (PreparedStatement ps = c.prepareStatement("SELECT * FROM CONSULTA WHERE USUARIO <> ?" + orden)) {
                ps.setString(1, yo.usuario);
                ps.setMaxRows(200);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) bandeja.add(consultaJson(rs, cuenta, false));
                }
            }
        }
        return obj("mias", mias, "bandeja", rrhh() ? bandeja : null, "rrhh", rrhh(), "categorias", CATEGORIAS_CONSULTA);
    }

    /** La consulta, si el usuario puede verla (quien pregunta o RRHH). */
    private Map<String, Object> consulta(int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM CONSULTA WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("La consulta ya no existe.");
                if (!rs.getString("USUARIO").equals(yo.usuario) && !rrhh()) throw new Api.Aviso("No tienes acceso a esa consulta.");
                return consultaJson(rs, Social.contar(c), true);
            }
        }
    }

    /** Personas de RRHH (para avisarles de una consulta). */
    private List<String> rrhhs() {
        List<String> l = new ArrayList<>();
        for (Api.Emp e : api.plantilla()) if ("RRHH".equals(e.rol)) l.add(e.usuario);
        return l;
    }

    private Map<String, Object> crearConsulta(Map<String, String> p) throws SQLException {
        String categoria = p.get("categoria") == null ? "OTRA" : p.get("categoria");
        if (!CATEGORIAS_CONSULTA.contains(categoria)) throw new Api.Aviso("Categoría no válida.");
        String asunto = limpio(p.get("asunto"), 160), texto = limpio(p.get("texto"), 2000);
        if (asunto == null) throw new Api.Aviso("Escribe el asunto de la consulta.");
        if (texto == null) throw new Api.Aviso("Explica tu consulta.");
        Timestamp ahora = Timestamp.valueOf(LocalDateTime.now());
        int id;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO CONSULTA (USUARIO, CATEGORIA, ASUNTO, TEXTO, ESTADO, CREADO, ACTUALIZADO)"
                + " VALUES (?,?,?,?,'ABIERTA',?,?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, yo.usuario);
            ps.setString(2, categoria);
            ps.setString(3, asunto);
            ps.setString(4, texto);
            ps.setTimestamp(5, ahora);
            ps.setTimestamp(6, ahora);
            ps.executeUpdate();
            id = clave(ps);
        }
        for (String u : rrhhs()) {
            if (u.equals(yo.usuario)) continue;
            Social.avisar(c, u, "comunicacion", "CONSULTA", id, "consulta.nueva", obj("quien", yo.nombre, "titulo", asunto),
                    yo.nombre + " ha enviado una consulta a RRHH: «" + asunto + "».");
        }
        Map<String, Object> r = consulta(id);
        r.put("mensaje", "Consulta enviada a RRHH.");
        return r;
    }

    private Map<String, Object> estadoConsulta(int id, String estado, String respuesta) throws SQLException {
        Map<String, Object> m = consulta(id);
        String actual = (String) m.get("estado");
        String dueno = (String) ((Map<?, ?>) m.get("persona")).get("usuario");
        Timestamp ahora = Timestamp.valueOf(LocalDateTime.now());
        String mensaje;
        if ("REABRIR".equals(estado)) {
            if (!dueno.equals(yo.usuario)) throw new Api.Aviso("Solo quien hizo la consulta puede reabrirla.");
            if (!"RESUELTA".equals(actual)) throw new Api.Aviso("La consulta no está resuelta.");
            actualizar("UPDATE CONSULTA SET ESTADO = 'EN_CURSO', RESUELTO = NULL, VALORACION = NULL, ACTUALIZADO = ? WHERE ID = ?", ahora, id, null);
            String aQuien = (String) m.get("atiendeUsuario");
            for (String u : aQuien != null ? List.of(aQuien) : rrhhs()) {
                Social.avisar(c, u, "comunicacion", "CONSULTA", id, "consulta.reabierta", obj("quien", yo.nombre, "titulo", m.get("asunto")),
                        yo.nombre + " ha reabierto su consulta «" + m.get("asunto") + "».");
            }
            mensaje = "Consulta reabierta.";
        } else {
            soloRrhh("cambiar el estado de una consulta");
            if ("EN_CURSO".equals(estado)) {
                if ("RESUELTA".equals(actual)) throw new Api.Aviso("La consulta ya está resuelta.");
                actualizar("UPDATE CONSULTA SET ESTADO = 'EN_CURSO', ATIENDE = ?, ACTUALIZADO = ? WHERE ID = ?", ahora, id, yo.usuario);
                mensaje = "Consulta asignada a ti.";
            } else if ("RESUELTA".equals(estado)) {
                if ("RESUELTA".equals(actual)) throw new Api.Aviso("La consulta ya está resuelta.");
                String r = limpio(respuesta, 1000);
                if (r != null) Social.comentarSinAviso(c, "CONSULTA", id, yo.usuario, r);
                actualizar("UPDATE CONSULTA SET ESTADO = 'RESUELTA', ATIENDE = COALESCE(ATIENDE, ?), RESUELTO = ?, ACTUALIZADO = ? WHERE ID = ?",
                        ahora, id, yo.usuario);
                if (!dueno.equals(yo.usuario)) {
                    Social.avisar(c, dueno, "comunicacion", "CONSULTA", id, "consulta.resuelta", obj("titulo", m.get("asunto")),
                            "RRHH ha resuelto tu consulta «" + m.get("asunto") + "».");
                }
                mensaje = "Consulta resuelta.";
            } else {
                throw new Api.Aviso("Estado no válido.");
            }
        }
        Map<String, Object> r = consulta(id);
        r.put("mensaje", mensaje);
        return r;
    }

    /** UPDATE con los parámetros (usuario?, ahora..., id) en el orden de la sentencia. */
    private void actualizar(String sql, Timestamp ahora, int id, String usuario) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            if (usuario != null) ps.setString(i++, usuario);
            int marcas = sql.split("\\?", -1).length - 1 - i;   // las ? restantes menos la del id son fechas
            for (int k = 0; k < marcas; k++) ps.setTimestamp(i++, ahora);
            ps.setInt(i, id);
            ps.executeUpdate();
        }
    }

    private Map<String, Object> valorar(int id, int valoracion) throws SQLException {
        Map<String, Object> m = consulta(id);
        if (!(Boolean) m.get("mia")) throw new Api.Aviso("Solo quien hizo la consulta puede valorarla.");
        if (!"RESUELTA".equals(m.get("estado"))) throw new Api.Aviso("La consulta no está resuelta.");
        if (valoracion < 1 || valoracion > 5) throw new Api.Aviso("La valoración va de 1 a 5.");
        try (PreparedStatement ps = c.prepareStatement("UPDATE CONSULTA SET VALORACION = ? WHERE ID = ?")) {
            ps.setInt(1, valoracion);
            ps.setInt(2, id);
            ps.executeUpdate();
        }
        Map<String, Object> r = consulta(id);
        r.put("mensaje", "Gracias por tu valoración.");
        return r;
    }

    /**
     * Cuando alguien comenta una consulta (Social.comentar): si es RRHH y la consulta estaba abierta, pasa a "en curso"
     * y la atiende quien comenta. Devuelve a quién avisar del comentario: al dueño si comenta RRHH; si comenta el dueño,
     * a quien la atiende o, si nadie la atiende aún, a todo RRHH.
     */
    static List<String> alComentar(Connection c, Api api, int id, String dueno) throws SQLException {
        Api.Emp yo = api.yo();
        Timestamp ahora = Timestamp.valueOf(LocalDateTime.now());
        String atiende = null;
        try (PreparedStatement ps = c.prepareStatement("SELECT ATIENDE FROM CONSULTA WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) atiende = rs.getString(1);
            }
        }
        if (!dueno.equals(yo.usuario) && "RRHH".equals(yo.rol)) {
            try (PreparedStatement ps = c.prepareStatement("UPDATE CONSULTA SET ESTADO = CASE ESTADO WHEN 'ABIERTA' THEN 'EN_CURSO' ELSE ESTADO END,"
                    + " ATIENDE = COALESCE(ATIENDE, ?), ACTUALIZADO = ? WHERE ID = ?")) {
                ps.setString(1, yo.usuario);
                ps.setTimestamp(2, ahora);
                ps.setInt(3, id);
                ps.executeUpdate();
            }
            return List.of(dueno);
        }
        try (PreparedStatement ps = c.prepareStatement("UPDATE CONSULTA SET ACTUALIZADO = ? WHERE ID = ?")) {
            ps.setTimestamp(1, ahora);
            ps.setInt(2, id);
            ps.executeUpdate();
        }
        if (atiende != null) return List.of(atiende);
        List<String> l = new ArrayList<>();
        for (Api.Emp e : api.plantilla()) if ("RRHH".equals(e.rol) && !e.usuario.equals(yo.usuario)) l.add(e.usuario);
        return l;
    }

    // ---------------------------------------------------------------- Preguntas frecuentes y búsqueda

    private List<Object> preguntasFrecuentes() throws SQLException {
        List<Object> l = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM PREGUNTA_FRECUENTE ORDER BY CATEGORIA, ID"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                l.add(obj("id", rs.getInt("ID"), "categoria", rs.getString("CATEGORIA"), "pregunta", rs.getString("PREGUNTA"),
                        "respuesta", rs.getString("RESPUESTA")));
            }
        }
        return l;
    }

    private Map<String, Object> guardarPregunta(Map<String, String> p) throws SQLException {
        soloRrhh("editar las preguntas frecuentes");
        String categoria = p.get("categoria") == null ? "OTRA" : p.get("categoria");
        if (!CATEGORIAS_CONSULTA.contains(categoria)) throw new Api.Aviso("Categoría no válida.");
        String pregunta = limpio(p.get("pregunta"), 300), respuesta = limpio(p.get("respuesta"), 2000);
        if (pregunta == null || respuesta == null) throw new Api.Aviso("Escribe la pregunta y la respuesta.");
        String id = p.get("id");
        String sql = id == null || id.isBlank()
                ? "INSERT INTO PREGUNTA_FRECUENTE (CATEGORIA, PREGUNTA, RESPUESTA, ACTUALIZADO) VALUES (?,?,?,?)"
                : "UPDATE PREGUNTA_FRECUENTE SET CATEGORIA = ?, PREGUNTA = ?, RESPUESTA = ?, ACTUALIZADO = ? WHERE ID = ?";
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, categoria);
            ps.setString(2, pregunta);
            ps.setString(3, respuesta);
            ps.setTimestamp(4, Timestamp.valueOf(LocalDateTime.now()));
            if (id != null && !id.isBlank()) ps.setInt(5, Api.entero(p, "id"));
            if (ps.executeUpdate() == 0) throw new Api.Aviso("La pregunta ya no existe.");
        }
        return obj("ok", true, "preguntas", preguntasFrecuentes(), "mensaje", "Pregunta frecuente guardada.");
    }

    private Map<String, Object> borrarPregunta(int id) throws SQLException {
        soloRrhh("editar las preguntas frecuentes");
        try (PreparedStatement ps = c.prepareStatement("DELETE FROM PREGUNTA_FRECUENTE WHERE ID = ?")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        }
        return obj("ok", true, "preguntas", preguntasFrecuentes(), "mensaje", "Pregunta frecuente borrada.");
    }

    /** Minúsculas y sin tildes, para buscar. */
    static String normal(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }

    private static final Set<String> VACIAS = new HashSet<>(Arrays.asList("como", "cual", "cuando", "donde", "para", "por", "que",
            "con", "los", "las", "del", "una", "uno", "unos", "unas", "mis", "mas", "pero", "tengo", "puedo", "quiero", "hay",
            "the", "and", "how", "what", "can", "for", "with", "my"));

    /** Palabras significativas de una búsqueda (3 letras o más, sin las más comunes). */
    static List<String> palabras(String q) {
        List<String> l = new ArrayList<>();
        for (String w : normal(q).split("[^a-z0-9]+")) if (w.length() >= 3 && !VACIAS.contains(w) && !l.contains(w)) l.add(w);
        return l;
    }

    /** Puntuación: cuántas palabras de la búsqueda aparecen (cada una cuenta el doble si está en el título). */
    private static int puntos(List<String> ws, String titulo, String cuerpo) {
        String t = normal(titulo), b = normal(cuerpo);
        int n = 0;
        for (String w : ws) {
            String raiz = w.length() > 5 ? w.substring(0, w.length() - 2) : w;   // nómina / nóminas, certificado / certificados
            if (t.contains(raiz)) n += 2;
            else if (b.contains(raiz)) n++;
        }
        return n;
    }

    /** Respuestas que pueden resolver una duda antes de preguntar a RRHH: preguntas frecuentes y comunicados. */
    private Map<String, Object> buscar(String q) throws SQLException {
        List<String> ws = palabras(q);
        if (ws.isEmpty()) return obj("preguntas", List.of(), "comunicados", List.of());
        TreeMap<Integer, List<Object>> faq = new TreeMap<>(Collections.reverseOrder()), com = new TreeMap<>(Collections.reverseOrder());
        for (Object o : preguntasFrecuentes()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) o;
            int n = puntos(ws, (String) m.get("pregunta"), (String) m.get("respuesta"));
            if (n > 0) faq.computeIfAbsent(n, k -> new ArrayList<>()).add(m);
        }
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM COMUNICADO WHERE ARCHIVADO = 0 ORDER BY PUBLICADO DESC"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                if (!incluye(rs.getString("AMBITO"), yo) && !rrhh()) continue;
                int n = puntos(ws, rs.getString("TITULO"), rs.getString("TEXTO"));
                if (n > 0) com.computeIfAbsent(n, k -> new ArrayList<>()).add(comunicadoJson(rs, false));
            }
        }
        // Solo lo relevante: al menos la mitad de la puntuación de la mejor respuesta (de las dos listas)
        int mejor = Math.max(faq.isEmpty() ? 0 : faq.firstKey(), com.isEmpty() ? 0 : com.firstKey());
        int minimo = Math.max(1, (mejor + 1) / 2);
        return obj("preguntas", primeros(faq, 4, minimo), "comunicados", primeros(com, 3, minimo));
    }

    private static List<Object> primeros(TreeMap<Integer, List<Object>> m, int n, int minimo) {
        List<Object> l = new ArrayList<>();
        for (Map.Entry<Integer, List<Object>> x : m.entrySet()) {
            if (x.getKey() < minimo) break;
            for (Object o : x.getValue()) if (l.size() < n) l.add(o);
        }
        return l;
    }

    // ---------------------------------------------------------------- Pulso (encuestas anónimas)

    private List<Map<String, Object>> listaEncuestas() throws SQLException {
        Set<Integer> respondidas = new HashSet<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT ENCUESTA FROM ENCUESTA_PARTICIPACION WHERE USUARIO = ?")) {
            ps.setString(1, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) respondidas.add(rs.getInt(1));
            }
        }
        Map<Integer, Integer> participantes = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT ENCUESTA, COUNT(*) FROM ENCUESTA_PARTICIPACION GROUP BY ENCUESTA");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) participantes.put(rs.getInt(1), rs.getInt(2));
        }
        List<Map<String, Object>> l = new ArrayList<>();
        LocalDate hoy = LocalDate.now();
        try (PreparedStatement ps = c.prepareStatement("SELECT E.*, (SELECT COUNT(*) FROM ENCUESTA_PREGUNTA P WHERE P.ENCUESTA = E.ID) AS PREGUNTAS"
                + " FROM ENCUESTA E ORDER BY E.ABIERTA DESC, E.ID DESC"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String ambito = rs.getString("AMBITO");
                boolean paraMi = incluye(ambito, yo);
                boolean ver = paraMi || rrhh() || ("RESPONSABLE".equals(yo.rol) && incluyeDepartamento(ambito, yo.departamento));
                if (!ver) continue;
                int id = rs.getInt("ID");
                Date cierre = rs.getDate("CIERRE");
                boolean abierta = "ABIERTA".equals(rs.getString("ESTADO")) && (cierre == null || !cierre.toLocalDate().isBefore(hoy));
                l.add(obj("id", id, "titulo", rs.getString("TITULO"), "descripcion", rs.getString("DESCRIPCION"), "ambito", ambito,
                        "estado", abierta ? "ABIERTA" : "CERRADA", "cierre", cierre == null ? null : cierre.toString(),
                        "abierta", rs.getTimestamp("ABIERTA").toLocalDateTime().toLocalDate().toString(),
                        "minimo", rs.getInt("MINIMO"), "preguntas", rs.getInt("PREGUNTAS"),
                        "paraMi", paraMi, "respondida", respondidas.contains(id),
                        "participantes", participantes.getOrDefault(id, 0), "destinatarios", destinatarios(ambito).size(),
                        "resultados", rrhh() || "RESPONSABLE".equals(yo.rol)));
            }
        }
        return l;
    }

    /** true si una encuesta con ese ámbito llega a alguien del departamento. */
    private boolean incluyeDepartamento(String ambito, String departamento) {
        for (Api.Emp e : api.plantilla()) if (departamento != null && departamento.equals(e.departamento) && incluye(ambito, e)) return true;
        return false;
    }

    private Map<String, Object> encuestas() throws SQLException {
        return obj("encuestas", listaEncuestas(), "rrhh", rrhh(), "departamentos", departamentos(), "minimo", MINIMO_ANONIMATO);
    }

    private Map<String, Object> filaEncuesta(int id) throws SQLException {
        for (Map<String, Object> e : listaEncuestas()) if (((Integer) e.get("id")) == id) return e;
        throw new Api.Aviso("La encuesta no existe o no va dirigida a ti.");
    }

    private List<Map<String, Object>> preguntas(int encuesta) throws SQLException {
        List<Map<String, Object>> l = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM ENCUESTA_PREGUNTA WHERE ENCUESTA = ? ORDER BY ORDEN, ID")) {
            ps.setInt(1, encuesta);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) l.add(obj("id", rs.getInt("ID"), "tipo", rs.getString("TIPO"), "texto", rs.getString("TEXTO")));
            }
        }
        return l;
    }

    private Map<String, Object> encuesta(int id) throws SQLException {
        Map<String, Object> e = filaEncuesta(id);
        e.put("lista", preguntas(id));
        return e;
    }

    private Map<String, Object> responder(int id, String json) throws SQLException {
        Map<String, Object> e = filaEncuesta(id);
        if (!(Boolean) e.get("paraMi")) throw new Api.Aviso("Esta encuesta no va dirigida a ti.");
        if (!"ABIERTA".equals(e.get("estado"))) throw new Api.Aviso("La encuesta ya está cerrada.");
        if ((Boolean) e.get("respondida")) throw new Api.Aviso("Ya has respondido a esta encuesta.");
        JsonObject r;
        try (JsonReader jr = jakarta.json.Json.createReader(new StringReader(json == null ? "{}" : json))) {
            r = jr.readObject();
        } catch (RuntimeException ex) {
            throw new Api.Aviso("Respuestas no válidas.");
        }
        List<Object[]> filas = new ArrayList<>();   // pregunta, valor, texto
        for (Map<String, Object> q : preguntas(id)) {
            String k = String.valueOf(q.get("id"));
            JsonValue v = r.get(k);
            String tipo = (String) q.get("tipo");
            if ("TEXTO".equals(tipo)) {
                String t = v instanceof JsonString s ? limpio(s.getString(), 1000) : null;
                if (t != null) filas.add(new Object[] {q.get("id"), null, t});
                continue;
            }
            Integer n = v instanceof JsonNumber num ? Integer.valueOf(num.intValue())
                    : v instanceof JsonString s && s.getString().matches("\\d{1,2}") ? Integer.valueOf(s.getString()) : null;
            int max = "ENPS".equals(tipo) ? 10 : 5, min = "ENPS".equals(tipo) ? 0 : 1;
            if (n == null) throw new Api.Aviso("Responde a todas las preguntas (el comentario es opcional).");
            if (n < min || n > max) throw new Api.Aviso("Respuesta fuera de escala.");
            filas.add(new Object[] {q.get("id"), n, null});
        }
        boolean auto = c.getAutoCommit();
        c.setAutoCommit(false);
        try {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_PARTICIPACION (ENCUESTA, USUARIO) VALUES (?,?)")) {
                ps.setInt(1, id);
                ps.setString(2, yo.usuario);
                ps.executeUpdate();
            }
            // Sin usuario ni hora: un identificador aleatorio agrupa el envío
            String envio = UUID.randomUUID().toString();
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_RESPUESTA (ENVIO, ENCUESTA, PREGUNTA, DEPARTAMENTO, VALOR, TEXTO)"
                    + " VALUES (?,?,?,?,?,?)")) {
                for (Object[] f : filas) {
                    ps.setString(1, envio);
                    ps.setInt(2, id);
                    ps.setInt(3, (Integer) f[0]);
                    ps.setString(4, yo.departamento);
                    if (f[1] == null) ps.setNull(5, java.sql.Types.SMALLINT); else ps.setInt(5, (Integer) f[1]);
                    ps.setString(6, (String) f[2]);
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            c.commit();
        } catch (SQLException ex) {
            c.rollback();
            if ("23505".equals(ex.getSQLState())) throw new Api.Aviso("Ya has respondido a esta encuesta.");
            throw ex;
        } finally {
            c.setAutoCommit(auto);
        }
        Map<String, Object> res = encuesta(id);
        res.put("mensaje", "Gracias: tus respuestas son anónimas.");
        return res;
    }

    private Map<String, Object> crearEncuesta(Map<String, String> p) throws SQLException {
        soloRrhh("crear encuestas");
        String titulo = limpio(p.get("titulo"), 160), descripcion = limpio(p.get("descripcion"), 500);
        if (titulo == null) throw new Api.Aviso("Escribe el título de la encuesta.");
        String ambito = ambito(p.get("ambito"));
        int minimo = p.get("minimo") == null || p.get("minimo").isBlank() ? 5 : Api.entero(p, "minimo");
        if (minimo < MINIMO_ANONIMATO || minimo > 50) throw new Api.Aviso("El mínimo de respuestas para ver resultados va de 3 a 50.");
        LocalDate cierre = p.get("cierre") == null || p.get("cierre").isBlank() ? null : Api.fecha(p.get("cierre"));
        if (cierre != null && cierre.isBefore(LocalDate.now())) throw new Api.Aviso("La fecha de cierre no puede ser anterior a hoy.");
        List<String[]> qs = new ArrayList<>();
        try (JsonReader jr = jakarta.json.Json.createReader(new StringReader(p.get("preguntas") == null ? "[]" : p.get("preguntas")))) {
            JsonArray a = jr.readArray();
            for (JsonValue v : a) {
                JsonObject o = v.asJsonObject();
                String tipo = o.getString("tipo", "ESCALA"), texto = limpio(o.getString("texto", ""), 300);
                if (!TIPOS_PREGUNTA.contains(tipo)) throw new Api.Aviso("Tipo de pregunta no válido.");
                if (texto != null) qs.add(new String[] {tipo, texto});
            }
        } catch (Api.Aviso ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new Api.Aviso("Preguntas no válidas.");
        }
        if (qs.isEmpty()) throw new Api.Aviso("Añade al menos una pregunta.");
        if (qs.size() > 10) throw new Api.Aviso("Un pulso tiene como mucho 10 preguntas: que sea corto.");
        List<Api.Emp> dest = destinatarios(ambito);
        if (dest.size() < minimo) throw new Api.Aviso("Hay menos destinatarios que el mínimo de respuestas: nunca se verían resultados.");
        int id;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA (TITULO, DESCRIPCION, AMBITO, MINIMO, ESTADO, AUTOR, ABIERTA, CIERRE)"
                + " VALUES (?,?,?,?,'ABIERTA',?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, titulo);
            ps.setString(2, descripcion);
            ps.setString(3, ambito);
            ps.setInt(4, minimo);
            ps.setString(5, yo.usuario);
            ps.setTimestamp(6, Timestamp.valueOf(LocalDateTime.now()));
            ps.setDate(7, cierre == null ? null : Date.valueOf(cierre));
            ps.executeUpdate();
            id = clave(ps);
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_PREGUNTA (ENCUESTA, ORDEN, TIPO, TEXTO) VALUES (?,?,?,?)")) {
            for (int i = 0; i < qs.size(); i++) {
                ps.setInt(1, id);
                ps.setInt(2, i + 1);
                ps.setString(3, qs.get(i)[0]);
                ps.setString(4, qs.get(i)[1]);
                ps.addBatch();
            }
            ps.executeBatch();
        }
        for (Api.Emp e : dest) {
            if (e == yo) continue;
            Social.avisar(c, e.usuario, "comunicacion", "ENCUESTA", id, "pulso.nueva", obj("titulo", titulo),
                    "Nueva encuesta anónima de RRHH: «" + titulo + "». Es un minuto.");
        }
        return obj("ok", true, "id", id, "mensaje", "Encuesta abierta para " + dest.size() + " personas.");
    }

    private Map<String, Object> cerrarEncuesta(int id) throws SQLException {
        soloRrhh("cerrar encuestas");
        filaEncuesta(id);
        try (PreparedStatement ps = c.prepareStatement("UPDATE ENCUESTA SET ESTADO = 'CERRADA', CIERRE = ? WHERE ID = ?")) {
            ps.setDate(1, Date.valueOf(LocalDate.now()));
            ps.setInt(2, id);
            ps.executeUpdate();
        }
        return obj("ok", true, "mensaje", "Encuesta cerrada.");
    }

    /**
     * Resultados: RRHH ve el total, cada departamento y los comentarios; un responsable, solo su departamento. Cada
     * bloque solo se calcula si tiene al menos MINIMO envíos (si no, "suficientes": false y sin datos).
     */
    private Map<String, Object> resultados(int id) throws SQLException {
        Map<String, Object> e = filaEncuesta(id);
        if (!(Boolean) e.get("resultados")) throw new Api.Aviso("Solo RRHH y los responsables ven los resultados del pulso.");
        int minimo = (Integer) e.get("minimo");
        List<Map<String, Object>> qs = preguntas(id);
        // envío → (pregunta → valor | texto), y departamento de cada envío
        Map<String, Map<Integer, Object>> envios = new LinkedHashMap<>();
        Map<String, String> depto = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT ENVIO, PREGUNTA, DEPARTAMENTO, VALOR, TEXTO FROM ENCUESTA_RESPUESTA WHERE ENCUESTA = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int v = rs.getInt(4);
                    Object valor = rs.wasNull() ? rs.getString(5) : (Object) v;
                    envios.computeIfAbsent(rs.getString(1), k -> new HashMap<>()).put(rs.getInt(2), valor);
                    depto.put(rs.getString(1), rs.getString(3));
                }
            }
        }
        // Los envíos sin ninguna respuesta numérica (solo comentario) también cuentan como envío
        boolean todo = rrhh();
        Map<String, List<Map<Integer, Object>>> porDepto = new TreeMap<>();
        for (Map.Entry<String, Map<Integer, Object>> x : envios.entrySet()) {
            porDepto.computeIfAbsent(depto.get(x.getKey()) == null ? "—" : depto.get(x.getKey()), k -> new ArrayList<>()).add(x.getValue());
        }
        Map<String, Object> r = obj("encuesta", e, "preguntas", qs, "minimo", minimo);
        if (todo) {
            List<Map<Integer, Object>> lista = new ArrayList<>(envios.values());
            r.put("total", bloque(qs, lista, minimo, true));
            List<Map<String, Object>> deptos = new ArrayList<>();
            for (String d : departamentos()) {
                if (!incluyeDepartamento((String) e.get("ambito"), d)) continue;
                Map<String, Object> b = bloque(qs, porDepto.getOrDefault(d, List.of()), minimo, false);
                b.put("departamento", d);
                deptos.add(b);
            }
            ocultarPorDiferencia(deptos, envios.size(), minimo);
            r.put("departamentos", deptos);
        } else {
            Map<String, Object> b = bloque(qs, porDepto.getOrDefault(yo.departamento, List.of()), minimo, false);
            b.put("departamento", yo.departamento);
            r.put("departamentos", List.of(b));
        }
        return r;
    }

    /**
     * Anonimato por diferencia: con el total visible, los departamentos ocultos se podrían deducir restando los
     * visibles. Si lo que queda oculto suma entre 1 y MINIMO-1 respuestas, se oculta también el departamento visible
     * con menos respuestas, hasta que lo oculto sea 0 o al menos MINIMO.
     */
    static void ocultarPorDiferencia(List<Map<String, Object>> deptos, int total, int minimo) {
        while (true) {
            int visibles = 0;
            Map<String, Object> menor = null;
            for (Map<String, Object> b : deptos) {
                if (!(Boolean) b.get("suficientes")) continue;
                int n = (Integer) b.get("respuestas");
                visibles += n;
                if (menor == null || n < (Integer) menor.get("respuestas")) menor = b;
            }
            int ocultas = total - visibles;
            if (ocultas == 0 || ocultas >= minimo || menor == null) return;
            String d = (String) menor.get("departamento");
            menor.clear();
            menor.putAll(obj("respuestas", null, "suficientes", false, "departamento", d));
        }
    }

    /** Resultados de un conjunto de envíos: medias, distribución, eNPS y (con comentarios=true) los textos. */
    private static Map<String, Object> bloque(List<Map<String, Object>> qs, List<Map<Integer, Object>> envios, int minimo, boolean comentarios) {
        int n = envios.size();
        if (n < minimo) return obj("respuestas", null, "suficientes", false);
        List<Object> porPregunta = new ArrayList<>();
        for (Map<String, Object> q : qs) {
            int qid = (Integer) q.get("id");
            String tipo = (String) q.get("tipo");
            if ("TEXTO".equals(tipo)) {
                if (!comentarios) continue;
                List<String> textos = new ArrayList<>();
                for (Map<Integer, Object> en : envios) if (en.get(qid) instanceof String s) textos.add(s);
                Collections.shuffle(textos);   // sin el orden de llegada
                porPregunta.add(obj("id", qid, "tipo", tipo, "comentarios", textos));
                continue;
            }
            int max = "ENPS".equals(tipo) ? 10 : 5, min = "ENPS".equals(tipo) ? 0 : 1;
            int[] dist = new int[max + 1];
            int suma = 0, cuenta = 0, prom = 0, det = 0;
            for (Map<Integer, Object> en : envios) {
                if (!(en.get(qid) instanceof Integer v)) continue;
                dist[v]++;
                suma += v;
                cuenta++;
                if (v >= 9) prom++;
                if (v <= 6) det++;
            }
            List<Integer> d = new ArrayList<>();
            for (int i = min; i <= max; i++) d.add(dist[i]);
            Map<String, Object> m = obj("id", qid, "tipo", tipo, "respuestas", cuenta,
                    "media", cuenta == 0 ? null : Math.round(suma * 10.0 / cuenta) / 10.0, "distribucion", d);
            if ("ENPS".equals(tipo) && cuenta > 0) {
                m.put("enps", Math.round((prom - det) * 100.0 / cuenta));
                m.put("promotores", prom);
                m.put("pasivos", cuenta - prom - det);
                m.put("detractores", det);
            }
            porPregunta.add(m);
        }
        return obj("respuestas", n, "suficientes", true, "preguntas", porPregunta);
    }

    // ---------------------------------------------------------------- Ayudas

    private static String limpio(String s, int max) {
        if (s == null) return null;
        s = s.trim();
        if (s.length() > max) s = s.substring(0, max);
        return s.isEmpty() ? null : s;
    }

    private static boolean si(String s) {
        return s != null && (s.equalsIgnoreCase("true") || s.equals("1") || s.equalsIgnoreCase("si") || s.equalsIgnoreCase("sí"));
    }

    private static int clave(PreparedStatement ps) throws SQLException {
        try (ResultSet k = ps.getGeneratedKeys()) {
            k.next();
            return k.getInt(1);
        }
    }
}
