package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.io.StringReader;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import jakarta.json.JsonArray;
import jakarta.json.JsonReader;
import jakarta.json.JsonValue;

/**
 * Mis documentos (op=docs.*): la documentación de cada empleado.
 *
 *  - La empresa (RRHH y Administración, «gestores») publica nóminas (con sus importes), informes de cotización,
 *    certificados de retenciones, contratos, certificados y otros documentos, de uno en uno o en lote (un fichero por
 *    persona, asignado por el nombre del fichero, y los importes de las nóminas en un CSV). Puede pedir el «recibí».
 *  - El empleado ve y descarga los suyos, firma el «recibí» cuando se le pide y ve el año de nóminas de un vistazo.
 *  - El empleado envía documentos suyos a RRHH (justificantes, titulaciones, datos bancarios...); RRHH los revisa.
 *
 * Privacidad: cada persona ve solo lo suyo. Los gestores ven los documentos de la empresa de toda la plantilla; los que
 * envían los empleados, solo RRHH. El responsable no ve nada de nadie de su equipo.
 */
final class Documentos {

    static final List<String> DE_EMPRESA = Arrays.asList("NOMINA", "COTIZACION", "RETENCIONES", "CONTRATO", "CERTIFICADO", "OTRO");
    static final List<String> DE_EMPLEADO = Arrays.asList("JUSTIFICANTE", "TITULACION", "BANCARIO", "PERSONAL", "OTRO");
    private static final Map<String, String> NOMBRE = Map.ofEntries(Map.entry("NOMINA", "Nómina"), Map.entry("COTIZACION", "Informe de cotización"),
            Map.entry("RETENCIONES", "Certificado de retenciones"), Map.entry("CONTRATO", "Contrato"), Map.entry("CERTIFICADO", "Certificado"),
            Map.entry("OTRO", "Documento"), Map.entry("JUSTIFICANTE", "Justificante"), Map.entry("TITULACION", "Titulación"),
            Map.entry("BANCARIO", "Datos bancarios"), Map.entry("PERSONAL", "Documento personal"));
    static final int MAX_BYTES = 6 * 1024 * 1024;
    private static final String[] MESES = {"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
        "octubre", "noviembre", "diciembre"};

    private final Api api;
    private final Connection c;
    private final Api.Emp yo;

    Documentos(Api api, Connection c) {
        this.api = api;
        this.c = c;
        this.yo = api.yo();
    }

    Object ejecutar(String op, Map<String, String> p) throws SQLException {
        switch (op) {
            case "docs.resumen": return resumen();
            case "docs.lista": return lista(p.get("usuario"), p.get("categoria"), p.get("anio"));
            case "docs.nominas": return nominas(yo.usuario, p.get("anio") == null || p.get("anio").isBlank() ? LocalDate.now().getYear() : Api.entero(p, "anio"));
            case "docs.fichero": return fichero(Api.entero(p, "id"));
            case "docs.acuse": return acuse(Api.entero(p, "id"));
            case "docs.publicar": return publicar(p);
            case "docs.asignar": return asignar(p.get("nombres"), p.get("csv"));
            case "docs.borrar": return borrar(Api.entero(p, "id"));
            case "docs.enviar": return enviar(p);
            case "docs.revisar": return revisar(Api.entero(p, "id"), p.get("estado"), p.get("comentario"));
            case "docs.gestion": return gestion();
            case "docs.bandeja": return bandeja();
            default: throw new Api.Aviso("Operación desconocida: " + op);
        }
    }

    /** RRHH y Administración publican y ven los documentos de la empresa de toda la plantilla. */
    private boolean gestor() {
        return "RRHH".equals(yo.rol) || "ADMINISTRACION".equals(yo.rol);
    }

    private boolean rrhh() {
        return "RRHH".equals(yo.rol);
    }

    static String nombreCategoria(String c) {
        return NOMBRE.getOrDefault(c, c);
    }

    /** «octubre de 2026», «2025» o null. */
    static String periodoTexto(String periodo) {
        if (periodo == null) return null;
        if (periodo.length() == 4) return periodo;
        YearMonth ym = YearMonth.parse(periodo);
        return MESES[ym.getMonthValue() - 1] + " de " + ym.getYear();
    }

    // ---------------------------------------------------------------- Lectura

    private static final String COLUMNAS = "D.ID, D.USUARIO, D.ORIGEN, D.CATEGORIA, D.TITULO, D.PERIODO, D.NOMBRE, D.TIPO, D.TAMANO, D.COMENTARIO,"
            + " D.SUBIDO_POR, D.CREADO, D.PIDE_ACUSE, D.LEIDO, D.ACUSE, D.ESTADO, D.REVISADO_POR, D.REVISADO, D.COMENTARIO_RRHH,"
            + " N.BRUTO, N.IRPF, N.SS, N.OTRAS, N.NETO, N.EXTRA";
    private static final String DESDE = " FROM DOCUMENTO D LEFT JOIN NOMINA N ON N.DOCUMENTO = D.ID";

    private Map<String, Object> json(ResultSet rs) throws SQLException {
        Api.Emp sube = api.emp(rs.getString("SUBIDO_POR")), de = api.emp(rs.getString("USUARIO")), rev = api.emp(rs.getString("REVISADO_POR"));
        Map<String, Object> m = obj("id", rs.getInt("ID"), "usuario", rs.getString("USUARIO"), "persona", de == null ? rs.getString("USUARIO") : de.nombre,
                "origen", rs.getString("ORIGEN"), "categoria", rs.getString("CATEGORIA"), "titulo", rs.getString("TITULO"),
                "periodo", rs.getString("PERIODO"), "nombre", rs.getString("NOMBRE"), "tipo", rs.getString("TIPO"), "tamano", rs.getInt("TAMANO"),
                "comentario", rs.getString("COMENTARIO"), "subidoPor", sube == null ? rs.getString("SUBIDO_POR") : sube.nombre,
                "creado", fechaHora(rs.getTimestamp("CREADO")), "pideAcuse", rs.getInt("PIDE_ACUSE") == 1,
                "leido", fechaHora(rs.getTimestamp("LEIDO")), "acuse", fechaHora(rs.getTimestamp("ACUSE")),
                "estado", rs.getString("ESTADO"), "revisadoPor", rev == null ? rs.getString("REVISADO_POR") : rev.nombre,
                "revisado", fechaHora(rs.getTimestamp("REVISADO")), "comentarioRrhh", rs.getString("COMENTARIO_RRHH"));
        rs.getInt("BRUTO");
        if (!rs.wasNull()) {
            m.put("nomina", obj("bruto", rs.getInt("BRUTO"), "irpf", rs.getInt("IRPF"), "ss", rs.getInt("SS"), "otras", rs.getInt("OTRAS"),
                    "neto", rs.getInt("NETO"), "extra", rs.getInt("EXTRA") == 1));
        }
        // Título puesto por ÓRBITA («Nómina de octubre de 2026»): la interfaz lo compone en el idioma de cada persona
        boolean extra = m.get("nomina") != null && Boolean.TRUE.equals(((Map<?, ?>) m.get("nomina")).get("extra"));
        m.put("tituloAuto", rs.getString("TITULO").equals(tituloPorDefecto(rs.getString("CATEGORIA"), rs.getString("PERIODO"), extra)));
        return m;
    }

    private static String fechaHora(Timestamp t) {
        return t == null ? null : t.toLocalDateTime().withNano(0).toString();
    }

    /** Documentos de una persona (la propia, o cualquiera para un gestor), por categoría y año. Sin el fichero. */
    private Map<String, Object> lista(String usuario, String categoria, String anio) throws SQLException {
        Api.Emp de = usuario == null || usuario.isBlank() ? yo : api.emp(usuario);
        if (de == null) throw new Api.Aviso("Esa persona no está en el directorio.");
        boolean mia = de == yo;
        if (!mia && !gestor()) throw new Api.Aviso("Solo puedes ver tus propios documentos.");
        // Lo que un empleado envía a RRHH lo ven él y RRHH; Administración, no
        boolean verEnviados = mia || rrhh();
        StringBuilder sql = new StringBuilder("SELECT " + COLUMNAS + DESDE + " WHERE D.USUARIO = ?");
        if (!verEnviados) sql.append(" AND D.ORIGEN = 'EMPRESA'");
        if (categoria != null && !categoria.isBlank()) sql.append(" AND D.CATEGORIA = ?");
        if (anio != null && !anio.isBlank()) sql.append(" AND (D.PERIODO LIKE ? OR (D.PERIODO IS NULL AND EXTRACT(YEAR FROM D.CREADO) = ?))");
        sql.append(" ORDER BY COALESCE(D.PERIODO, TO_CHAR(D.CREADO, 'YYYY-MM')) DESC, D.CREADO DESC, D.ID DESC");
        List<Object> l = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(sql.toString())) {
            int i = 1;
            ps.setString(i++, de.usuario);
            if (categoria != null && !categoria.isBlank()) ps.setString(i++, categoria);
            if (anio != null && !anio.isBlank()) {
                int a;
                try { a = Integer.parseInt(anio.trim()); } catch (NumberFormatException e) { throw new Api.Aviso("Año no válido."); }
                ps.setString(i++, a + "%");
                ps.setInt(i, a);
            }
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) l.add(json(rs));
            }
        }
        return obj("documentos", l, "persona", obj("usuario", de.usuario, "nombre", de.nombre, "puesto", de.puesto, "departamento", de.departamento),
                "mia", mia, "categoriasEmpresa", DE_EMPRESA, "categoriasEmpleado", DE_EMPLEADO);
    }

    /** Las nóminas de un año (ordinarias y extras) y sus totales. */
    Map<String, Object> nominas(String usuario, int anio) throws SQLException {
        List<Object> meses = new ArrayList<>();
        long bruto = 0, irpf = 0, ss = 0, otras = 0, neto = 0;
        try (PreparedStatement ps = c.prepareStatement("SELECT " + COLUMNAS + DESDE + " WHERE D.USUARIO = ? AND D.CATEGORIA = 'NOMINA'"
                + " AND N.DOCUMENTO IS NOT NULL AND D.PERIODO LIKE ? ORDER BY D.PERIODO, N.EXTRA, D.ID")) {
            ps.setString(1, usuario);
            ps.setString(2, anio + "-%");
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> d = json(rs);
                    @SuppressWarnings("unchecked")
                    Map<String, Object> n = (Map<String, Object>) d.get("nomina");
                    bruto += (Integer) n.get("bruto");
                    irpf += (Integer) n.get("irpf");
                    ss += (Integer) n.get("ss");
                    otras += (Integer) n.get("otras");
                    neto += (Integer) n.get("neto");
                    meses.add(obj("id", d.get("id"), "periodo", d.get("periodo"), "extra", n.get("extra"), "bruto", n.get("bruto"),
                            "irpf", n.get("irpf"), "ss", n.get("ss"), "otras", n.get("otras"), "neto", n.get("neto"), "leido", d.get("leido")));
                }
            }
        }
        return obj("anio", anio, "nominas", meses, "importesEn", "céntimos de euro",
                "total", obj("bruto", bruto, "irpf", irpf, "ss", ss, "otras", otras, "neto", neto,
                        "irpfMedio", bruto == 0 ? 0 : Math.round(irpf * 1000.0 / bruto) / 10.0));
    }

    /** Para la portada de la aplicación, Mi intranet y el asistente. */
    @SuppressWarnings("unchecked")
    Map<String, Object> resumen() throws SQLException {
        int nuevos = contar("SELECT COUNT(*) FROM DOCUMENTO WHERE USUARIO = ? AND ORIGEN = 'EMPRESA' AND LEIDO IS NULL", yo.usuario);
        int porAcusar = contar("SELECT COUNT(*) FROM DOCUMENTO WHERE USUARIO = ? AND ORIGEN = 'EMPRESA' AND PIDE_ACUSE = 1 AND ACUSE IS NULL", yo.usuario);
        int enviados = contar("SELECT COUNT(*) FROM DOCUMENTO WHERE USUARIO = ? AND ORIGEN = 'EMPLEADO' AND ESTADO = 'PENDIENTE'", yo.usuario);
        // La última nómina ordinaria y la anterior, para comparar
        Map<String, Object> ultima = null;
        try (PreparedStatement ps = c.prepareStatement("SELECT " + COLUMNAS + DESDE + " WHERE D.USUARIO = ? AND D.CATEGORIA = 'NOMINA'"
                + " AND N.DOCUMENTO IS NOT NULL AND N.EXTRA = 0 ORDER BY D.PERIODO DESC, D.ID DESC LIMIT 2")) {
            ps.setString(1, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    ultima = json(rs);
                    if (rs.next()) ultima.put("anterior", json(rs).get("nomina"));
                }
            }
        }
        int anio = ultima != null ? Integer.parseInt(((String) ultima.get("periodo")).substring(0, 4)) : LocalDate.now().getYear();
        Map<String, Object> r = obj("nuevos", nuevos, "porAcusar", porAcusar, "enviadosPendientes", enviados, "ultima", ultima,
                "anio", nominas(yo.usuario, anio), "gestor", gestor(), "rrhh", rrhh());
        if (rrhh()) r.put("bandeja", contar("SELECT COUNT(*) FROM DOCUMENTO WHERE ORIGEN = 'EMPLEADO' AND ESTADO = 'PENDIENTE'", null));
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

    /** El fichero en base64. La primera vez que lo abre su dueño queda como leído. */
    private Map<String, Object> fichero(int id) throws SQLException {
        String usuario, origen, nombre, tipo;
        byte[] datos;
        boolean leido;
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, ORIGEN, NOMBRE, TIPO, FICHERO, LEIDO FROM DOCUMENTO WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("El documento ya no existe.");
                usuario = rs.getString(1);
                origen = rs.getString(2);
                nombre = rs.getString(3);
                tipo = rs.getString(4);
                datos = rs.getBytes(5);
                leido = rs.getTimestamp(6) != null;
            }
        }
        puedeVer(usuario, origen);
        if (usuario.equals(yo.usuario) && "EMPRESA".equals(origen) && !leido) {
            try (PreparedStatement ps = c.prepareStatement("UPDATE DOCUMENTO SET LEIDO = ? WHERE ID = ? AND LEIDO IS NULL")) {
                ps.setTimestamp(1, Timestamp.valueOf(LocalDateTime.now()));
                ps.setInt(2, id);
                ps.executeUpdate();
            }
        }
        return obj("id", id, "nombre", nombre, "tipo", tipo, "datos", Base64.getEncoder().encodeToString(datos));
    }

    private void puedeVer(String usuario, String origen) {
        if (usuario.equals(yo.usuario)) return;
        if ("EMPRESA".equals(origen) && gestor()) return;
        if ("EMPLEADO".equals(origen) && rrhh()) return;
        throw new Api.Aviso("No tienes permiso para ver ese documento.");
    }

    // ---------------------------------------------------------------- Recibí

    private Map<String, Object> acuse(int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, PIDE_ACUSE, ACUSE, TITULO, SUBIDO_POR FROM DOCUMENTO WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("El documento ya no existe.");
                if (!yo.usuario.equals(rs.getString(1))) throw new Api.Aviso("Solo la persona a la que va dirigido puede firmar el recibí.");
                if (rs.getInt(2) != 1) throw new Api.Aviso("Este documento no necesita recibí.");
                if (rs.getTimestamp(3) != null) throw new Api.Aviso("Ya habías firmado el recibí.");
                String titulo = rs.getString(4), sube = rs.getString(5);
                LocalDateTime ahora = LocalDateTime.now().withNano(0);
                try (PreparedStatement up = c.prepareStatement("UPDATE DOCUMENTO SET ACUSE = ?, LEIDO = COALESCE(LEIDO, ?) WHERE ID = ?")) {
                    up.setTimestamp(1, Timestamp.valueOf(ahora));
                    up.setTimestamp(2, Timestamp.valueOf(ahora));
                    up.setInt(3, id);
                    up.executeUpdate();
                }
                if (!sube.equals(yo.usuario)) {
                    Social.avisar(c, sube, "documentos", "DOCUMENTO", id, "documento.recibi", obj("quien", yo.nombre, "titulo", titulo),
                            yo.nombre + " ha firmado el recibí de «" + titulo + "».");
                }
            }
        }
        return obj("ok", true, "mensaje", "Recibí firmado.");
    }

    // ---------------------------------------------------------------- Publicar (RRHH y Administración)

    private Map<String, Object> publicar(Map<String, String> p) throws SQLException {
        if (!gestor()) throw new Api.Aviso("Solo RRHH y Administración pueden publicar documentos.");
        Api.Emp para = api.emp(p.get("usuario"));
        if (para == null) throw new Api.Aviso("Elige a la persona a la que va el documento.");
        String categoria = p.get("categoria");
        if (!DE_EMPRESA.contains(categoria)) throw new Api.Aviso("Elige el tipo de documento.");
        String periodo = periodo(p.get("periodo"), categoria);
        Fichero f = fichero(p);
        boolean extra = si(p.get("extra"));
        int[] importes = null;
        if ("NOMINA".equals(categoria) && p.get("bruto") != null && !p.get("bruto").isBlank()) {
            importes = importes(p.get("bruto"), p.get("irpf"), p.get("ss"), p.get("otras"), p.get("neto"));
        }
        if ("NOMINA".equals(categoria)) {
            int ya = contarNomina(para.usuario, periodo, extra);
            if (ya > 0) throw new Api.Aviso("Ya hay una nómina de " + para.nombre + " para " + periodoTexto(periodo) + (extra ? " (paga extra)" : "")
                    + ": bórrala antes de publicar otra.");
        }
        String titulo = Api.texto(p.get("titulo"));
        if (titulo == null) titulo = tituloPorDefecto(categoria, periodo, extra);
        if (titulo.length() > 160) titulo = titulo.substring(0, 160);
        // Recibí: lo que diga quien publica; si no dice nada, solo los contratos lo piden
        boolean acuse = p.get("pideAcuse") == null ? "CONTRATO".equals(categoria) : si(p.get("pideAcuse"));
        int id = insertar(c, para.usuario, "EMPRESA", categoria, titulo, periodo, f.nombre, f.tipo, f.datos, Api.texto(p.get("comentario")),
                yo.usuario, LocalDateTime.now().withNano(0), acuse);
        if (importes != null) insertarNomina(c, id, importes, extra);
        Social.avisar(c, para.usuario, "documentos", "DOCUMENTO", id, acuse ? "documento.recibir" : "documento.nuevo", obj("titulo", titulo),
                acuse ? "Tienes un documento nuevo: «" + titulo + "». Revísalo y firma el recibí." : "Tienes un documento nuevo: «" + titulo + "».");
        return obj("ok", true, "id", id, "mensaje", "Documento publicado para " + para.nombre + ".");
    }

    static String tituloPorDefecto(String categoria, String periodo, boolean extra) {
        String base = extra ? "Paga extra" : nombreCategoria(categoria);
        return periodo == null ? base : base + " de " + periodoTexto(periodo);
    }

    private int contarNomina(String usuario, String periodo, boolean extra) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM DOCUMENTO D JOIN NOMINA N ON N.DOCUMENTO = D.ID"
                + " WHERE D.USUARIO = ? AND D.PERIODO = ? AND N.EXTRA = ?")) {
            ps.setString(1, usuario);
            ps.setString(2, periodo);
            ps.setInt(3, extra ? 1 : 0);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    /** Periodo AAAA-MM (nóminas y cotizaciones, obligatorio), AAAA (retenciones) o ninguno. */
    private static String periodo(String s, String categoria) {
        s = s == null ? "" : s.trim();
        boolean mensual = "NOMINA".equals(categoria) || "COTIZACION".equals(categoria);
        if (s.isEmpty()) {
            if (mensual) throw new Api.Aviso("Indica el mes del documento.");
            if ("RETENCIONES".equals(categoria)) throw new Api.Aviso("Indica el año del certificado.");
            return null;
        }
        try {
            if (s.matches("\\d{4}") && !mensual) return s;
            if (s.matches("\\d{4}-\\d{2}")) return YearMonth.parse(s).toString();
        } catch (DateTimeParseException e) {
            // abajo
        }
        throw new Api.Aviso(mensual ? "Indica el mes como AAAA-MM." : "Indica el periodo como AAAA o AAAA-MM.");
    }

    /** [bruto, irpf, ss, otras, neto] en céntimos; el neto se calcula si no llega y tiene que cuadrar si llega. */
    static int[] importes(String bruto, String irpf, String ss, String otras, String neto) {
        int b = centimos(bruto, "bruto"), i = centimos(irpf, "IRPF"), s = centimos(ss, "Seguridad Social"), o = otras == null || otras.isBlank() ? 0 : centimos(otras, "otras deducciones");
        if (b <= 0) throw new Api.Aviso("El bruto tiene que ser mayor que cero.");
        int n = b - i - s - o;
        if (n < 0) throw new Api.Aviso("Las deducciones superan el bruto.");
        if (neto != null && !neto.isBlank() && Math.abs(centimos(neto, "neto") - n) > 1) {
            throw new Api.Aviso("El neto no cuadra: bruto menos IRPF, Seguridad Social y otras deducciones da " + euros(n) + ".");
        }
        return new int[] {b, i, s, o, n};
    }

    /** «1.234,56», «1234.56», «1234» o un número de céntimos de la interfaz → céntimos. */
    static int centimos(String s, String que) {
        if (s == null || s.isBlank()) throw new Api.Aviso("Falta el importe: " + que + ".");
        String t = s.trim().replace("€", "").replace(" ", "");
        if (t.contains(",")) t = t.replace(".", "").replace(",", ".");
        try {
            double v = Double.parseDouble(t);
            if (v < 0 || v > 10_000_000) throw new NumberFormatException();
            return (int) Math.round(v * 100);
        } catch (NumberFormatException e) {
            throw new Api.Aviso("Importe no válido: " + s);
        }
    }

    static String euros(long cent) {
        String s = String.format(Locale.GERMANY, "%,.2f", cent / 100.0);
        return s + " €";
    }

    // ---------------------------------------------------------------- Lote: asignar ficheros por nombre

    /**
     * Para publicar en lote: a quién va cada fichero, por su nombre (que contenga el usuario de DX o el nombre de la
     * persona: «nomina-2026-10-lucia.martin.pdf», «Lucia_Martin.pdf»), y los importes de la nómina de cada persona de
     * un CSV opcional («usuario;bruto;irpf;ss[;otras]», con cabecera o sin ella, decimales con coma o punto).
     */
    private Map<String, Object> asignar(String nombres, String csv) {
        if (!gestor()) throw new Api.Aviso("Solo RRHH y Administración pueden publicar documentos.");
        List<String> ficheros = new ArrayList<>();
        if (nombres != null && nombres.trim().startsWith("[")) {
            try (JsonReader r = jakarta.json.Json.createReader(new StringReader(nombres))) {
                JsonArray a = r.readArray();
                for (JsonValue v : a) ficheros.add(v.getValueType() == JsonValue.ValueType.STRING ? ((jakarta.json.JsonString) v).getString() : v.toString());
            } catch (RuntimeException e) {
                throw new Api.Aviso("Lista de ficheros no válida.");
            }
        } else if (nombres != null) {
            for (String x : nombres.split("\n")) if (!x.isBlank()) ficheros.add(x.trim());
        }
        if (ficheros.isEmpty()) throw new Api.Aviso("Elige los ficheros que quieres publicar.");
        if (ficheros.size() > 500) throw new Api.Aviso("Como mucho 500 ficheros en cada lote.");
        Map<String, int[]> porUsuario = csv(csv);
        List<Object> l = new ArrayList<>();
        int asignados = 0;
        for (String f : ficheros) {
            Api.Emp e = quien(f);
            Map<String, Object> m = obj("nombre", f, "usuario", e == null ? null : e.usuario, "persona", e == null ? null : e.nombre);
            if (e != null) {
                asignados++;
                int[] imp = porUsuario.get(e.usuario.toLowerCase(Locale.ROOT));
                if (imp != null) m.put("importes", obj("bruto", imp[0], "irpf", imp[1], "ss", imp[2], "otras", imp[3], "neto", imp[4]));
            }
            l.add(m);
        }
        return obj("ficheros", l, "asignados", asignados, "sinAsignar", ficheros.size() - asignados, "conImportes", porUsuario.size());
    }

    /** La persona cuyo usuario (o nombre completo) aparece en el nombre del fichero; la coincidencia más larga gana. */
    private Api.Emp quien(String fichero) {
        String f = Directorio.plano(fichero).replaceAll("[^a-z0-9@]+", " ");
        String compacto = " " + f + " ";
        Api.Emp mejor = null;
        int largo = 0;
        for (Api.Emp e : api.plantilla()) {
            for (String clave : new String[] {e.usuario, e.nombre}) {
                String k = Directorio.plano(clave).replaceAll("[^a-z0-9@]+", " ").trim();
                if (k.length() < 3) continue;
                if (compacto.contains(" " + k + " ") && k.length() > largo) {
                    mejor = e;
                    largo = k.length();
                }
            }
        }
        return mejor;
    }

    private Map<String, int[]> csv(String csv) {
        Map<String, int[]> m = new HashMap<>();
        if (csv == null || csv.isBlank()) return m;
        int n = 0;
        for (String linea : csv.split("\\r?\\n")) {
            n++;
            if (linea.isBlank()) continue;
            String[] x = linea.split("[;\\t]");
            if (x.length < 4) throw new Api.Aviso("Línea " + n + " del CSV: hacen falta usuario;bruto;irpf;ss.");
            if (n == 1 && !x[1].trim().matches("[0-9.,€ ]+")) continue;   // cabecera
            Api.Emp e = api.emp(x[0].trim());
            if (e == null) throw new Api.Aviso("Línea " + n + " del CSV: el usuario «" + x[0].trim() + "» no está en el directorio.");
            try {
                m.put(e.usuario.toLowerCase(Locale.ROOT), importes(x[1], x[2], x[3], x.length > 4 ? x[4] : null, null));
            } catch (Api.Aviso a) {
                throw new Api.Aviso("Línea " + n + " del CSV: " + a.getMessage());
            }
        }
        return m;
    }

    // ---------------------------------------------------------------- Borrar

    private Map<String, Object> borrar(int id) throws SQLException {
        String usuario, origen, estado;
        boolean firmado;
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, ORIGEN, ESTADO, ACUSE FROM DOCUMENTO WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("El documento ya no existe.");
                usuario = rs.getString(1);
                origen = rs.getString(2);
                estado = rs.getString(3);
                firmado = rs.getTimestamp(4) != null;
            }
        }
        if ("EMPRESA".equals(origen)) {
            if (!gestor()) throw new Api.Aviso("Solo RRHH y Administración pueden retirar un documento de la empresa.");
            if (firmado) throw new Api.Aviso("Ese documento ya tiene el recibí firmado: no se puede retirar.");
        } else {
            if (!usuario.equals(yo.usuario)) throw new Api.Aviso("Solo quien lo envió puede retirarlo.");
            if (!"PENDIENTE".equals(estado)) throw new Api.Aviso("RRHH ya lo ha revisado: no se puede retirar.");
        }
        try (PreparedStatement ps = c.prepareStatement("DELETE FROM NOMINA WHERE DOCUMENTO = ?")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        }
        try (PreparedStatement ps = c.prepareStatement("DELETE FROM DOCUMENTO WHERE ID = ?")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        }
        return obj("ok", true, "mensaje", "Documento retirado.");
    }

    // ---------------------------------------------------------------- Enviar a RRHH (empleado) y revisar (RRHH)

    private Map<String, Object> enviar(Map<String, String> p) throws SQLException {
        String categoria = p.get("categoria");
        if (!DE_EMPLEADO.contains(categoria)) throw new Api.Aviso("Elige qué tipo de documento envías.");
        String titulo = Api.texto(p.get("titulo"));
        if (titulo == null) throw new Api.Aviso("Pon un título al documento (por ejemplo, «Justificante médico del 3 de noviembre»).");
        if (titulo.length() > 160) titulo = titulo.substring(0, 160);
        Fichero f = fichero(p);
        int id = insertar(c, yo.usuario, "EMPLEADO", categoria, titulo, null, f.nombre, f.tipo, f.datos, Api.texto(p.get("comentario")),
                yo.usuario, LocalDateTime.now().withNano(0), false);
        try (PreparedStatement ps = c.prepareStatement("UPDATE DOCUMENTO SET ESTADO = 'PENDIENTE' WHERE ID = ?")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        }
        for (Api.Emp e : api.plantilla()) {
            if ("RRHH".equals(e.rol) && e != yo) {
                Social.avisar(c, e.usuario, "documentos", "DOCUMENTO", id, "documento.enviado", obj("quien", yo.nombre, "titulo", titulo),
                        yo.nombre + " ha enviado a RRHH «" + titulo + "».");
            }
        }
        return obj("ok", true, "id", id, "mensaje", "Documento enviado a RRHH.");
    }

    private Map<String, Object> revisar(int id, String estado, String comentario) throws SQLException {
        if (!rrhh()) throw new Api.Aviso("Solo RRHH revisa los documentos que envía la plantilla.");
        if (!"REVISADO".equals(estado) && !"RECHAZADO".equals(estado)) throw new Api.Aviso("Estado no válido.");
        comentario = Api.texto(comentario);
        if ("RECHAZADO".equals(estado) && comentario == null) throw new Api.Aviso("Explica por qué lo devuelves, para que la persona pueda corregirlo.");
        String usuario, titulo, actual;
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, TITULO, ESTADO FROM DOCUMENTO WHERE ID = ? AND ORIGEN = 'EMPLEADO'")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("El documento ya no existe.");
                usuario = rs.getString(1);
                titulo = rs.getString(2);
                actual = rs.getString(3);
            }
        }
        if (!"PENDIENTE".equals(actual)) throw new Api.Aviso("Ese documento ya está revisado.");
        try (PreparedStatement ps = c.prepareStatement("UPDATE DOCUMENTO SET ESTADO = ?, REVISADO_POR = ?, REVISADO = ?, COMENTARIO_RRHH = ? WHERE ID = ?")) {
            ps.setString(1, estado);
            ps.setString(2, yo.usuario);
            ps.setTimestamp(3, Timestamp.valueOf(LocalDateTime.now().withNano(0)));
            ps.setString(4, comentario);
            ps.setInt(5, id);
            ps.executeUpdate();
        }
        boolean ok = "REVISADO".equals(estado);
        Social.avisar(c, usuario, "documentos", "DOCUMENTO", id, ok ? "documento.revisado" : "documento.rechazado",
                obj("quien", yo.nombre, "titulo", titulo, "comentario", comentario),
                ok ? "RRHH ha revisado «" + titulo + "»." : "RRHH te ha devuelto «" + titulo + "»: " + comentario);
        return obj("ok", true, "mensaje", ok ? "Documento revisado." : "Documento devuelto a la persona.");
    }

    /** Bandeja de RRHH: lo que ha enviado la plantilla y aún no está revisado (y lo último revisado). */
    private Map<String, Object> bandeja() throws SQLException {
        if (!rrhh()) throw new Api.Aviso("Solo RRHH revisa los documentos que envía la plantilla.");
        List<Object> pendientes = new ArrayList<>(), revisados = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT " + COLUMNAS + DESDE + " WHERE D.ORIGEN = 'EMPLEADO' ORDER BY D.CREADO DESC LIMIT 60");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Map<String, Object> m = json(rs);
                if ("PENDIENTE".equals(m.get("estado"))) pendientes.add(m);
                else if (revisados.size() < 15) revisados.add(m);
            }
        }
        return obj("pendientes", pendientes, "revisados", revisados);
    }

    /** Para RRHH y Administración: la plantilla con su última nómina y lo pendiente de cada persona, y lo último publicado. */
    private Map<String, Object> gestion() throws SQLException {
        if (!gestor()) throw new Api.Aviso("Solo RRHH y Administración pueden publicar documentos.");
        Map<String, Object[]> estado = new HashMap<>();   // usuario → [última nómina, sin leer, sin recibí]
        try (PreparedStatement ps = c.prepareStatement("SELECT D.USUARIO, MAX(CASE WHEN D.CATEGORIA = 'NOMINA' THEN D.PERIODO END),"
                + " SUM(CASE WHEN D.LEIDO IS NULL THEN 1 ELSE 0 END), SUM(CASE WHEN D.PIDE_ACUSE = 1 AND D.ACUSE IS NULL THEN 1 ELSE 0 END)"
                + " FROM DOCUMENTO D WHERE D.ORIGEN = 'EMPRESA' GROUP BY D.USUARIO"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) estado.put(rs.getString(1), new Object[] {rs.getString(2), rs.getInt(3), rs.getInt(4)});
        }
        List<Object> plantilla = new ArrayList<>();
        for (Api.Emp e : api.plantilla()) {
            Object[] x = estado.getOrDefault(e.usuario, new Object[] {null, 0, 0});
            plantilla.add(obj("usuario", e.usuario, "nombre", e.nombre, "puesto", e.puesto, "departamento", e.departamento,
                    "ultimaNomina", x[0], "sinLeer", x[1], "sinRecibi", x[2]));
        }
        List<Object> recientes = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT " + COLUMNAS + DESDE + " WHERE D.ORIGEN = 'EMPRESA' ORDER BY D.CREADO DESC, D.ID DESC LIMIT 40");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) recientes.add(json(rs));
        }
        YearMonth mes = YearMonth.now();
        return obj("plantilla", plantilla, "recientes", recientes, "categorias", DE_EMPRESA, "mes", mes.toString(),
                "mesAnterior", mes.minusMonths(1).toString(), "rrhh", rrhh(),
                "bandeja", rrhh() ? contar("SELECT COUNT(*) FROM DOCUMENTO WHERE ORIGEN = 'EMPLEADO' AND ESTADO = 'PENDIENTE'", null) : 0);
    }

    // ---------------------------------------------------------------- Ficheros

    private record Fichero(String nombre, String tipo, byte[] datos) {}

    /** El fichero que llega en base64 (datos), con su nombre; el tipo se comprueba por su contenido. */
    private static Fichero fichero(Map<String, String> p) {
        String b64 = p.get("datos");
        if (b64 == null || b64.isBlank()) throw new Api.Aviso("Adjunta el fichero (PDF, JPG o PNG).");
        int coma = b64.indexOf(',');
        if (b64.startsWith("data:") && coma > 0) b64 = b64.substring(coma + 1);
        byte[] d;
        try {
            d = Base64.getDecoder().decode(b64.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            throw new Api.Aviso("El fichero no ha llegado bien. Vuelve a adjuntarlo.");
        }
        if (d.length > MAX_BYTES) throw new Api.Aviso("El fichero ocupa demasiado (máximo 6 MB).");
        String tipo = tipo(d);
        if (tipo == null) throw new Api.Aviso("Solo se admiten ficheros PDF, JPG o PNG.");
        String nombre = p.get("nombre") == null || p.get("nombre").isBlank() ? "documento" : p.get("nombre").trim();
        nombre = nombre.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (nombre.length() > 160) nombre = nombre.substring(nombre.length() - 160);
        return new Fichero(nombre, tipo, d);
    }

    static String tipo(byte[] d) {
        if (d.length > 4 && d[0] == '%' && d[1] == 'P' && d[2] == 'D' && d[3] == 'F') return "application/pdf";
        if (d.length > 3 && (d[0] & 0xff) == 0xFF && (d[1] & 0xff) == 0xD8 && (d[2] & 0xff) == 0xFF) return "image/jpeg";
        if (d.length > 8 && (d[0] & 0xff) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G') return "image/png";
        return null;
    }

    static int insertar(Connection c, String usuario, String origen, String categoria, String titulo, String periodo, String nombre, String tipo,
            byte[] datos, String comentario, String subidoPor, LocalDateTime creado, boolean pideAcuse) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO DOCUMENTO (USUARIO, ORIGEN, CATEGORIA, TITULO, PERIODO, NOMBRE, TIPO, TAMANO,"
                + " FICHERO, COMENTARIO, SUBIDO_POR, CREADO, PIDE_ACUSE) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, usuario);
            ps.setString(2, origen);
            ps.setString(3, categoria);
            ps.setString(4, titulo);
            ps.setString(5, periodo);
            ps.setString(6, nombre);
            ps.setString(7, tipo);
            ps.setInt(8, datos.length);
            ps.setBytes(9, datos);
            ps.setString(10, comentario);
            ps.setString(11, subidoPor);
            ps.setTimestamp(12, Timestamp.valueOf(creado));
            ps.setInt(13, pideAcuse ? 1 : 0);
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                return k.getInt(1);
            }
        }
    }

    static void insertarNomina(Connection c, int documento, int[] imp, boolean extra) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO NOMINA (DOCUMENTO, BRUTO, IRPF, SS, OTRAS, NETO, EXTRA) VALUES (?,?,?,?,?,?,?)")) {
            ps.setInt(1, documento);
            for (int i = 0; i < 5; i++) ps.setInt(i + 2, imp[i]);
            ps.setInt(7, extra ? 1 : 0);
            ps.executeUpdate();
        }
    }

    private static boolean si(String s) {
        return "true".equalsIgnoreCase(s) || "1".equals(s) || "si".equalsIgnoreCase(s) || "sí".equalsIgnoreCase(s);
    }
}
