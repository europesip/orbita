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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
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
 * Encuestas (op=encuestas.*, y pulso.* por compatibilidad): encuestas de clima anónimas.
 *
 *  - RRHH las prepara (borrador, vista previa, plantillas, secciones, dimensiones, ocho tipos de pregunta), las abre al
 *    momento o las programa, envía recordatorios a quien no ha respondido y las cierra.
 *  - La plantilla responde de forma anónima: ENCUESTA_PARTICIPACION dice quién ha respondido (para no preguntar dos
 *    veces y para los recordatorios); ENCUESTA_RESPUESTA guarda las respuestas sin usuario ni hora, solo con un
 *    identificador aleatorio de envío y el departamento.
 *  - Informe: participación, índice de favorabilidad (respuestas 4-5 de las escalas), dimensiones, mapa de calor por
 *    departamento, eNPS, tendencia frente a la encuesta anterior de la misma serie, resultados por pregunta y
 *    comentarios. Un bloque (el total o un departamento) solo se muestra con al menos MINIMO respuestas, y un
 *    departamento se oculta también si se pudiera deducir restando los demás del total.
 *  - Plan de acción: lo que se hace con los resultados, visible para quien recibió la encuesta.
 *
 * Ven informes RRHH (todo) y los responsables (solo su departamento). Los comentarios, solo RRHH.
 */
final class Encuestas {

    static final List<String> TIPOS = Arrays.asList("ACUERDO", "ESCALA", "ENPS", "SINO", "UNICA", "MULTIPLE", "MATRIZ", "TEXTO");
    /** Tipos de 1 a 5 que cuentan para la favorabilidad (4 y 5 favorables, 3 neutral, 1 y 2 desfavorables). */
    static final List<String> ESCALAS = Arrays.asList("ACUERDO", "ESCALA", "MATRIZ");
    static final List<String> DIMENSIONES = Arrays.asList("COMPROMISO", "LIDERAZGO", "CARGA", "BIENESTAR", "RECONOCIMIENTO", "DESARROLLO",
            "COMUNICACION", "RECURSOS", "EQUIPO", "FLEXIBILIDAD");
    static final List<String> ESTADOS_ACCION = Arrays.asList("PENDIENTE", "EN_CURSO", "HECHA");
    static final int MINIMO_ANONIMATO = 3;
    static final int MAX_PREGUNTAS = 30, MAX_OPCIONES = 10;

    private final Api api;
    private final Connection c;
    private final Api.Emp yo;

    Encuestas(Api api, Connection c) {
        this.api = api;
        this.c = c;
        this.yo = api.yo();
    }

    Object ejecutar(String op, Map<String, String> p) throws SQLException {
        activarProgramadas();
        switch (op) {
            case "encuestas.lista": case "pulso.lista": return lista();
            case "encuestas.detalle": case "pulso.detalle": return detalle(Api.entero(p, "id"));
            case "encuestas.responder": case "pulso.responder": return responder(Api.entero(p, "id"), p.get("respuestas"));
            case "encuestas.informe": case "pulso.resultados": return informe(Api.entero(p, "id"));
            case "encuestas.guardar": return guardar(p);
            case "encuestas.publicar": return publicar(Api.entero(p, "id"), p.get("apertura"));
            case "encuestas.duplicar": return duplicar(Api.entero(p, "id"));
            case "encuestas.borrar": return borrar(Api.entero(p, "id"));
            case "encuestas.cerrar": return cerrar(Api.entero(p, "id"));
            case "encuestas.recordar": return recordar(Api.entero(p, "id"));
            case "encuestas.temas": return temasIa(Api.entero(p, "id"));
            case "encuestas.acciones": return acciones(p.get("encuesta"));
            case "encuestas.accion": return guardarAccion(p);
            case "encuestas.accionBorrar": return borrarAccion(Api.entero(p, "id"));
            default: throw new Api.Aviso("Operación desconocida: " + op);
        }
    }

    private boolean rrhh() {
        return "RRHH".equals(yo.rol);
    }

    private boolean responsable() {
        return "RESPONSABLE".equals(yo.rol);
    }

    private void soloRrhh(String que) {
        if (!rrhh()) throw new Api.Aviso("Solo RRHH puede " + que + ".");
    }

    // ---------------------------------------------------------------- Ámbito

    /** TODOS, DEPARTAMENTO:<nombre> o ROL:<rol>. */
    private String ambito(String a) {
        a = a == null || a.isBlank() ? "TODOS" : a.trim();
        if ("TODOS".equals(a)) return a;
        if (a.startsWith("DEPARTAMENTO:")) {
            for (Api.Emp e : api.plantilla()) if (a.substring(13).equals(e.departamento)) return a;
            throw new Api.Aviso("Ese departamento no existe.");
        }
        if (a.startsWith("ROL:") && Comunicacion.ROLES.contains(a.substring(4))) return a;
        throw new Api.Aviso("Destinatarios no válidos.");
    }

    private List<Api.Emp> destinatarios(String ambito) {
        List<Api.Emp> l = new ArrayList<>();
        for (Api.Emp e : api.plantilla()) if (Comunicacion.incluye(ambito, e)) l.add(e);
        return l;
    }

    private List<String> departamentos() {
        Set<String> s = new java.util.TreeSet<>();
        for (Api.Emp e : api.plantilla()) if (e.departamento != null) s.add(e.departamento);
        return new ArrayList<>(s);
    }

    private boolean incluyeDepartamento(String ambito, String departamento) {
        for (Api.Emp e : api.plantilla()) if (departamento != null && departamento.equals(e.departamento) && Comunicacion.incluye(ambito, e)) return true;
        return false;
    }

    // ---------------------------------------------------------------- Estados

    /** Abre las encuestas programadas cuya hora ha llegado y avisa a sus destinatarios (una sola vez). */
    private void activarProgramadas() throws SQLException {
        List<Object[]> abiertas = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("UPDATE ENCUESTA SET ESTADO = 'ABIERTA', ABIERTA = APERTURA WHERE ESTADO = 'PROGRAMADA'"
                + " AND APERTURA <= ? RETURNING ID, TITULO, AMBITO")) {
            ps.setTimestamp(1, Timestamp.valueOf(LocalDateTime.now()));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) abiertas.add(new Object[] {rs.getInt(1), rs.getString(2), rs.getString(3)});
            }
        }
        for (Object[] a : abiertas) avisarNueva((Integer) a[0], (String) a[1], (String) a[2]);
    }

    private void avisarNueva(int id, String titulo, String ambito) throws SQLException {
        for (Api.Emp e : destinatarios(ambito)) {
            Social.avisar(c, e.usuario, "encuestas", "ENCUESTA", id, "encuesta.nueva", obj("titulo", titulo),
                    "Nueva encuesta anónima: «" + titulo + "». Tu opinión cuenta.");
        }
    }

    /** Estado real: una ABIERTA cuya fecha de cierre ya pasó está CERRADA. */
    private static String estado(String estado, Date cierre) {
        if ("ABIERTA".equals(estado) && cierre != null && cierre.toLocalDate().isBefore(LocalDate.now())) return "CERRADA";
        return estado;
    }

    // ---------------------------------------------------------------- Lista y detalle

    /** Las encuestas que ve el usuario: las suyas, las de su departamento (responsables) y todas (RRHH). */
    List<Map<String, Object>> listaEncuestas() throws SQLException {
        Set<Integer> respondidas = new HashSet<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT ENCUESTA FROM ENCUESTA_PARTICIPACION WHERE USUARIO = ?")) {
            ps.setString(1, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) respondidas.add(rs.getInt(1));
            }
        }
        Map<Integer, Integer> participantes = contarPor("SELECT ENCUESTA, COUNT(*) FROM ENCUESTA_PARTICIPACION GROUP BY ENCUESTA");
        Map<Integer, Integer> acciones = contarPor("SELECT ENCUESTA, COUNT(*) FROM ENCUESTA_ACCION GROUP BY ENCUESTA");
        List<Map<String, Object>> l = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT E.*, (SELECT COUNT(*) FROM ENCUESTA_PREGUNTA P WHERE P.ENCUESTA = E.ID) AS PREGUNTAS"
                + " FROM ENCUESTA E ORDER BY COALESCE(E.ABIERTA, E.APERTURA, E.CREADA) DESC NULLS FIRST, E.ID DESC"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String ambito = rs.getString("AMBITO");
                String est = estado(rs.getString("ESTADO"), rs.getDate("CIERRE"));
                boolean publicada = "ABIERTA".equals(est) || "CERRADA".equals(est);
                boolean paraMi = publicada && Comunicacion.incluye(ambito, yo);
                boolean deMiDepartamento = responsable() && incluyeDepartamento(ambito, yo.departamento);
                if (!rrhh() && !(publicada && (paraMi || deMiDepartamento))) continue;
                int id = rs.getInt("ID");
                Api.Emp autor = api.emp(rs.getString("AUTOR"));
                Date cierre = rs.getDate("CIERRE");
                l.add(obj("id", id, "titulo", rs.getString("TITULO"), "descripcion", rs.getString("DESCRIPCION"), "gracias", rs.getString("GRACIAS"),
                        "ambito", ambito, "serie", rs.getString("SERIE"), "estado", est,
                        "apertura", ts(rs.getTimestamp("APERTURA")), "abierta", ts(rs.getTimestamp("ABIERTA")),
                        "cierre", cierre == null ? null : cierre.toString(), "minimo", rs.getInt("MINIMO"), "preguntas", rs.getInt("PREGUNTAS"),
                        "paraMi", paraMi, "respondida", respondidas.contains(id),
                        "participantes", participantes.getOrDefault(id, 0), "destinatarios", destinatarios(ambito).size(),
                        "informe", publicada && (rrhh() || deMiDepartamento), "acciones", acciones.getOrDefault(id, 0),
                        "autor", autor == null ? rs.getString("AUTOR") : autor.nombre, "recordada", ts(rs.getTimestamp("RECORDADA"))));
            }
        }
        return l;
    }

    private Map<Integer, Integer> contarPor(String sql) throws SQLException {
        Map<Integer, Integer> m = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) m.put(rs.getInt(1), rs.getInt(2));
        }
        return m;
    }

    private static String ts(Timestamp t) {
        return t == null ? null : t.toLocalDateTime().withNano(0).toString();
    }

    /** Encuestas abiertas dirigidas al usuario que aún no ha respondido (Mi intranet y Comunicación). */
    int pendientes() throws SQLException {
        activarProgramadas();
        int n = 0;
        for (Map<String, Object> e : listaEncuestas()) if ("ABIERTA".equals(e.get("estado")) && (Boolean) e.get("paraMi") && !(Boolean) e.get("respondida")) n++;
        return n;
    }

    private Map<String, Object> lista() throws SQLException {
        return obj("encuestas", listaEncuestas(), "rrhh", rrhh(), "responsable", responsable(), "departamentos", departamentos(),
                "minimo", MINIMO_ANONIMATO, "tipos", TIPOS, "dimensiones", DIMENSIONES, "maxPreguntas", MAX_PREGUNTAS);
    }

    private Map<String, Object> fila(int id) throws SQLException {
        for (Map<String, Object> e : listaEncuestas()) if (((Integer) e.get("id")) == id) return e;
        throw new Api.Aviso("La encuesta no existe o no va dirigida a ti.");
    }

    static List<Map<String, Object>> preguntas(Connection c, int encuesta) throws SQLException {
        List<Map<String, Object>> l = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM ENCUESTA_PREGUNTA WHERE ENCUESTA = ? ORDER BY ORDEN, ID")) {
            ps.setInt(1, encuesta);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    l.add(obj("id", rs.getInt("ID"), "tipo", rs.getString("TIPO"), "texto", rs.getString("TEXTO"), "dimension", rs.getString("DIMENSION"),
                            "seccion", rs.getString("SECCION"), "obligatoria", rs.getInt("OBLIGATORIA") == 1, "opciones", lista(rs.getString("OPCIONES"))));
                }
            }
        }
        return l;
    }

    private static List<String> lista(String json) {
        List<String> l = new ArrayList<>();
        if (json == null || json.isBlank()) return l;
        try (JsonReader r = jakarta.json.Json.createReader(new StringReader(json))) {
            for (JsonValue v : r.readArray()) if (v instanceof JsonString s) l.add(s.getString());
        }
        return l;
    }

    private Map<String, Object> detalle(int id) throws SQLException {
        Map<String, Object> e = fila(id);
        e.put("lista", preguntas(c, id));
        return e;
    }

    // ---------------------------------------------------------------- Responder

    private Map<String, Object> responder(int id, String json) throws SQLException {
        Map<String, Object> e = fila(id);
        if (!(Boolean) e.get("paraMi")) throw new Api.Aviso("Esta encuesta no va dirigida a ti.");
        if (!"ABIERTA".equals(e.get("estado"))) throw new Api.Aviso("La encuesta ya está cerrada.");
        if ((Boolean) e.get("respondida")) throw new Api.Aviso("Ya has respondido a esta encuesta.");
        JsonObject r;
        try (JsonReader jr = jakarta.json.Json.createReader(new StringReader(json == null ? "{}" : json))) {
            r = jr.readObject();
        } catch (RuntimeException ex) {
            throw new Api.Aviso("Respuestas no válidas.");
        }
        List<Object[]> filas = new ArrayList<>();   // pregunta, ítem, valor, texto
        for (Map<String, Object> q : preguntas(c, id)) {
            int qid = (Integer) q.get("id");
            String tipo = (String) q.get("tipo");
            boolean obligatoria = (Boolean) q.get("obligatoria");
            @SuppressWarnings("unchecked")
            List<String> opciones = (List<String>) q.get("opciones");
            JsonValue v = r.get(String.valueOf(qid));
            boolean vacia = v == null || v.getValueType() == JsonValue.ValueType.NULL;
            switch (tipo) {
                case "TEXTO": {
                    String t = v instanceof JsonString s ? Api.texto(s.getString().length() > 1000 ? s.getString().substring(0, 1000) : s.getString()) : null;
                    if (t == null && obligatoria) throw new Api.Aviso("Responde a todas las preguntas obligatorias.");
                    if (t != null) filas.add(new Object[] {qid, 0, null, t});
                    break;
                }
                case "MULTIPLE": {
                    Set<Integer> marcadas = new java.util.TreeSet<>();
                    if (v instanceof JsonArray a) for (JsonValue x : a) marcadas.add(numero(x, 0, opciones.size() - 1));
                    else if (!vacia) throw new Api.Aviso("Respuestas no válidas.");
                    if (marcadas.isEmpty() && obligatoria) throw new Api.Aviso("Responde a todas las preguntas obligatorias.");
                    for (int i : marcadas) filas.add(new Object[] {qid, i, 1, null});
                    break;
                }
                case "MATRIZ": {
                    Map<Integer, Integer> m = new TreeMap<>();
                    if (v instanceof JsonObject o) {
                        for (Map.Entry<String, JsonValue> x : o.entrySet()) {
                            int item;
                            try { item = Integer.parseInt(x.getKey()); } catch (NumberFormatException ex) { throw new Api.Aviso("Respuestas no válidas."); }
                            if (item < 0 || item >= opciones.size()) throw new Api.Aviso("Respuestas no válidas.");
                            if (x.getValue().getValueType() != JsonValue.ValueType.NULL) m.put(item, numero(x.getValue(), 1, 5));
                        }
                    } else if (!vacia) throw new Api.Aviso("Respuestas no válidas.");
                    if (obligatoria && m.size() < opciones.size()) throw new Api.Aviso("Responde a todas las preguntas obligatorias.");
                    for (Map.Entry<Integer, Integer> x : m.entrySet()) filas.add(new Object[] {qid, x.getKey(), x.getValue(), null});
                    break;
                }
                default: {
                    if (vacia) {
                        if (obligatoria) throw new Api.Aviso("Responde a todas las preguntas obligatorias.");
                        break;
                    }
                    int min = "ENPS".equals(tipo) || "SINO".equals(tipo) || "UNICA".equals(tipo) ? 0 : 1;
                    int max = "ENPS".equals(tipo) ? 10 : "SINO".equals(tipo) ? 1 : "UNICA".equals(tipo) ? opciones.size() - 1 : 5;
                    int n = v.getValueType() == JsonValue.ValueType.TRUE ? 1 : v.getValueType() == JsonValue.ValueType.FALSE ? 0 : numero(v, min, max);
                    filas.add(new Object[] {qid, 0, n, null});
                }
            }
        }
        guardarRespuestas(c, id, yo.usuario, yo.departamento, filas);
        Map<String, Object> res = detalle(id);
        res.put("mensaje", "Gracias: tus respuestas son anónimas.");
        return res;
    }

    private static int numero(JsonValue v, int min, int max) {
        Integer n = v instanceof JsonNumber num && num.isIntegral() ? Integer.valueOf(num.intValue())
                : v instanceof JsonString s && s.getString().matches("-?\\d{1,3}") ? Integer.valueOf(s.getString()) : null;
        if (n == null) throw new Api.Aviso("Respuestas no válidas.");
        if (n < min || n > max) throw new Api.Aviso("Respuesta fuera de escala.");
        return n;
    }

    /** Participación por un lado (quién) y respuestas por otro (qué, sin quién ni cuándo), en una transacción. */
    static void guardarRespuestas(Connection c, int encuesta, String usuario, String departamento, List<Object[]> filas) throws SQLException {
        boolean auto = c.getAutoCommit();
        c.setAutoCommit(false);
        try {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_PARTICIPACION (ENCUESTA, USUARIO) VALUES (?,?)")) {
                ps.setInt(1, encuesta);
                ps.setString(2, usuario);
                ps.executeUpdate();
            }
            String envio = UUID.randomUUID().toString();
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_RESPUESTA (ENVIO, ENCUESTA, PREGUNTA, ITEM, DEPARTAMENTO, VALOR, TEXTO)"
                    + " VALUES (?,?,?,?,?,?,?)")) {
                for (Object[] f : filas) {
                    ps.setString(1, envio);
                    ps.setInt(2, encuesta);
                    ps.setInt(3, (Integer) f[0]);
                    ps.setInt(4, (Integer) f[1]);
                    ps.setString(5, departamento);
                    if (f[2] == null) ps.setNull(6, java.sql.Types.SMALLINT); else ps.setInt(6, (Integer) f[2]);
                    ps.setString(7, (String) f[3]);
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            if (auto) c.commit();
        } catch (SQLException ex) {
            if (auto) c.rollback();
            if ("23505".equals(ex.getSQLState())) throw new Api.Aviso("Ya has respondido a esta encuesta.");
            throw ex;
        } finally {
            if (auto) c.setAutoCommit(true);
        }
    }

    // ---------------------------------------------------------------- Preparar (RRHH)

    /** Crea o actualiza un borrador (o una encuesta programada, que vuelve a borrador si se cambia). */
    private Map<String, Object> guardar(Map<String, String> p) throws SQLException {
        soloRrhh("preparar encuestas");
        String titulo = Api.texto(p.get("titulo"));
        if (titulo == null) throw new Api.Aviso("Escribe el título de la encuesta.");
        if (titulo.length() > 160) titulo = titulo.substring(0, 160);
        String descripcion = largo(p.get("descripcion"), 500), gracias = largo(p.get("gracias"), 500);
        String ambito = ambito(p.get("ambito"));
        String serie = Api.texto(p.get("serie"));
        serie = serie == null ? null : serie.toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z0-9_-]", "");
        if (serie != null && serie.length() > 40) serie = serie.substring(0, 40);
        int minimo = p.get("minimo") == null || p.get("minimo").isBlank() ? 5 : Api.entero(p, "minimo");
        if (minimo < MINIMO_ANONIMATO || minimo > 50) throw new Api.Aviso("El mínimo de respuestas para ver resultados va de 3 a 50.");
        LocalDate cierre = p.get("cierre") == null || p.get("cierre").isBlank() ? null : Api.fecha(p.get("cierre"));
        List<Object[]> qs = leerPreguntas(p.get("preguntas"));
        Integer id = p.get("id") == null || p.get("id").isBlank() ? null : Api.entero(p, "id");
        LocalDateTime ahora = LocalDateTime.now().withNano(0);
        if (id == null) {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA (TITULO, DESCRIPCION, AMBITO, MINIMO, ESTADO, AUTOR, CIERRE, SERIE, GRACIAS, CREADA)"
                    + " VALUES (?,?,?,?,'BORRADOR',?,?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, titulo);
                ps.setString(2, descripcion);
                ps.setString(3, ambito);
                ps.setInt(4, minimo);
                ps.setString(5, yo.usuario);
                ps.setDate(6, cierre == null ? null : Date.valueOf(cierre));
                ps.setString(7, serie);
                ps.setString(8, gracias);
                ps.setTimestamp(9, Timestamp.valueOf(ahora));
                ps.executeUpdate();
                try (ResultSet k = ps.getGeneratedKeys()) {
                    k.next();
                    id = k.getInt(1);
                }
            }
        } else {
            String est = estadoGuardado(id);
            if (!"BORRADOR".equals(est) && !"PROGRAMADA".equals(est)) throw new Api.Aviso("Una encuesta abierta o cerrada ya no se puede cambiar.");
            try (PreparedStatement ps = c.prepareStatement("UPDATE ENCUESTA SET TITULO = ?, DESCRIPCION = ?, AMBITO = ?, MINIMO = ?, CIERRE = ?,"
                    + " SERIE = ?, GRACIAS = ?, ESTADO = 'BORRADOR', APERTURA = NULL WHERE ID = ?")) {
                ps.setString(1, titulo);
                ps.setString(2, descripcion);
                ps.setString(3, ambito);
                ps.setInt(4, minimo);
                ps.setDate(5, cierre == null ? null : Date.valueOf(cierre));
                ps.setString(6, serie);
                ps.setString(7, gracias);
                ps.setInt(8, id);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM ENCUESTA_PREGUNTA WHERE ENCUESTA = ?")) {
                ps.setInt(1, id);
                ps.executeUpdate();
            }
        }
        insertarPreguntas(c, id, qs);
        Map<String, Object> r = detalle(id);
        r.put("mensaje", "Borrador guardado.");
        return r;
    }

    private String estadoGuardado(int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT ESTADO FROM ENCUESTA WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("La encuesta no existe o no va dirigida a ti.");
                return rs.getString(1);
            }
        }
    }

    private static String largo(String s, int max) {
        if (s == null) return null;
        s = s.trim();
        if (s.length() > max) s = s.substring(0, max);
        return s.isEmpty() ? null : s;
    }

    /** [tipo, texto, dimensión, sección, obligatoria, opciones JSON] de cada pregunta, validadas. */
    private static List<Object[]> leerPreguntas(String json) {
        JsonArray a;
        try (JsonReader r = jakarta.json.Json.createReader(new StringReader(json == null ? "[]" : json))) {
            a = r.readArray();
        } catch (RuntimeException e) {
            throw new Api.Aviso("Preguntas no válidas.");
        }
        if (a.size() > MAX_PREGUNTAS) throw new Api.Aviso("Como mucho " + MAX_PREGUNTAS + " preguntas: una encuesta larga se abandona.");
        List<Object[]> l = new ArrayList<>();
        int n = 0;
        for (JsonValue v : a) {
            n++;
            if (!(v instanceof JsonObject o)) throw new Api.Aviso("Preguntas no válidas.");
            String tipo = o.getString("tipo", "");
            if (!TIPOS.contains(tipo)) throw new Api.Aviso("Tipo de pregunta no válido.");
            String texto = Api.texto(o.getString("texto", ""));
            if (texto == null) throw new Api.Aviso("La pregunta " + n + " no tiene texto.");
            if (texto.length() > 400) texto = texto.substring(0, 400);
            String dim = o.containsKey("dimension") && !o.isNull("dimension") ? o.getString("dimension", "") : "";
            if (!dim.isEmpty() && !DIMENSIONES.contains(dim)) throw new Api.Aviso("Dimensión no válida.");
            String seccion = o.containsKey("seccion") && !o.isNull("seccion") ? largo(o.getString("seccion", ""), 120) : null;
            boolean obligatoria = o.containsKey("obligatoria") ? o.getBoolean("obligatoria", true) : !"TEXTO".equals(tipo);
            String opciones = null;
            if ("UNICA".equals(tipo) || "MULTIPLE".equals(tipo) || "MATRIZ".equals(tipo)) {
                List<String> ops = new ArrayList<>();
                if (o.get("opciones") instanceof JsonArray x) {
                    for (JsonValue y : x) {
                        if (y instanceof JsonString s && Api.texto(s.getString()) != null) {
                            String t = s.getString().trim();
                            ops.add(t.length() > 120 ? t.substring(0, 120) : t);
                        }
                    }
                }
                String que = "MATRIZ".equals(tipo) ? "afirmaciones" : "opciones";
                if (ops.size() < 2) throw new Api.Aviso("La pregunta " + n + " necesita al menos 2 " + que + ".");
                if (ops.size() > MAX_OPCIONES) throw new Api.Aviso("La pregunta " + n + " tiene más de " + MAX_OPCIONES + " " + que + ".");
                var b = jakarta.json.Json.createArrayBuilder();
                for (String s : ops) b.add(s);
                opciones = b.build().toString();
            }
            l.add(new Object[] {tipo, texto, dim.isEmpty() ? null : dim, seccion, obligatoria, opciones});
        }
        return l;
    }

    static void insertarPreguntas(Connection c, int encuesta, List<Object[]> qs) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_PREGUNTA (ENCUESTA, ORDEN, TIPO, TEXTO, DIMENSION, SECCION, OBLIGATORIA, OPCIONES)"
                + " VALUES (?,?,?,?,?,?,?,?)")) {
            for (int i = 0; i < qs.size(); i++) {
                Object[] q = qs.get(i);
                ps.setInt(1, encuesta);
                ps.setInt(2, i + 1);
                ps.setString(3, (String) q[0]);
                ps.setString(4, (String) q[1]);
                ps.setString(5, (String) q[2]);
                ps.setString(6, (String) q[3]);
                ps.setInt(7, (Boolean) q[4] ? 1 : 0);
                ps.setString(8, (String) q[5]);
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    /** Abre un borrador ya (apertura vacía) o lo programa para una fecha y hora futuras (AAAA-MM-DDTHH:MM). */
    private Map<String, Object> publicar(int id, String apertura) throws SQLException {
        soloRrhh("publicar encuestas");
        String est = estadoGuardado(id);
        if (!"BORRADOR".equals(est) && !"PROGRAMADA".equals(est)) throw new Api.Aviso("Esa encuesta ya está publicada.");
        Map<String, Object> e = fila(id);
        int preguntas = (Integer) e.get("preguntas");
        if (preguntas == 0) throw new Api.Aviso("Añade al menos una pregunta.");
        List<Api.Emp> dest = destinatarios((String) e.get("ambito"));
        if (dest.size() < (Integer) e.get("minimo")) throw new Api.Aviso("Hay menos destinatarios que el mínimo de respuestas: nunca se verían resultados.");
        LocalDateTime cuando = null;
        if (apertura != null && !apertura.isBlank()) {
            try {
                cuando = LocalDateTime.parse(apertura.length() == 16 ? apertura + ":00" : apertura);
            } catch (DateTimeParseException ex) {
                throw new Api.Aviso("Indica la apertura como fecha y hora.");
            }
            if (!cuando.isAfter(LocalDateTime.now())) cuando = null;
        }
        String cierre = (String) e.get("cierre");
        LocalDate inicio = cuando == null ? LocalDate.now() : cuando.toLocalDate();
        if (cierre != null && LocalDate.parse(cierre).isBefore(inicio)) throw new Api.Aviso("La fecha de cierre es anterior a la apertura.");
        String titulo = (String) e.get("titulo");
        if (cuando != null) {
            try (PreparedStatement ps = c.prepareStatement("UPDATE ENCUESTA SET ESTADO = 'PROGRAMADA', APERTURA = ? WHERE ID = ?")) {
                ps.setTimestamp(1, Timestamp.valueOf(cuando.withNano(0)));
                ps.setInt(2, id);
                ps.executeUpdate();
            }
            return obj("ok", true, "mensaje", "Encuesta programada para " + Api.corta(cuando.toLocalDate()) + " a las "
                    + String.format("%02d:%02d", cuando.getHour(), cuando.getMinute()) + ".");
        }
        try (PreparedStatement ps = c.prepareStatement("UPDATE ENCUESTA SET ESTADO = 'ABIERTA', ABIERTA = ?, APERTURA = NULL WHERE ID = ?")) {
            ps.setTimestamp(1, Timestamp.valueOf(LocalDateTime.now().withNano(0)));
            ps.setInt(2, id);
            ps.executeUpdate();
        }
        avisarNueva(id, titulo, (String) e.get("ambito"));
        return obj("ok", true, "mensaje", "Encuesta abierta para " + dest.size() + " personas.");
    }

    /** Copia una encuesta (cualquiera) como borrador nuevo: para repetir un pulso cada mes. */
    private Map<String, Object> duplicar(int id) throws SQLException {
        soloRrhh("preparar encuestas");
        Map<String, Object> e = fila(id);
        List<Object[]> qs = new ArrayList<>();
        for (Map<String, Object> q : preguntas(c, id)) {
            @SuppressWarnings("unchecked")
            List<String> ops = (List<String>) q.get("opciones");
            String opciones = null;
            if (!ops.isEmpty()) {
                var b = jakarta.json.Json.createArrayBuilder();
                for (String s : ops) b.add(s);
                opciones = b.build().toString();
            }
            qs.add(new Object[] {q.get("tipo"), q.get("texto"), q.get("dimension"), q.get("seccion"), q.get("obligatoria"), opciones});
        }
        int nuevo;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA (TITULO, DESCRIPCION, AMBITO, MINIMO, ESTADO, AUTOR, SERIE, GRACIAS, CREADA)"
                + " VALUES (?,?,?,?,'BORRADOR',?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            String t = "Copia de " + e.get("titulo");
            ps.setString(1, t.length() > 160 ? t.substring(0, 160) : t);
            ps.setString(2, (String) e.get("descripcion"));
            ps.setString(3, (String) e.get("ambito"));
            ps.setInt(4, (Integer) e.get("minimo"));
            ps.setString(5, yo.usuario);
            ps.setString(6, (String) e.get("serie"));
            ps.setString(7, (String) e.get("gracias"));
            ps.setTimestamp(8, Timestamp.valueOf(LocalDateTime.now().withNano(0)));
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                nuevo = k.getInt(1);
            }
        }
        insertarPreguntas(c, nuevo, qs);
        Map<String, Object> r = detalle(nuevo);
        r.put("mensaje", "Copia creada como borrador.");
        return r;
    }

    private Map<String, Object> borrar(int id) throws SQLException {
        soloRrhh("borrar encuestas");
        String est = estadoGuardado(id);
        if (!"BORRADOR".equals(est) && !"PROGRAMADA".equals(est)) throw new Api.Aviso("Solo se borran borradores y encuestas programadas: una publicada se cierra.");
        for (String sql : new String[] {"DELETE FROM ENCUESTA_PREGUNTA WHERE ENCUESTA = ?", "DELETE FROM ENCUESTA WHERE ID = ?"}) {
            try (PreparedStatement ps = c.prepareStatement(sql)) {
                ps.setInt(1, id);
                ps.executeUpdate();
            }
        }
        return obj("ok", true, "mensaje", "Encuesta borrada.");
    }

    private Map<String, Object> cerrar(int id) throws SQLException {
        soloRrhh("cerrar encuestas");
        Map<String, Object> e = fila(id);
        if (!"ABIERTA".equals(e.get("estado"))) throw new Api.Aviso("La encuesta no está abierta.");
        try (PreparedStatement ps = c.prepareStatement("UPDATE ENCUESTA SET ESTADO = 'CERRADA' WHERE ID = ?")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        }
        return obj("ok", true, "mensaje", "Encuesta cerrada.");
    }

    /** Recordatorio a quien aún no ha respondido (se sabe quién ha respondido, no qué). Como mucho uno al día. */
    private Map<String, Object> recordar(int id) throws SQLException {
        soloRrhh("enviar recordatorios");
        Map<String, Object> e = fila(id);
        if (!"ABIERTA".equals(e.get("estado"))) throw new Api.Aviso("La encuesta no está abierta.");
        String ultima = (String) e.get("recordada");
        if (ultima != null && LocalDateTime.parse(ultima).isAfter(LocalDateTime.now().minusHours(24))) {
            throw new Api.Aviso("Ya se envió un recordatorio en las últimas 24 horas.");
        }
        Set<String> ya = new HashSet<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO FROM ENCUESTA_PARTICIPACION WHERE ENCUESTA = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) ya.add(rs.getString(1));
            }
        }
        int n = 0;
        String titulo = (String) e.get("titulo");
        for (Api.Emp d : destinatarios((String) e.get("ambito"))) {
            if (ya.contains(d.usuario)) continue;
            Social.avisar(c, d.usuario, "encuestas", "ENCUESTA", id, "encuesta.recordatorio", obj("titulo", titulo),
                    "Recordatorio: «" + titulo + "» sigue abierta. Es anónima y son unos minutos.");
            n++;
        }
        if (n == 0) throw new Api.Aviso("Ya han respondido todos los destinatarios.");
        try (PreparedStatement ps = c.prepareStatement("UPDATE ENCUESTA SET RECORDADA = ? WHERE ID = ?")) {
            ps.setTimestamp(1, Timestamp.valueOf(LocalDateTime.now().withNano(0)));
            ps.setInt(2, id);
            ps.executeUpdate();
        }
        return obj("ok", true, "mensaje", "Recordatorio enviado a " + n + " personas.");
    }

    // ---------------------------------------------------------------- Informe

    /** Envíos de una encuesta: envío → (pregunta → (ítem → valor o texto)), y el departamento de cada envío. */
    private record Envios(Map<String, Map<Integer, Map<Integer, Object>>> datos, Map<String, String> departamento) {}

    private Envios envios(int id) throws SQLException {
        Map<String, Map<Integer, Map<Integer, Object>>> m = new LinkedHashMap<>();
        Map<String, String> dep = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT ENVIO, PREGUNTA, ITEM, DEPARTAMENTO, VALOR, TEXTO FROM ENCUESTA_RESPUESTA WHERE ENCUESTA = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int v = rs.getInt(5);
                    Object valor = rs.wasNull() ? rs.getString(6) : (Object) v;
                    m.computeIfAbsent(rs.getString(1), k -> new HashMap<>()).computeIfAbsent(rs.getInt(2), k -> new HashMap<>()).put(rs.getInt(3), valor);
                    dep.put(rs.getString(1), rs.getString(4));
                }
            }
        }
        return new Envios(m, dep);
    }

    private Map<String, Object> informe(int id) throws SQLException {
        Map<String, Object> e = fila(id);
        if (!(Boolean) e.get("informe")) throw new Api.Aviso("Solo RRHH y los responsables ven los resultados de las encuestas.");
        int minimo = (Integer) e.get("minimo");
        List<Map<String, Object>> qs = preguntas(c, id);
        Envios en = envios(id);
        Map<String, List<Map<Integer, Map<Integer, Object>>>> porDepto = new TreeMap<>();
        for (Map.Entry<String, Map<Integer, Map<Integer, Object>>> x : en.datos().entrySet()) {
            String d = en.departamento().get(x.getKey());
            porDepto.computeIfAbsent(d == null ? "—" : d, k -> new ArrayList<>()).add(x.getValue());
        }
        String ambito = (String) e.get("ambito");
        Map<String, Object> r = obj("encuesta", e, "preguntas", qs, "minimo", minimo, "rrhh", rrhh());
        // Participación por departamento: cuenta quién ha respondido, nunca qué
        Map<String, Integer> participaron = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO FROM ENCUESTA_PARTICIPACION WHERE ENCUESTA = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Api.Emp x = api.emp(rs.getString(1));
                    if (x != null && x.departamento != null) participaron.merge(x.departamento, 1, Integer::sum);
                }
            }
        }
        List<Object> participacion = new ArrayList<>();
        for (String d : departamentos()) {
            if (!incluyeDepartamento(ambito, d) || (!rrhh() && !d.equals(yo.departamento))) continue;
            int dest = 0;
            for (Api.Emp x : destinatarios(ambito)) if (d.equals(x.departamento)) dest++;
            participacion.add(obj("departamento", d, "participantes", participaron.getOrDefault(d, 0), "destinatarios", dest));
        }
        r.put("participacion", participacion);
        if (rrhh()) {
            Map<String, Object> total = bloque(qs, new ArrayList<>(en.datos().values()), minimo, true);
            r.put("total", total);
            List<Map<String, Object>> deptos = new ArrayList<>();
            for (String d : departamentos()) {
                if (!incluyeDepartamento(ambito, d)) continue;
                Map<String, Object> b = bloque(qs, porDepto.getOrDefault(d, List.of()), minimo, false);
                b.put("departamento", d);
                deptos.add(b);
            }
            ocultarPorDiferencia(deptos, en.datos().size(), minimo);
            r.put("departamentos", deptos);
            if ((Boolean) total.get("suficientes")) r.put("anterior", anterior(e, minimo));
        } else {
            Map<String, Object> b = bloque(qs, porDepto.getOrDefault(yo.departamento, List.of()), minimo, false);
            b.put("departamento", yo.departamento);
            r.put("departamentos", List.of(b));
        }
        r.put("iaDisponible", rrhh() && com.europesip.orbita.ia.Asistente.configurado());
        return r;
    }

    /** La encuesta anterior de la misma serie con resultados (índice, dimensiones y eNPS), para la tendencia. */
    private Map<String, Object> anterior(Map<String, Object> e, int minimo) throws SQLException {
        if (e.get("serie") == null || e.get("abierta") == null) return null;
        try (PreparedStatement ps = c.prepareStatement("SELECT ID, TITULO, MINIMO FROM ENCUESTA WHERE SERIE = ? AND ID <> ? AND ESTADO IN ('ABIERTA','CERRADA')"
                + " AND ABIERTA < ? ORDER BY ABIERTA DESC LIMIT 3")) {
            ps.setString(1, (String) e.get("serie"));
            ps.setInt(2, (Integer) e.get("id"));
            ps.setTimestamp(3, Timestamp.valueOf(LocalDateTime.parse((String) e.get("abierta"))));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int id = rs.getInt(1);
                    Map<String, Object> b = bloque(preguntas(c, id), new ArrayList<>(envios(id).datos().values()), Math.max(minimo, rs.getInt(3)), false);
                    if ((Boolean) b.get("suficientes")) {
                        return obj("id", id, "titulo", rs.getString(2), "indice", b.get("indice"), "enps", b.get("enps"), "dimensiones", b.get("dimensiones"));
                    }
                }
            }
        }
        return null;
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

    private static double pct(int n, int total) {
        return total == 0 ? 0 : Math.round(n * 1000.0 / total) / 10.0;
    }

    /** Favorables, neutrales y desfavorables de un conjunto de valores de 1 a 5. */
    private static Map<String, Object> reparto(int[] dist) {
        int total = 0, suma = 0;
        for (int v = 1; v <= 5; v++) {
            total += dist[v];
            suma += v * dist[v];
        }
        List<Integer> d = new ArrayList<>();
        for (int v = 1; v <= 5; v++) d.add(dist[v]);
        return obj("respuestas", total, "media", total == 0 ? null : Math.round(suma * 10.0 / total) / 10.0, "distribucion", d,
                "favorable", pct(dist[4] + dist[5], total), "neutral", pct(dist[3], total), "desfavorable", pct(dist[1] + dist[2], total));
    }

    /**
     * Resultados de un conjunto de envíos: por pregunta, por dimensión, índice de favorabilidad y eNPS; con
     * comentarios=true, también los textos (barajados) y sus palabras más repetidas.
     */
    static Map<String, Object> bloque(List<Map<String, Object>> qs, List<Map<Integer, Map<Integer, Object>>> envios, int minimo, boolean comentarios) {
        int n = envios.size();
        if (n < minimo) return obj("respuestas", n == 0 ? 0 : null, "suficientes", false);
        List<Object> porPregunta = new ArrayList<>();
        Map<String, int[]> dims = new LinkedHashMap<>();   // dimensión → [favorables, total]
        int[] global = new int[2];
        Integer enps = null;
        List<String> todosTextos = new ArrayList<>();
        for (Map<String, Object> q : qs) {
            int qid = (Integer) q.get("id");
            String tipo = (String) q.get("tipo");
            String dim = (String) q.get("dimension");
            @SuppressWarnings("unchecked")
            List<String> ops = (List<String>) q.get("opciones");
            Map<String, Object> m = obj("id", qid, "tipo", tipo);
            int[] fav = new int[2];
            switch (tipo) {
                case "TEXTO": {
                    if (!comentarios) continue;
                    List<String> textos = new ArrayList<>();
                    for (Map<Integer, Map<Integer, Object>> en : envios) {
                        Object v = en.getOrDefault(qid, Map.of()).get(0);
                        if (v instanceof String s) textos.add(s);
                    }
                    Collections.shuffle(textos);
                    todosTextos.addAll(textos);
                    m.put("respuestas", textos.size());
                    m.put("comentarios", textos);
                    break;
                }
                case "ACUERDO": case "ESCALA": {
                    int[] dist = new int[6];
                    for (Map<Integer, Map<Integer, Object>> en : envios) if (en.getOrDefault(qid, Map.of()).get(0) instanceof Integer v && v >= 1 && v <= 5) dist[v]++;
                    m.putAll(reparto(dist));
                    fav[0] = dist[4] + dist[5];
                    fav[1] = dist[1] + dist[2] + dist[3] + dist[4] + dist[5];
                    break;
                }
                case "MATRIZ": {
                    List<Object> items = new ArrayList<>();
                    for (int i = 0; i < ops.size(); i++) {
                        int[] dist = new int[6];
                        for (Map<Integer, Map<Integer, Object>> en : envios) if (en.getOrDefault(qid, Map.of()).get(i) instanceof Integer v && v >= 1 && v <= 5) dist[v]++;
                        Map<String, Object> it = reparto(dist);
                        it.put("item", i);
                        items.add(it);
                        fav[0] += dist[4] + dist[5];
                        fav[1] += dist[1] + dist[2] + dist[3] + dist[4] + dist[5];
                    }
                    m.put("items", items);
                    m.put("favorable", pct(fav[0], fav[1]));
                    int conRespuesta = 0;
                    for (Map<Integer, Map<Integer, Object>> en : envios) if (en.get(qid) != null && !en.get(qid).isEmpty()) conRespuesta++;
                    m.put("respuestas", conRespuesta);
                    break;
                }
                case "SINO": {
                    int si = 0, no = 0;
                    for (Map<Integer, Map<Integer, Object>> en : envios) {
                        Object v = en.getOrDefault(qid, Map.of()).get(0);
                        if (Integer.valueOf(1).equals(v)) si++; else if (Integer.valueOf(0).equals(v)) no++;
                    }
                    m.putAll(obj("respuestas", si + no, "si", si, "no", no, "favorable", pct(si, si + no)));
                    fav[0] = si;
                    fav[1] = si + no;
                    break;
                }
                case "UNICA": case "MULTIPLE": {
                    int[] cuenta = new int[ops.size()];
                    int conRespuesta = 0;
                    for (Map<Integer, Map<Integer, Object>> en : envios) {
                        Map<Integer, Object> x = en.get(qid);
                        if (x == null || x.isEmpty()) continue;
                        conRespuesta++;
                        if ("UNICA".equals(tipo)) {
                            if (x.get(0) instanceof Integer v && v >= 0 && v < cuenta.length) cuenta[v]++;
                        } else {
                            for (Integer i : x.keySet()) if (i >= 0 && i < cuenta.length) cuenta[i]++;
                        }
                    }
                    List<Object> l = new ArrayList<>();
                    for (int i = 0; i < cuenta.length; i++) l.add(obj("opcion", i, "votos", cuenta[i], "porcentaje", pct(cuenta[i], conRespuesta)));
                    m.put("respuestas", conRespuesta);
                    m.put("opciones", l);
                    break;
                }
                case "ENPS": {
                    int cuenta = 0, prom = 0, det = 0, suma = 0;
                    int[] dist = new int[11];
                    for (Map<Integer, Map<Integer, Object>> en : envios) {
                        if (!(en.getOrDefault(qid, Map.of()).get(0) instanceof Integer v) || v < 0 || v > 10) continue;
                        dist[v]++;
                        cuenta++;
                        suma += v;
                        if (v >= 9) prom++;
                        if (v <= 6) det++;
                    }
                    List<Integer> d = new ArrayList<>();
                    for (int v : dist) d.add(v);
                    m.putAll(obj("respuestas", cuenta, "distribucion", d, "media", cuenta == 0 ? null : Math.round(suma * 10.0 / cuenta) / 10.0));
                    if (cuenta > 0) {
                        int valor = (int) Math.round((prom - det) * 100.0 / cuenta);
                        m.putAll(obj("enps", valor, "promotores", prom, "pasivos", cuenta - prom - det, "detractores", det));
                        if (enps == null) enps = valor;
                    }
                    break;
                }
                default:
                    break;
            }
            if (fav[1] > 0) {
                global[0] += fav[0];
                global[1] += fav[1];
                if (dim != null) {
                    int[] d = dims.computeIfAbsent(dim, k -> new int[2]);
                    d[0] += fav[0];
                    d[1] += fav[1];
                }
            }
            porPregunta.add(m);
        }
        Map<String, Object> dimensiones = new LinkedHashMap<>();
        for (Map.Entry<String, int[]> d : dims.entrySet()) dimensiones.put(d.getKey(), pct(d.getValue()[0], d.getValue()[1]));
        Map<String, Object> r = obj("respuestas", n, "suficientes", true, "preguntas", porPregunta, "dimensiones", dimensiones,
                "indice", global[1] == 0 ? null : pct(global[0], global[1]), "enps", enps);
        if (comentarios) r.put("temas", temas(todosTextos));
        return r;
    }

    private static final Set<String> VACIAS = new HashSet<>(Arrays.asList("para", "pero", "como", "porque", "cuando", "donde", "mucho", "muchas",
            "muchos", "mucha", "este", "esta", "estos", "estas", "esto", "todo", "toda", "todos", "todas", "sobre", "entre", "tambien", "solo", "cada",
            "hace", "hacer", "tiene", "tienen", "tengo", "tenemos", "sería", "seria", "estar", "estoy", "están", "estan", "algo", "nada", "menos", "bien",
            "desde", "hasta", "nuestro", "nuestra", "nuestros", "nuestras", "otra", "otro", "otras", "otros", "puede", "pueden", "debería", "deberia",
            "más", "mas", "veces", "vez", "poco", "parte", "creo", "gustaria", "gustaría", "with", "that", "this", "have", "from", "there"));

    /** Palabras que más se repiten en los comentarios (en cuántos comentarios aparece cada una). */
    static List<Object> temas(List<String> textos) {
        Map<String, Integer> cuenta = new HashMap<>();
        for (String t : textos) {
            Set<String> vistas = new HashSet<>();
            for (String w : Directorio.plano(t).split("[^a-z0-9ñ]+")) {
                if (w.length() < 4 || VACIAS.contains(w)) continue;
                if (vistas.add(w)) cuenta.merge(w, 1, Integer::sum);
            }
        }
        List<Map.Entry<String, Integer>> l = new ArrayList<>(cuenta.entrySet());
        l.removeIf(x -> x.getValue() < 2);
        l.sort((a, b) -> b.getValue() - a.getValue() != 0 ? b.getValue() - a.getValue() : a.getKey().compareTo(b.getKey()));
        List<Object> r = new ArrayList<>();
        for (int i = 0; i < Math.min(10, l.size()); i++) r.add(obj("palabra", l.get(i).getKey(), "comentarios", l.get(i).getValue()));
        return r;
    }

    /** Resumen de los comentarios con el modelo de IA de ÓRBITA (solo RRHH; solo los textos, que ya son anónimos). */
    private Map<String, Object> temasIa(int id) throws SQLException {
        soloRrhh("resumir los comentarios");
        Map<String, Object> inf = informe(id);
        @SuppressWarnings("unchecked")
        Map<String, Object> total = (Map<String, Object>) inf.get("total");
        if (total == null || !(Boolean) total.get("suficientes")) throw new Api.Aviso("Aún no hay suficientes respuestas para mostrar resultados.");
        StringBuilder b = new StringBuilder();
        int n = 0;
        for (Object o : (List<?>) total.get("preguntas")) {
            Map<?, ?> q = (Map<?, ?>) o;
            if (!"TEXTO".equals(q.get("tipo"))) continue;
            for (Object t : (List<?>) q.get("comentarios")) {
                b.append("- ").append(t).append('\n');
                n++;
            }
        }
        if (n < 3) throw new Api.Aviso("Hacen falta al menos 3 comentarios para resumirlos.");
        if (!com.europesip.orbita.ia.Asistente.configurado()) throw new Api.Aviso("El asistente de ÓRBITA no está configurado (assistant.* en el chart).");
        String resumen;
        try {
            resumen = com.europesip.orbita.ia.Asistente.completar(
                "Eres analista de clima laboral. Resume en español los comentarios ANÓNIMOS de una encuesta interna: de 3 a 5 temas, "
                        + "cada uno con una línea que empiece por «- », su tono (positivo, negativo o mixto) y cuántos comentarios lo mencionan "
                        + "aproximadamente. Después, una línea «Sugerencia:» con una acción concreta. No cites frases literales largas ni intentes "
                        + "adivinar quién ha escrito nada.",
                "Encuesta: " + ((Map<?, ?>) inf.get("encuesta")).get("titulo") + "\nComentarios (" + n + "):\n" + b);
        } catch (com.europesip.orbita.ia.Asistente.Fallo f) {
            throw new Api.Aviso(f.getMessage());
        }
        return obj("resumen", resumen, "comentarios", n);
    }

    // ---------------------------------------------------------------- Plan de acción

    private Map<String, Object> accionJson(ResultSet rs) throws SQLException {
        Api.Emp resp = api.emp(rs.getString("RESPONSABLE")), autor = api.emp(rs.getString("AUTOR"));
        Date lim = rs.getDate("LIMITE");
        boolean editar = rrhh() || yo.usuario.equals(rs.getString("AUTOR")) || yo.usuario.equals(rs.getString("RESPONSABLE"));
        return obj("id", rs.getInt("ID"), "encuesta", rs.getInt("ENCUESTA"), "encuestaTitulo", rs.getString("ETITULO"), "dimension", rs.getString("DIMENSION"),
                "departamento", rs.getString("DEPARTAMENTO"), "titulo", rs.getString("TITULO"), "descripcion", rs.getString("DESCRIPCION"),
                "responsable", resp == null ? null : obj("usuario", resp.usuario, "nombre", resp.nombre), "limite", lim == null ? null : lim.toString(),
                "estado", rs.getString("ESTADO"), "autor", autor == null ? rs.getString("AUTOR") : autor.nombre,
                "actualizado", ts(rs.getTimestamp("ACTUALIZADO")), "editar", editar);
    }

    /** Acciones visibles: las de las encuestas que el usuario recibió o gestiona (las de un departamento, solo para él). */
    private Map<String, Object> acciones(String encuesta) throws SQLException {
        Map<Integer, Map<String, Object>> visibles = new HashMap<>();
        for (Map<String, Object> e : listaEncuestas()) visibles.put((Integer) e.get("id"), e);
        List<Object> l = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT A.*, E.TITULO AS ETITULO FROM ENCUESTA_ACCION A JOIN ENCUESTA E ON E.ID = A.ENCUESTA"
                + " ORDER BY CASE A.ESTADO WHEN 'EN_CURSO' THEN 0 WHEN 'PENDIENTE' THEN 1 ELSE 2 END, A.LIMITE NULLS LAST, A.ID")) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> e = visibles.get(rs.getInt("ENCUESTA"));
                    if (e == null) continue;
                    if (encuesta != null && !encuesta.isBlank() && !encuesta.equals(String.valueOf(rs.getInt("ENCUESTA")))) continue;
                    String d = rs.getString("DEPARTAMENTO");
                    if (d != null && !rrhh() && !d.equals(yo.departamento)) continue;
                    l.add(accionJson(rs));
                }
            }
        }
        // Encuestas para las que el usuario puede crear acciones: RRHH, todas las publicadas; un responsable, las de su departamento
        List<Object> paraCrear = new ArrayList<>();
        for (Map<String, Object> e : visibles.values()) {
            if ((Boolean) e.get("informe")) paraCrear.add(obj("id", e.get("id"), "titulo", e.get("titulo")));
        }
        return obj("acciones", l, "puedeCrear", rrhh() || responsable(), "encuestas", paraCrear, "rrhh", rrhh(), "departamento", yo.departamento,
                "dimensiones", DIMENSIONES);
    }

    private Map<String, Object> guardarAccion(Map<String, String> p) throws SQLException {
        if (!rrhh() && !responsable()) throw new Api.Aviso("Solo RRHH y los responsables preparan el plan de acción.");
        Integer id = p.get("id") == null || p.get("id").isBlank() ? null : Api.entero(p, "id");
        LocalDateTime ahora = LocalDateTime.now().withNano(0);
        if (id != null) {
            // Cambio de estado (o edición) de una acción existente
            String autor, responsableActual;
            try (PreparedStatement ps = c.prepareStatement("SELECT AUTOR, RESPONSABLE FROM ENCUESTA_ACCION WHERE ID = ?")) {
                ps.setInt(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) throw new Api.Aviso("La acción ya no existe.");
                    autor = rs.getString(1);
                    responsableActual = rs.getString(2);
                }
            }
            if (!rrhh() && !yo.usuario.equals(autor) && !yo.usuario.equals(responsableActual)) throw new Api.Aviso("Solo quien la creó, quien la lleva o RRHH pueden cambiarla.");
        }
        int encuesta = Api.entero(p, "encuesta");
        Map<String, Object> e = fila(encuesta);
        if (!(Boolean) e.get("informe")) throw new Api.Aviso("Solo RRHH y los responsables preparan el plan de acción.");
        String titulo = Api.texto(p.get("titulo"));
        if (titulo == null) throw new Api.Aviso("Escribe qué se va a hacer.");
        if (titulo.length() > 160) titulo = titulo.substring(0, 160);
        String dim = p.get("dimension") == null || p.get("dimension").isBlank() ? null : p.get("dimension");
        if (dim != null && !DIMENSIONES.contains(dim)) throw new Api.Aviso("Dimensión no válida.");
        String depto = p.get("departamento") == null || p.get("departamento").isBlank() ? null : p.get("departamento");
        if (!rrhh()) depto = yo.departamento;   // un responsable actúa sobre su departamento
        else if (depto != null && !departamentos().contains(depto)) throw new Api.Aviso("Ese departamento no existe.");
        String resp = p.get("responsable") == null || p.get("responsable").isBlank() ? yo.usuario : p.get("responsable");
        if (api.emp(resp) == null) throw new Api.Aviso("La persona responsable no está en el directorio.");
        String estado = p.get("estado") == null || p.get("estado").isBlank() ? "PENDIENTE" : p.get("estado");
        if (!ESTADOS_ACCION.contains(estado)) throw new Api.Aviso("Estado no válido.");
        LocalDate limite = p.get("limite") == null || p.get("limite").isBlank() ? null : Api.fecha(p.get("limite"));
        String desc = largo(p.get("descripcion"), 1000);
        if (id == null) {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_ACCION (ENCUESTA, DIMENSION, DEPARTAMENTO, TITULO, DESCRIPCION, RESPONSABLE,"
                    + " LIMITE, ESTADO, AUTOR, CREADO, ACTUALIZADO) VALUES (?,?,?,?,?,?,?,?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
                ps.setInt(1, encuesta);
                ps.setString(2, dim);
                ps.setString(3, depto);
                ps.setString(4, titulo);
                ps.setString(5, desc);
                ps.setString(6, resp);
                ps.setDate(7, limite == null ? null : Date.valueOf(limite));
                ps.setString(8, estado);
                ps.setString(9, yo.usuario);
                ps.setTimestamp(10, Timestamp.valueOf(ahora));
                ps.setTimestamp(11, Timestamp.valueOf(ahora));
                ps.executeUpdate();
                try (ResultSet k = ps.getGeneratedKeys()) {
                    k.next();
                    id = k.getInt(1);
                }
            }
            if (!resp.equals(yo.usuario)) {
                Social.avisar(c, resp, "encuestas", "ACCION", id, "encuesta.accion", obj("quien", yo.nombre, "titulo", titulo),
                        yo.nombre + " te ha asignado una acción del plan: «" + titulo + "».");
            }
            return obj("ok", true, "id", id, "mensaje", "Acción añadida al plan.");
        }
        try (PreparedStatement ps = c.prepareStatement("UPDATE ENCUESTA_ACCION SET DIMENSION = ?, DEPARTAMENTO = ?, TITULO = ?, DESCRIPCION = ?, RESPONSABLE = ?,"
                + " LIMITE = ?, ESTADO = ?, ACTUALIZADO = ? WHERE ID = ?")) {
            ps.setString(1, dim);
            ps.setString(2, depto);
            ps.setString(3, titulo);
            ps.setString(4, desc);
            ps.setString(5, resp);
            ps.setDate(6, limite == null ? null : Date.valueOf(limite));
            ps.setString(7, estado);
            ps.setTimestamp(8, Timestamp.valueOf(ahora));
            ps.setInt(9, id);
            ps.executeUpdate();
        }
        return obj("ok", true, "id", id, "mensaje", "Acción actualizada.");
    }

    private Map<String, Object> borrarAccion(int id) throws SQLException {
        String autor;
        try (PreparedStatement ps = c.prepareStatement("SELECT AUTOR FROM ENCUESTA_ACCION WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("La acción ya no existe.");
                autor = rs.getString(1);
            }
        }
        if (!rrhh() && !yo.usuario.equals(autor)) throw new Api.Aviso("Solo quien la creó o RRHH pueden quitarla.");
        try (PreparedStatement ps = c.prepareStatement("DELETE FROM ENCUESTA_ACCION WHERE ID = ?")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        }
        return obj("ok", true, "mensaje", "Acción quitada del plan.");
    }
}
