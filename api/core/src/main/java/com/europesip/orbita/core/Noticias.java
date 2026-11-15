package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.awt.image.BufferedImage;
import java.io.StringReader;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

/**
 * Portada y noticias (op=noticias.* y portada.resumen).
 *
 * Las noticias publicadas son contenido de HCL DX WCM (biblioteca «ÓRBITA Noticias», que crea el chart): la portada
 * las lee directamente de WCM con la sesión de cada persona. ÓRBITA guarda solo lo que WCM no puede hacer por sí mismo
 * con la API (los usuarios no pueden mover contenido por el flujo de trabajo de WCM con la API REST en CF238):
 *
 *  - Propuestas: cualquier persona escribe una noticia a partir de una plantilla de autor de WCM y la envía a revisión.
 *    Estados: BORRADOR → REVISION → PUBLICADA, o DEVUELTA (vuelve a la autora para cambiarla) o RECHAZADA.
 *  - Revisión (RRHH): la publica, la devuelve con un comentario o la rechaza. Al publicarla, el navegador de quien revisa
 *    crea el contenido en WCM con sus propios permisos de WCM y aquí se guarda su id (noticias.publicada).
 *  - Imágenes de las noticias: se vuelven a dibujar (JPEG, como mucho 1600 px de ancho, sin metadatos) y las sirve
 *    GET /v1/noticias/imagenes/{id} de orbita-rest; la noticia de WCM guarda esa dirección.
 *  - portada.resumen: lo que la portada muestra además de las noticias (comunicados, encuestas, celebraciones,
 *    reconocimientos, festivos y mis propuestas).
 *
 * Campos de una propuesta (JSON): {nombre del elemento de la plantilla: {"tipo": ..., "valor": ...}} con tipo
 * texto (texto plano, como mucho 1000), largo (texto plano, como mucho 4000), rico (HTML limpio con Html), imagen
 * (dirección de una imagen de noticias), fecha (aaaa-mm-ddThh:mm), enlace (http, https o ruta del portal) o diseno
 * (clasico, portada, columnas, cartel o cita; otro valor se guarda como clasico).
 */
final class Noticias {

    static final String IMAGENES = "/orbita-api/v1/noticias/imagenes/";
    private static final Set<String> ESTADOS = Set.of("BORRADOR", "REVISION", "DEVUELTA", "PUBLICADA", "RECHAZADA");
    /** Diseños de una noticia (cómo la muestra la portada). */
    /** Diseños de la portada entera (los elige RRHH para la empresa y cada persona para sí). */
    static final Set<String> PORTADAS = Set.of("clasica", "revista", "mosaico", "carrusel", "cronologia", "titulares", "tablero", "muro", "nocturna", "foco", "orbita", "neon", "historias", "constelacion", "anillo", "burbujas");
    static final Set<String> DISENOS = Set.of("clasico", "portada", "columnas", "cartel", "cita", "revista", "cine", "titular", "diagonal", "cuenta", "celebracion");
    private static final Pattern NOMBRE = Pattern.compile("[A-Za-z][A-Za-z0-9_-]{0,79}");
    private static final Pattern UUID = Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final int MAX_IMAGEN = 10 * 1024 * 1024, ANCHO = 1600;

    /** Imagen de una noticia para servirla tal cual. */
    record Imagen(String tipo, byte[] datos) {}

    private final Api api;
    private final Connection c;
    private final Api.Emp yo;

    Noticias(Api api, Connection c) {
        this.api = api;
        this.c = c;
        this.yo = api.yo();
    }

    Object ejecutar(String op, Map<String, String> p) throws SQLException {
        switch (op) {
            case "portada.resumen": return portada();
            case "portada.diseno": return fijarPortada(p.get("diseno"), p.get("ambito"));
            case "noticias.propuestas": return propuestas(p.get("ambito"));
            case "noticias.propuesta": return obj("propuesta", json(cargar(Api.entero(p, "id")), true));
            case "noticias.guardar": return guardar(p);
            case "noticias.enviar": return enviar(Api.entero(p, "id"));
            case "noticias.devolver": return revisar(Api.entero(p, "id"), "DEVUELTA", p.get("comentario"));
            case "noticias.rechazar": return revisar(Api.entero(p, "id"), "RECHAZADA", p.get("comentario"));
            case "noticias.publicada": return publicada(Api.entero(p, "id"), p.get("wcmId"));
            case "noticias.borrar": return borrar(Api.entero(p, "id"));
            case "noticias.imagen": return subirImagen(p.get("datos"));
            default: throw new Api.Aviso("Operación desconocida: " + op);
        }
    }

    private boolean rrhh() {
        return "RRHH".equals(yo.rol);
    }

    // ---------------------------------------------------------------- Portada

    @SuppressWarnings("unchecked")
    private Map<String, Object> portada() throws SQLException {
        Comunicacion com = new Comunicacion(api, c);
        Directorio dir = new Directorio(api, c);
        Map<String, Object> rec = (Map<String, Object>) dir.ejecutar("reconocimientos.lista", new LinkedHashMap<>());
        List<Object> recs = (List<Object>) rec.getOrDefault("reconocimientos", List.of());
        Map<String, Object> cel = (Map<String, Object>) dir.ejecutar("personas.celebraciones", new LinkedHashMap<>());
        List<Object> festivos = new ArrayList<>();
        LocalDate hoy = LocalDate.now();
        for (Map.Entry<LocalDate, String> f : api.festivos().entrySet()) {
            if (!f.getKey().isBefore(hoy) && festivos.size() < 3) festivos.add(obj("fecha", f.getKey().toString(), "nombre", f.getValue()));
        }
        Map<String, Object> mias = new LinkedHashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT ESTADO, COUNT(*) FROM NOTICIA_PROPUESTA WHERE AUTOR = ? GROUP BY ESTADO")) {
            ps.setString(1, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) mias.put(rs.getString(1), rs.getInt(2));
            }
        }
        return obj("comunicacion", com.resumen(), "comunicados", com.ultimos(4),
                "celebraciones", cel.get("celebraciones"), "reconocimientos", recs.subList(0, Math.min(3, recs.size())),
                "festivos", festivos, "propuestas", mias, "porRevisar", rrhh() ? contar("REVISION") : null, "rrhh", rrhh(),
                "diseno", obj("empresa", ajuste("*", "portada.diseno"), "mio", ajuste(yo.usuario, "portada.diseno")));
    }

    private String ajuste(String usuario, String clave) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT VALOR FROM AJUSTE WHERE USUARIO = ? AND CLAVE = ?")) {
            ps.setString(1, usuario);
            ps.setString(2, clave);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString(1) : null;
            }
        }
    }

    /** Diseño de la portada: ambito mio (por defecto; vacío = volver al de la empresa) o empresa (solo RRHH). */
    private Map<String, Object> fijarPortada(String diseno, String ambito) throws SQLException {
        boolean empresa = "empresa".equals(ambito);
        if (empresa && !rrhh()) throw new Api.Aviso("Solo RRHH elige el diseño de la portada para toda la empresa.");
        String usuario = empresa ? "*" : yo.usuario;
        String d = diseno == null ? "" : diseno.trim();
        if (d.isEmpty()) {
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM AJUSTE WHERE USUARIO = ? AND CLAVE = 'portada.diseno'")) {
                ps.setString(1, usuario);
                ps.executeUpdate();
            }
        } else {
            if (!PORTADAS.contains(d)) throw new Api.Aviso("Ese diseño de portada no existe.");
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO AJUSTE (USUARIO, CLAVE, VALOR, CAMBIADO, CAMBIADO_POR) VALUES (?, 'portada.diseno', ?, ?, ?)"
                    + " ON CONFLICT (USUARIO, CLAVE) DO UPDATE SET VALOR = EXCLUDED.VALOR, CAMBIADO = EXCLUDED.CAMBIADO, CAMBIADO_POR = EXCLUDED.CAMBIADO_POR")) {
                ps.setString(1, usuario);
                ps.setString(2, d);
                ps.setTimestamp(3, Timestamp.valueOf(LocalDateTime.now()));
                ps.setString(4, yo.usuario);
                ps.executeUpdate();
            }
        }
        return obj("diseno", obj("empresa", ajuste("*", "portada.diseno"), "mio", ajuste(yo.usuario, "portada.diseno")),
                "mensaje", empresa ? "Diseño de la portada guardado para toda la empresa." : d.isEmpty() ? "Vuelves a ver el diseño de la empresa." : "Diseño de la portada guardado para ti.");
    }

    private int contar(String estado) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM NOTICIA_PROPUESTA WHERE ESTADO = ?")) {
            ps.setString(1, estado);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    // ---------------------------------------------------------------- Propuestas

    /** mias (por defecto): las mías. revision (RRHH): las enviadas y las revisadas en los últimos 60 días. */
    private Map<String, Object> propuestas(String ambito) throws SQLException {
        boolean revision = "revision".equals(ambito);
        if (revision && !rrhh()) throw new Api.Aviso("Solo RRHH revisa las propuestas de noticias.");
        String sql = revision
                ? "SELECT * FROM NOTICIA_PROPUESTA WHERE ESTADO = 'REVISION' OR (ESTADO IN ('PUBLICADA','DEVUELTA','RECHAZADA') AND ENVIADA IS NOT NULL"
                        + " AND ACTUALIZADA >= ?) ORDER BY CASE WHEN ESTADO = 'REVISION' THEN 0 ELSE 1 END, ACTUALIZADA DESC, ID DESC"
                : "SELECT * FROM NOTICIA_PROPUESTA WHERE AUTOR = ? ORDER BY ACTUALIZADA DESC, ID DESC";
        List<Object> l = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            if (revision) ps.setTimestamp(1, Timestamp.valueOf(LocalDateTime.now().minusDays(60)));
            else ps.setString(1, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) l.add(json(fila(rs), false));
            }
        }
        return obj("propuestas", l);
    }

    private static final class Fila {
        int id;
        String autor, plantilla, seccion, titulo, campos, estado, comentario, revisor, wcmId;
        Timestamp creada, actualizada, enviada, publicada;
    }

    private static Fila fila(ResultSet rs) throws SQLException {
        Fila f = new Fila();
        f.id = rs.getInt("ID");
        f.autor = rs.getString("AUTOR");
        f.plantilla = rs.getString("PLANTILLA");
        f.seccion = rs.getString("SECCION");
        f.titulo = rs.getString("TITULO");
        f.campos = rs.getString("CAMPOS");
        f.estado = rs.getString("ESTADO");
        f.comentario = rs.getString("COMENTARIO");
        f.revisor = rs.getString("REVISOR");
        f.wcmId = rs.getString("WCM_ID");
        f.creada = rs.getTimestamp("CREADA");
        f.actualizada = rs.getTimestamp("ACTUALIZADA");
        f.enviada = rs.getTimestamp("ENVIADA");
        f.publicada = rs.getTimestamp("PUBLICADA");
        return f;
    }

    private Fila cargar(int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM NOTICIA_PROPUESTA WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("Esa propuesta ya no existe.");
                Fila f = fila(rs);
                if (!f.autor.equals(yo.usuario) && !(rrhh() && f.enviada != null)) throw new Api.Aviso("Esa propuesta ya no existe.");
                return f;
            }
        }
    }

    private Map<String, Object> json(Fila f, boolean completa) {
        Api.Emp a = api.emp(f.autor), r = f.revisor == null ? null : api.emp(f.revisor);
        Map<String, Object> m = obj("id", f.id, "autor", obj("usuario", f.autor, "nombre", a == null ? f.autor : a.nombre),
                "plantilla", f.plantilla, "seccion", f.seccion, "titulo", f.titulo, "estado", f.estado, "comentario", f.comentario,
                "revisor", r == null ? f.revisor : r.nombre, "wcmId", f.wcmId, "creada", iso(f.creada), "actualizada", iso(f.actualizada),
                "enviada", iso(f.enviada), "publicada", iso(f.publicada), "mia", f.autor.equals(yo.usuario),
                "editable", editable(f));
        Map<String, Object> campos = leerCampos(f.campos);
        if (completa) {
            m.put("campos", campos);
        } else {
            m.put("entradilla", resumen(campos));
            m.put("imagen", imagenDe(campos));
        }
        return m;
    }

    private boolean editable(Fila f) {
        if (f.autor.equals(yo.usuario) && ("BORRADOR".equals(f.estado) || "DEVUELTA".equals(f.estado))) return true;
        return rrhh() && "REVISION".equals(f.estado);
    }

    private static String iso(Timestamp t) {
        return t == null ? null : t.toLocalDateTime().withNano(0).toString();
    }

    @SuppressWarnings("unchecked")
    private static String resumen(Map<String, Object> campos) {
        for (Object v : campos.values()) {
            Map<String, Object> x = (Map<String, Object>) v;
            if ("texto".equals(x.get("tipo")) || "largo".equals(x.get("tipo"))) {
                String s = String.valueOf(x.get("valor"));
                if (!s.isBlank()) return s.length() > 200 ? s.substring(0, 199) + "…" : s;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static String imagenDe(Map<String, Object> campos) {
        for (Object v : campos.values()) {
            Map<String, Object> x = (Map<String, Object>) v;
            if ("imagen".equals(x.get("tipo")) && x.get("valor") != null && !String.valueOf(x.get("valor")).isBlank()) return String.valueOf(x.get("valor"));
        }
        return null;
    }

    private Map<String, Object> guardar(Map<String, String> p) throws SQLException {
        String plantilla = nombre(p.get("plantilla"), "la plantilla");
        String seccion = nombre(p.get("seccion"), "la sección");
        String titulo = p.get("titulo") == null ? "" : p.get("titulo").replaceAll("\\s+", " ").trim();
        if (titulo.isEmpty()) throw new Api.Aviso("Escribe el titular de la noticia.");
        if (titulo.length() > 160) throw new Api.Aviso("El titular es demasiado largo (como mucho 160 caracteres).");
        String campos = com.europesip.orbita.core.Json.of(validarCampos(p.get("campos")));
        LocalDateTime ahora = LocalDateTime.now();
        String idTxt = p.get("id");
        if (idTxt == null || idTxt.isBlank()) {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO NOTICIA_PROPUESTA (AUTOR, PLANTILLA, SECCION, TITULO, CAMPOS, ESTADO, CREADA, ACTUALIZADA)"
                    + " VALUES (?,?,?,?,?,'BORRADOR',?,?)", Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, yo.usuario);
                ps.setString(2, plantilla);
                ps.setString(3, seccion);
                ps.setString(4, titulo);
                ps.setString(5, campos);
                ps.setTimestamp(6, Timestamp.valueOf(ahora));
                ps.setTimestamp(7, Timestamp.valueOf(ahora));
                ps.executeUpdate();
                try (ResultSet k = ps.getGeneratedKeys()) {
                    k.next();
                    return obj("propuesta", json(cargar(k.getInt(1)), true), "mensaje", "Borrador guardado.");
                }
            }
        }
        Fila f = cargar(Api.entero(p, "id"));
        if (!editable(f)) throw new Api.Aviso("Esta propuesta ya no se puede cambiar.");
        try (PreparedStatement ps = c.prepareStatement("UPDATE NOTICIA_PROPUESTA SET PLANTILLA = ?, SECCION = ?, TITULO = ?, CAMPOS = ?, ACTUALIZADA = ? WHERE ID = ?")) {
            ps.setString(1, plantilla);
            ps.setString(2, seccion);
            ps.setString(3, titulo);
            ps.setString(4, campos);
            ps.setTimestamp(5, Timestamp.valueOf(ahora));
            ps.setInt(6, f.id);
            ps.executeUpdate();
        }
        return obj("propuesta", json(cargar(f.id), true), "mensaje", "Cambios guardados.");
    }

    private static String nombre(String v, String que) {
        if (v == null || !NOMBRE.matcher(v.trim()).matches()) throw new Api.Aviso("Elige " + que + ".");
        return v.trim();
    }

    /** Comprueba y limpia los campos: {nombre: {tipo, valor}}. */
    private Map<String, Object> validarCampos(String txt) throws SQLException {
        Map<String, Object> out = new LinkedHashMap<>();
        if (txt == null || txt.isBlank()) return out;
        JsonObject o;
        try (JsonReader r = Json.createReader(new StringReader(txt))) {
            o = r.readObject();
        } catch (RuntimeException e) {
            throw new Api.Aviso("Los campos de la noticia no han llegado bien.");
        }
        if (o.size() > 30) throw new Api.Aviso("La plantilla tiene demasiados campos.");
        for (Map.Entry<String, JsonValue> e : o.entrySet()) {
            String n = e.getKey();
            if (!NOMBRE.matcher(n).matches()) throw new Api.Aviso("Los campos de la noticia no han llegado bien.");
            if (!(e.getValue() instanceof JsonObject x)) throw new Api.Aviso("Los campos de la noticia no han llegado bien.");
            String tipo = x.getString("tipo", "texto");
            JsonValue v = x.get("valor");
            String valor = v instanceof JsonString s ? s.getString() : v == null || v.getValueType() == JsonValue.ValueType.NULL ? "" : v.toString();
            out.put(n, obj("tipo", tipo, "valor", campo(tipo, valor.trim())));
        }
        return out;
    }

    private String campo(String tipo, String v) throws SQLException {
        switch (tipo) {
            case "texto":
                v = Html.texto(v);
                if (v.length() > 1000) throw new Api.Aviso("Un texto corto no puede pasar de 1000 caracteres.");
                return v;
            case "largo":
                v = v.replaceAll("<[^>]*>", "").replace("\r", "");
                if (v.length() > 4000) throw new Api.Aviso("Un texto no puede pasar de 4000 caracteres.");
                return v;
            case "rico":
                v = Html.limpiar(v);
                if (v.length() > 40000) throw new Api.Aviso("El cuerpo de la noticia es demasiado largo.");
                return v;
            case "imagen":
                if (v.isEmpty()) return "";
                if (!v.startsWith(IMAGENES)) throw new Api.Aviso("Sube la imagen desde el formulario.");
                int id;
                try {
                    id = Integer.parseInt(v.substring(IMAGENES.length()));
                } catch (NumberFormatException e) {
                    throw new Api.Aviso("Sube la imagen desde el formulario.");
                }
                if (imagen(c, id) == null) throw new Api.Aviso("Esa imagen ya no existe: súbela otra vez.");
                return IMAGENES + id;
            case "fecha":
                if (v.isEmpty()) return "";
                try {
                    return LocalDateTime.parse(v.length() == 10 ? v + "T00:00" : v).withSecond(0).withNano(0).toString();
                } catch (DateTimeParseException e) {
                    throw new Api.Aviso("La fecha no es válida.");
                }
            case "diseno":
                return DISENOS.contains(v) ? v : "clasico";
            case "enlace":
                if (v.isEmpty()) return "";
                String l = v.toLowerCase(Locale.ROOT);
                if (!(l.startsWith("https://") || l.startsWith("http://") || (l.startsWith("/") && !l.startsWith("//"))) || v.length() > 500 || v.matches(".*\\s.*")) {
                    throw new Api.Aviso("El enlace tiene que empezar por https:// (o ser una página del portal).");
                }
                return v;
            default:
                throw new Api.Aviso("Los campos de la noticia no han llegado bien.");
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> leerCampos(String txt) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (txt == null || txt.isBlank()) return m;
        try (JsonReader r = Json.createReader(new StringReader(txt))) {
            for (Map.Entry<String, JsonValue> e : r.readObject().entrySet()) {
                JsonObject x = e.getValue().asJsonObject();
                m.put(e.getKey(), obj("tipo", x.getString("tipo", "texto"), "valor", x.getString("valor", "")));
            }
        }
        return m;
    }

    private Map<String, Object> enviar(int id) throws SQLException {
        Fila f = cargar(id);
        if (!f.autor.equals(yo.usuario) || !("BORRADOR".equals(f.estado) || "DEVUELTA".equals(f.estado))) {
            throw new Api.Aviso("Esta propuesta ya está enviada.");
        }
        Map<String, Object> campos = leerCampos(f.campos);
        if (resumen(campos) == null && !tieneCuerpo(campos)) throw new Api.Aviso("Escribe al menos la entradilla o el texto de la noticia.");
        estado(f.id, "REVISION", null, true);
        for (Api.Emp e : api.plantilla()) {
            if ("RRHH".equals(e.rol) && !e.usuario.equals(yo.usuario)) {
                Social.avisar(c, e.usuario, "portada", "NOTICIA", f.id, "noticia.propuesta", obj("quien", yo.nombre, "titulo", f.titulo),
                        yo.nombre + " ha propuesto una noticia: «" + f.titulo + "».");
            }
        }
        return obj("propuesta", json(cargar(f.id), true), "mensaje", "Enviada a revisión: RRHH la revisará antes de publicarla.");
    }

    @SuppressWarnings("unchecked")
    private static boolean tieneCuerpo(Map<String, Object> campos) {
        for (Object v : campos.values()) {
            Map<String, Object> x = (Map<String, Object>) v;
            if ("rico".equals(x.get("tipo")) && !Html.texto(String.valueOf(x.get("valor"))).isEmpty()) return true;
        }
        return false;
    }

    private Map<String, Object> revisar(int id, String nuevo, String comentario) throws SQLException {
        if (!rrhh()) throw new Api.Aviso("Solo RRHH revisa las propuestas de noticias.");
        Fila f = cargar(id);
        if (!"REVISION".equals(f.estado)) throw new Api.Aviso("Esta propuesta no está pendiente de revisión.");
        String txt = comentario == null ? "" : comentario.trim();
        if (txt.isEmpty()) throw new Api.Aviso("Explica a la autora qué tiene que cambiar o por qué no se publica.");
        if (txt.length() > 1000) txt = txt.substring(0, 1000);
        estado(f.id, nuevo, txt, false);
        boolean devuelta = "DEVUELTA".equals(nuevo);
        Social.avisar(c, f.autor, "portada", "NOTICIA", f.id, devuelta ? "noticia.devuelta" : "noticia.rechazada", obj("titulo", f.titulo),
                devuelta ? "Te han devuelto la noticia «" + f.titulo + "» con un comentario para cambiarla." : "La noticia «" + f.titulo + "» no se va a publicar.");
        return obj("propuesta", json(cargar(f.id), true), "mensaje", devuelta ? "Devuelta a la autora." : "Rechazada.");
    }

    private Map<String, Object> publicada(int id, String wcmId) throws SQLException {
        if (!rrhh()) throw new Api.Aviso("Solo RRHH revisa las propuestas de noticias.");
        Fila f = cargar(id);
        if (!"REVISION".equals(f.estado)) throw new Api.Aviso("Esta propuesta no está pendiente de revisión.");
        if (wcmId == null || !UUID.matcher(wcmId.trim()).matches()) throw new Api.Aviso("Falta el contenido publicado en WCM.");
        try (PreparedStatement ps = c.prepareStatement("UPDATE NOTICIA_PROPUESTA SET ESTADO = 'PUBLICADA', REVISOR = ?, WCM_ID = ?, PUBLICADA = ?, ACTUALIZADA = ?,"
                + " COMENTARIO = NULL WHERE ID = ?")) {
            Timestamp ahora = Timestamp.valueOf(LocalDateTime.now());
            ps.setString(1, yo.usuario);
            ps.setString(2, wcmId.trim());
            ps.setTimestamp(3, ahora);
            ps.setTimestamp(4, ahora);
            ps.setInt(5, f.id);
            ps.executeUpdate();
        }
        if (!f.autor.equals(yo.usuario)) {
            Social.avisar(c, f.autor, "portada", "NOTICIA", f.id, "noticia.publicada", obj("titulo", f.titulo),
                    "Se ha publicado tu noticia «" + f.titulo + "». ¡Gracias!");
        }
        return obj("propuesta", json(cargar(f.id), true), "mensaje", "Publicada en la portada.");
    }

    private void estado(int id, String estado, String comentario, boolean enviada) throws SQLException {
        if (!ESTADOS.contains(estado)) throw new IllegalArgumentException(estado);
        try (PreparedStatement ps = c.prepareStatement("UPDATE NOTICIA_PROPUESTA SET ESTADO = ?, COMENTARIO = ?, REVISOR = ?, ACTUALIZADA = ?"
                + (enviada ? ", ENVIADA = ?" : "") + " WHERE ID = ?")) {
            Timestamp ahora = Timestamp.valueOf(LocalDateTime.now());
            ps.setString(1, estado);
            ps.setString(2, comentario);
            ps.setString(3, enviada ? null : yo.usuario);
            ps.setTimestamp(4, ahora);
            int i = 5;
            if (enviada) ps.setTimestamp(i++, ahora);
            ps.setInt(i, id);
            ps.executeUpdate();
        }
    }

    private Map<String, Object> borrar(int id) throws SQLException {
        Fila f = cargar(id);
        boolean mia = f.autor.equals(yo.usuario) && !"REVISION".equals(f.estado) && !"PUBLICADA".equals(f.estado);
        boolean deRrhh = rrhh() && !"PUBLICADA".equals(f.estado) && f.enviada != null;
        if (!mia && !deRrhh) throw new Api.Aviso("Esta propuesta no se puede borrar.");
        try (PreparedStatement ps = c.prepareStatement("DELETE FROM NOTICIA_PROPUESTA WHERE ID = ?")) {
            ps.setInt(1, f.id);
            ps.executeUpdate();
        }
        return obj("id", f.id, "mensaje", "Propuesta borrada.");
    }

    // ---------------------------------------------------------------- Imágenes

    private Map<String, Object> subirImagen(String b64) throws SQLException {
        if (b64 == null || b64.isBlank()) throw new Api.Aviso("Elige una imagen (JPG o PNG).");
        int coma = b64.indexOf(',');
        if (b64.startsWith("data:") && coma > 0) b64 = b64.substring(coma + 1);
        byte[] d;
        try {
            d = Base64.getDecoder().decode(b64.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            throw new Api.Aviso("La imagen no ha llegado bien. Vuelve a elegirla.");
        }
        BufferedImage img = Fotos.leer(d, MAX_IMAGEN, "La imagen ocupa demasiado (máximo 10 MB).");
        if (img.getWidth() < 200 || img.getHeight() < 100) throw new Api.Aviso("La imagen es demasiado pequeña (al menos 200 × 100 píxeles).");
        int w = Math.min(ANCHO, img.getWidth()), h = Math.round(img.getHeight() * (w / (float) img.getWidth()));
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Fotos.dibujar(out, img, 0, 0, w, h, 0, 0, img.getWidth(), img.getHeight());
        byte[] jpeg = Fotos.jpeg(out);
        int id = guardarImagen(c, yo.usuario, jpeg, w, h);
        return obj("id", id, "url", IMAGENES + id, "ancho", w, "alto", h);
    }

    static int guardarImagen(Connection c, String autor, byte[] jpeg, int w, int h) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO NOTICIA_IMAGEN (AUTOR, FOTO, TIPO, ANCHO, ALTO, CREADA) VALUES (?,?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, autor);
            ps.setBytes(2, jpeg);
            ps.setString(3, "image/jpeg");
            ps.setInt(4, w);
            ps.setInt(5, h);
            ps.setTimestamp(6, Timestamp.valueOf(LocalDateTime.now()));
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                return k.getInt(1);
            }
        }
    }

    static Imagen imagen(Connection c, int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT TIPO, FOTO FROM NOTICIA_IMAGEN WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new Imagen(rs.getString(1), rs.getBytes(2)) : null;
            }
        }
    }
}
