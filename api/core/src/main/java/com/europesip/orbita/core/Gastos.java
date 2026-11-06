package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Gastos y viajes: notas de gasto con líneas y tickets, política por categoría, solicitudes de viaje y pagos.
 * Lo usa Api (op=gastos.* / viaje.*) y su bandeja de aprobaciones (clases NOTA y VIAJE). Importes en céntimos.
 */
final class Gastos {

    // categoría, nombre, límite en céntimos (0 = sin límite), unidad del límite
    static final String[][] CATEGORIAS = {
        {"COMIDA", "Comidas", "3000", "por comida"},
        {"HOTEL", "Alojamiento", "12000", "por noche"},
        {"TRANSPORTE", "Transporte", "0", ""},
        {"KILOMETRAJE", "Kilometraje", "0", ""},
        {"PARKING", "Parking y peajes", "0", ""},
        {"OTROS", "Otros", "5000", "por gasto"},
    };
    /** Céntimos por kilómetro. */
    static final int TARIFA_KM = 26;

    private final Api api;
    private final Connection c;
    private final Api.Emp yo;

    Gastos(Api api, Connection c) {
        this.api = api;
        this.c = c;
        this.yo = api.yo();
    }

    Object ejecutar(String op, Map<String, String> p) throws SQLException {
        switch (op) {
            case "gastos.resumen": return resumen();
            case "gastos.nota": return detalle(Api.entero(p, "id"));
            case "gastos.nuevaNota": return nuevaNota(p);
            case "gastos.guardarNota": return guardarNota(p);
            case "gastos.guardarLinea": return guardarLinea(p);
            case "gastos.borrarLinea": return borrarLinea(Api.entero(p, "id"));
            case "gastos.borrarNota": return borrarNota(Api.entero(p, "id"));
            case "gastos.enviar": return enviar(Api.entero(p, "id"));
            case "gastos.ticket": return ticket(Api.entero(p, "id"));
            case "viaje.solicitar": return solicitarViaje(p);
            case "viaje.cancelar": return cancelarViaje(Api.entero(p, "id"));
            case "gastos.pagos": return pagos();
            case "gastos.pagar": return pagar(p.get("ids"));
            case "gastos.exportar": return exportar(Api.entero(p, "anio"), Api.entero(p, "mes"));
            default: throw new Api.Aviso("Operación desconocida: " + op);
        }
    }

    // ---------------------------------------------------------------- Política

    static int limite(String categoria) {
        for (String[] k : CATEGORIAS) if (k[0].equals(categoria)) return Integer.parseInt(k[2]);
        return -1;
    }

    static String nombre(String categoria) {
        for (String[] k : CATEGORIAS) if (k[0].equals(categoria)) return k[1];
        return categoria;
    }

    static Map<String, Object> politica() {
        List<Object> l = new ArrayList<Object>();
        for (String[] k : CATEGORIAS) l.add(obj("id", k[0], "nombre", k[1], "limite", Integer.parseInt(k[2]), "unidad", k[3]));
        return obj("categorias", l, "tarifaKm", TARIFA_KM);
    }

    private boolean puedePagar() {
        return "ADMINISTRACION".equals(yo.rol) || "RRHH".equals(yo.rol);
    }

    // ---------------------------------------------------------------- Lectura

    private List<Map<String, Object>> lineas(int nota) throws SQLException {
        List<Map<String, Object>> l = new ArrayList<Map<String, Object>>();
        try (PreparedStatement ps = c.prepareStatement("SELECT ID, FECHA, CATEGORIA, DESCRIPCION, IMPORTE, IVA, KM, JUSTIFICACION,"
                + " TICKET_NOMBRE, TICKET_TIPO FROM LINEA_GASTO WHERE NOTA = ? ORDER BY FECHA, ID")) {
            ps.setInt(1, nota);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int lim = limite(rs.getString(3));
                    int imp = rs.getInt(5);
                    int km = rs.getInt(7);
                    Integer kms = rs.wasNull() ? null : km;
                    l.add(obj("id", rs.getInt(1), "fecha", rs.getDate(2).toString(), "categoria", rs.getString(3),
                            "descripcion", rs.getString(4), "importe", imp, "iva", rs.getInt(6), "km", kms,
                            "justificacion", rs.getString(8), "ticket", rs.getString(9), "ticketTipo", rs.getString(10),
                            "limite", lim, "excede", lim > 0 && imp > lim));
                }
            }
        }
        return l;
    }

    private Map<String, Object> viajeJson(ResultSet rs) throws SQLException {
        Api.Emp aprob = api.emp(rs.getString("APROBADOR"));
        Timestamp res = rs.getTimestamp("RESUELTO");
        return obj("id", rs.getInt("ID"), "persona", api.emp(rs.getString("USUARIO")).json(), "destino", rs.getString("DESTINO"),
                "motivo", rs.getString("MOTIVO"), "desde", rs.getDate("DESDE").toString(), "hasta", rs.getDate("HASTA").toString(),
                "estimado", rs.getInt("ESTIMADO"), "estado", rs.getString("ESTADO"), "aprobador", aprob == null ? null : aprob.nombre,
                "comentarioResp", rs.getString("COMENTARIO_RESP"),
                "creado", rs.getTimestamp("CREADO").toLocalDateTime().toLocalDate().toString(),
                "resuelto", res == null ? null : res.toLocalDateTime().toLocalDate().toString());
    }

    private Map<String, Object> viaje(Integer id) throws SQLException {
        if (id == null) return null;
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM VIAJE WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? viajeJson(rs) : null;
            }
        }
    }

    private static String dia(Timestamp t) {
        return t == null ? null : t.toLocalDateTime().toLocalDate().toString();
    }

    /** Nota con sus totales y avisos; con conLineas incluye el detalle de las líneas. */
    private Map<String, Object> notaJson(ResultSet rs, boolean conLineas) throws SQLException {
        int id = rs.getInt("ID");
        List<Map<String, Object>> ls = lineas(id);
        int total = 0, excedidas = 0, sinJustificar = 0, sinTicket = 0;
        List<Object> cats = new ArrayList<Object>();
        for (Map<String, Object> l : ls) {
            total += (Integer) l.get("importe");
            if (!cats.contains(l.get("categoria"))) cats.add(l.get("categoria"));
            if (Boolean.TRUE.equals(l.get("excede"))) {
                excedidas++;
                if (l.get("justificacion") == null) sinJustificar++;
            }
            if (l.get("ticket") == null && !"KILOMETRAJE".equals(l.get("categoria"))) sinTicket++;
        }
        int v = rs.getInt("VIAJE");
        Map<String, Object> viaje = rs.wasNull() ? null : viaje(v);
        Api.Emp aprob = api.emp(rs.getString("APROBADOR")), pag = api.emp(rs.getString("PAGADOR"));
        Map<String, Object> j = obj("id", id, "titulo", rs.getString("TITULO"), "estado", rs.getString("ESTADO"),
                "persona", api.emp(rs.getString("USUARIO")).json(), "viaje", viaje,
                "creado", dia(rs.getTimestamp("CREADO")), "enviado", dia(rs.getTimestamp("ENVIADO")),
                "resuelto", dia(rs.getTimestamp("RESUELTO")), "pagado", dia(rs.getTimestamp("PAGADO")),
                "aprobador", aprob == null ? null : aprob.nombre, "comentarioResp", rs.getString("COMENTARIO_RESP"),
                "pagador", pag == null ? null : pag.nombre, "total", total, "numLineas", ls.size(),
                "excedidas", excedidas, "sinJustificar", sinJustificar, "sinTicket", sinTicket, "categorias", cats);
        if (conLineas) j.put("lineas", ls);
        return j;
    }

    private Map<String, Object> nota(int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM NOTA_GASTO WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("La nota de gasto ya no existe.");
                return notaJson(rs, true);
            }
        }
    }

    /** Detalle de una nota: la propia, la de alguien del equipo, o cualquiera para Administración y RRHH. */
    private Map<String, Object> detalle(int id) throws SQLException {
        Map<String, Object> n = nota(id);
        String dueno = (String) ((Map<?, ?>) n.get("persona")).get("usuario");
        if (!dueno.equals(yo.usuario) && !api.aprueboA().contains(dueno) && !puedePagar()) {
            throw new Api.Aviso("No tienes permiso para ver esa nota de gasto.");
        }
        return n;
    }

    private Map<String, Object> resumen() throws SQLException {
        List<Object> notas = new ArrayList<Object>();
        int pendAprobar = 0, pendCobro = 0, cobrado = 0, borradores = 0;
        int anio = LocalDate.now().getYear();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM NOTA_GASTO WHERE USUARIO = ? ORDER BY CREADO DESC, ID DESC")) {
            ps.setString(1, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> n = notaJson(rs, false);
                    notas.add(n);
                    int t = (Integer) n.get("total");
                    switch ((String) n.get("estado")) {
                        case "ENVIADA": pendAprobar += t; break;
                        case "APROBADA": pendCobro += t; break;
                        case "PAGADA":
                            Timestamp pagado = rs.getTimestamp("PAGADO");
                            if (pagado != null && pagado.toLocalDateTime().getYear() == anio) cobrado += t;
                            break;
                        case "BORRADOR": borradores++; break;
                        default: break;
                    }
                }
            }
        }
        List<Object> viajes = new ArrayList<Object>();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM VIAJE WHERE USUARIO = ? ORDER BY DESDE DESC")) {
            ps.setString(1, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) viajes.add(viajeJson(rs));
            }
        }
        // Gasto del año por categoría y de los últimos seis meses (notas enviadas, aprobadas o pagadas)
        Map<String, Integer> porCat = new java.util.HashMap<String, Integer>();
        LocalDate hoy = LocalDate.now(), ini6 = hoy.withDayOfMonth(1).minusMonths(5);
        int[] meses = new int[6];
        int anual = 0;
        try (PreparedStatement ps = c.prepareStatement("SELECT L.CATEGORIA, L.FECHA, L.IMPORTE FROM LINEA_GASTO L JOIN NOTA_GASTO N ON N.ID = L.NOTA"
                + " WHERE N.USUARIO = ? AND N.ESTADO IN ('ENVIADA','APROBADA','PAGADA') AND L.FECHA >= ?")) {
            ps.setString(1, yo.usuario);
            ps.setDate(2, java.sql.Date.valueOf(ini6.isBefore(LocalDate.of(anio, 1, 1)) ? ini6 : LocalDate.of(anio, 1, 1)));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    LocalDate f = rs.getDate(2).toLocalDate();
                    int imp = rs.getInt(3);
                    if (f.getYear() == anio) {
                        anual += imp;
                        Integer prev = porCat.get(rs.getString(1));
                        porCat.put(rs.getString(1), (prev == null ? 0 : prev) + imp);
                    }
                    if (!f.isBefore(ini6)) {
                        int k = (f.getYear() - ini6.getYear()) * 12 + f.getMonthValue() - ini6.getMonthValue();
                        if (k >= 0 && k < 6) meses[k] += imp;
                    }
                }
            }
        }
        List<Object> cats = new ArrayList<Object>();
        for (String[] k : CATEGORIAS) if (porCat.containsKey(k[0])) cats.add(obj("id", k[0], "nombre", k[1], "importe", porCat.get(k[0])));
        List<Object> porMes = new ArrayList<Object>();
        for (int i = 0; i < 6; i++) porMes.add(obj("mes", ini6.plusMonths(i).toString().substring(0, 7), "importe", meses[i]));
        Api.Emp resp = api.emp(yo.responsable);
        Map<String, Integer> cuenta = Social.contar(c);
        Social.anotar(cuenta, notas, "NOTA");
        Social.anotar(cuenta, viajes, "VIAJE");
        return obj("notas", notas, "viajes", viajes, "politica", politica(), "puedePagar", puedePagar(),
                "aprobador", resp == null ? null : resp.nombre, "anio", anio,
                "porCategoria", cats, "porMes", porMes, "gastadoAnio", anual,
                "kpi", obj("pendienteAprobar", pendAprobar, "pendienteCobro", pendCobro, "cobrado", cobrado, "borradores", borradores));
    }

    // ---------------------------------------------------------------- Notas y líneas

    /** Comprueba que la nota es del usuario y se puede editar; si estaba rechazada vuelve a borrador. */
    private void editable(int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, ESTADO FROM NOTA_GASTO WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("La nota de gasto ya no existe.");
                if (!yo.usuario.equals(rs.getString(1))) throw new Api.Aviso("Esa nota de gasto no es tuya.");
                String e = rs.getString(2);
                if (!"BORRADOR".equals(e) && !"RECHAZADA".equals(e)) throw new Api.Aviso("La nota ya está enviada y no se puede modificar.");
                if ("BORRADOR".equals(e)) return;
            }
        }
        try (PreparedStatement ps = c.prepareStatement("UPDATE NOTA_GASTO SET ESTADO = 'BORRADOR', APROBADOR = NULL, RESUELTO = NULL,"
                + " ENVIADO = NULL WHERE ID = ?")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        }
    }

    private Integer viajeValido(String v) throws SQLException {
        if (v == null || v.isEmpty()) return null;
        int id = Integer.parseInt(v);
        Map<String, Object> j = viaje(id);
        if (j == null || !yo.usuario.equals(((Map<?, ?>) j.get("persona")).get("usuario"))) throw new Api.Aviso("Ese viaje no es tuyo.");
        if (!"APROBADA".equals(j.get("estado"))) throw new Api.Aviso("Solo se pueden asociar viajes aprobados.");
        return id;
    }

    private Map<String, Object> nuevaNota(Map<String, String> p) throws SQLException {
        String titulo = Api.texto(p.get("titulo"));
        if (titulo == null) throw new Api.Aviso("Pon un título a la nota (por ejemplo, «Visita a clientes en Valencia»).");
        Integer viaje = viajeValido(p.get("viaje"));
        int id;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO NOTA_GASTO (USUARIO, TITULO, VIAJE, ESTADO, CREADO)"
                + " VALUES (?,?,?,'BORRADOR',?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, yo.usuario);
            ps.setString(2, titulo);
            if (viaje == null) ps.setNull(3, java.sql.Types.INTEGER); else ps.setInt(3, viaje);
            ps.setTimestamp(4, Timestamp.valueOf(LocalDateTime.now()));
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                id = k.getInt(1);
            }
        }
        return nota(id);
    }

    private Map<String, Object> guardarNota(Map<String, String> p) throws SQLException {
        int id = Api.entero(p, "id");
        editable(id);
        String titulo = Api.texto(p.get("titulo"));
        if (titulo == null) throw new Api.Aviso("La nota necesita un título.");
        Integer viaje = viajeValido(p.get("viaje"));
        try (PreparedStatement ps = c.prepareStatement("UPDATE NOTA_GASTO SET TITULO = ?, VIAJE = ? WHERE ID = ?")) {
            ps.setString(1, titulo);
            if (viaje == null) ps.setNull(2, java.sql.Types.INTEGER); else ps.setInt(2, viaje);
            ps.setInt(3, id);
            ps.executeUpdate();
        }
        return nota(id);
    }

    static int centimos(String s) {
        if (s == null || s.trim().isEmpty()) return 0;
        String t = s.trim().replace("€", "").replace(" ", "");
        // 12,30 · 1.234,56 (español) o 12.30 · 1,234.56 (inglés): el último separador es el decimal
        if (t.contains(",") && t.contains(".")) {
            t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(".", "").replace(',', '.') : t.replace(",", "");
        } else if (t.contains(",")) {
            t = t.replace(',', '.');
        }
        try {
            return (int) Math.round(Double.parseDouble(t) * 100);
        } catch (NumberFormatException e) {
            throw new Api.Aviso("Importe no válido: " + s);
        }
    }

    private Map<String, Object> guardarLinea(Map<String, String> p) throws SQLException {
        int nota = Api.entero(p, "nota");
        editable(nota);
        String id = p.get("id");
        LocalDate fecha = Api.fecha(p.get("fecha"));
        if (fecha.isAfter(LocalDate.now())) throw new Api.Aviso("La fecha del gasto no puede ser futura.");
        String cat = p.get("categoria");
        if (limite(cat) < 0) throw new Api.Aviso("Elige la categoría del gasto.");
        String desc = Api.texto(p.get("descripcion"));
        if (desc == null) throw new Api.Aviso("Describe el gasto (por ejemplo, «Taxi al aeropuerto»).");
        Integer km = null;
        int importe, iva;
        if ("KILOMETRAJE".equals(cat)) {
            try {
                km = Integer.parseInt(p.get("km").trim());
            } catch (Exception e) {
                throw new Api.Aviso("Indica los kilómetros recorridos.");
            }
            if (km <= 0 || km > 3000) throw new Api.Aviso("Kilómetros no válidos.");
            importe = km * TARIFA_KM;
            iva = 0;
        } else {
            importe = centimos(p.get("importe"));
            iva = centimos(p.get("iva"));
            if (importe <= 0) throw new Api.Aviso("Indica el importe del gasto.");
            if (iva < 0 || iva >= importe) throw new Api.Aviso("El IVA tiene que ser menor que el importe total.");
        }
        String just = Api.texto(p.get("justificacion"));
        String datos = p.get("ticketDatos");
        byte[] ticket = datos == null || datos.isEmpty() ? null : Base64.getDecoder().decode(datos);
        if (ticket != null && ticket.length > 6 * 1024 * 1024) throw new Api.Aviso("El ticket ocupa demasiado (máximo 6 MB).");
        boolean quitar = "1".equals(p.get("quitarTicket"));

        if (id == null || id.isEmpty()) {
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO LINEA_GASTO (NOTA, FECHA, CATEGORIA, DESCRIPCION, IMPORTE, IVA, KM,"
                    + " JUSTIFICACION, TICKET_NOMBRE, TICKET_TIPO, TICKET) VALUES (?,?,?,?,?,?,?,?,?,?,?)")) {
                ps.setInt(1, nota);
                ps.setDate(2, Date.valueOf(fecha));
                ps.setString(3, cat);
                ps.setString(4, desc);
                ps.setInt(5, importe);
                ps.setInt(6, iva);
                if (km == null) ps.setNull(7, java.sql.Types.INTEGER); else ps.setInt(7, km);
                ps.setString(8, just);
                ps.setString(9, ticket == null ? null : nombreTicket(p.get("ticketNombre")));
                ps.setString(10, ticket == null ? null : p.get("ticketTipo"));
                ps.setBytes(11, ticket); // null incluido (BYTEA)
                ps.executeUpdate();
            }
        } else {
            int lin = Integer.parseInt(id);
            lineaDeNota(lin, nota);
            try (PreparedStatement ps = c.prepareStatement("UPDATE LINEA_GASTO SET FECHA = ?, CATEGORIA = ?, DESCRIPCION = ?, IMPORTE = ?,"
                    + " IVA = ?, KM = ?, JUSTIFICACION = ? WHERE ID = ?")) {
                ps.setDate(1, Date.valueOf(fecha));
                ps.setString(2, cat);
                ps.setString(3, desc);
                ps.setInt(4, importe);
                ps.setInt(5, iva);
                if (km == null) ps.setNull(6, java.sql.Types.INTEGER); else ps.setInt(6, km);
                ps.setString(7, just);
                ps.setInt(8, lin);
                ps.executeUpdate();
            }
            if (ticket != null || quitar) {
                try (PreparedStatement ps = c.prepareStatement("UPDATE LINEA_GASTO SET TICKET_NOMBRE = ?, TICKET_TIPO = ?, TICKET = ? WHERE ID = ?")) {
                    ps.setString(1, ticket == null ? null : nombreTicket(p.get("ticketNombre")));
                    ps.setString(2, ticket == null ? null : p.get("ticketTipo"));
                    ps.setBytes(3, ticket); // null incluido (BYTEA)
                    ps.setInt(4, lin);
                    ps.executeUpdate();
                }
            }
        }
        return nota(nota);
    }

    private static String nombreTicket(String s) {
        s = s == null || s.trim().isEmpty() ? "ticket" : s.trim();
        return s.length() > 120 ? s.substring(s.length() - 120) : s;
    }

    private void lineaDeNota(int linea, int nota) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT NOTA FROM LINEA_GASTO WHERE ID = ?")) {
            ps.setInt(1, linea);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next() || rs.getInt(1) != nota) throw new Api.Aviso("Esa línea no es de esta nota.");
            }
        }
    }

    private Map<String, Object> borrarLinea(int linea) throws SQLException {
        int nota;
        try (PreparedStatement ps = c.prepareStatement("SELECT NOTA FROM LINEA_GASTO WHERE ID = ?")) {
            ps.setInt(1, linea);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("Esa línea ya no existe.");
                nota = rs.getInt(1);
            }
        }
        editable(nota);
        try (PreparedStatement ps = c.prepareStatement("DELETE FROM LINEA_GASTO WHERE ID = ?")) {
            ps.setInt(1, linea);
            ps.executeUpdate();
        }
        return nota(nota);
    }

    private Map<String, Object> borrarNota(int id) throws SQLException {
        editable(id);
        for (String sql : new String[] {"DELETE FROM LINEA_GASTO WHERE NOTA = ?", "DELETE FROM NOTA_GASTO WHERE ID = ?"}) {
            try (PreparedStatement ps = c.prepareStatement(sql)) {
                ps.setInt(1, id);
                ps.executeUpdate();
            }
        }
        Map<String, Object> r = resumen();
        r.put("mensaje", "Borrador eliminado.");
        return r;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> enviar(int id) throws SQLException {
        editable(id);
        Map<String, Object> n = nota(id);
        List<Map<String, Object>> ls = (List<Map<String, Object>>) n.get("lineas");
        if (ls.isEmpty()) throw new Api.Aviso("Añade al menos un gasto antes de enviar la nota.");
        List<String> faltan = new ArrayList<String>();
        for (Map<String, Object> l : ls) {
            if (Boolean.TRUE.equals(l.get("excede")) && l.get("justificacion") == null) faltan.add((String) l.get("descripcion"));
        }
        if (!faltan.isEmpty()) {
            throw new Api.Aviso("Justifica los gastos que superan la política antes de enviar: " + String.join(", ", faltan) + ".");
        }
        boolean auto = yo.responsable == null;
        try (PreparedStatement ps = c.prepareStatement("UPDATE NOTA_GASTO SET ESTADO = ?, ENVIADO = ?, APROBADOR = ?, RESUELTO = ?,"
                + " COMENTARIO_RESP = NULL WHERE ID = ?")) {
            Timestamp ahora = Timestamp.valueOf(LocalDateTime.now());
            ps.setString(1, auto ? "APROBADA" : "ENVIADA");
            ps.setTimestamp(2, ahora);
            ps.setString(3, auto ? yo.usuario : null);
            ps.setTimestamp(4, auto ? ahora : null);
            ps.setInt(5, id);
            ps.executeUpdate();
        }
        Map<String, Object> r = nota(id);
        if (!auto) Social.avisar(c, yo.responsable, "aprobaciones", "NOTA", id, "nota.enviada",
                obj("quien", yo.nombre, "titulo", r.get("titulo"), "total", r.get("total")), yo.nombre + " ha enviado la nota de gasto «" + r.get("titulo")
                + "» (" + Ticket.euros((Integer) r.get("total")) + " €)");
        r.put("mensaje", auto ? "Nota registrada: pasa directamente a pago." : "Nota de " + Ticket.euros((Integer) r.get("total"))
                + " € enviada a " + api.emp(yo.responsable).nombre + ".");
        return r;
    }

    private Map<String, Object> ticket(int linea) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT L.TICKET_NOMBRE, L.TICKET_TIPO, L.TICKET, N.USUARIO FROM LINEA_GASTO L"
                + " JOIN NOTA_GASTO N ON N.ID = L.NOTA WHERE L.ID = ?")) {
            ps.setInt(1, linea);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next() || rs.getString(1) == null) throw new Api.Aviso("Esa línea no tiene ticket.");
                String dueno = rs.getString(4);
                if (!dueno.equals(yo.usuario) && !api.aprueboA().contains(dueno) && !puedePagar()) {
                    throw new Api.Aviso("No tienes permiso para ver ese ticket.");
                }
                return obj("nombre", rs.getString(1), "tipo", rs.getString(2), "datos", Base64.getEncoder().encodeToString(rs.getBytes(3)));
            }
        }
    }

    // ---------------------------------------------------------------- Viajes

    private Map<String, Object> solicitarViaje(Map<String, String> p) throws SQLException {
        String destino = Api.texto(p.get("destino"));
        if (destino == null) throw new Api.Aviso("Indica el destino del viaje.");
        String motivo = Api.texto(p.get("motivo"));
        if (motivo == null) throw new Api.Aviso("Explica el motivo del viaje.");
        LocalDate desde = Api.fecha(p.get("desde")), hasta = Api.fecha(p.get("hasta"));
        if (desde.isBefore(LocalDate.now())) throw new Api.Aviso("El viaje tiene que ser en fechas futuras.");
        if (hasta.isBefore(desde)) throw new Api.Aviso("La fecha de vuelta es anterior a la de ida.");
        int estimado = centimos(p.get("estimado"));
        if (estimado <= 0) throw new Api.Aviso("Indica el importe estimado del viaje.");
        boolean auto = yo.responsable == null;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO VIAJE (USUARIO, DESTINO, MOTIVO, DESDE, HASTA, ESTIMADO, ESTADO,"
                + " APROBADOR, CREADO, RESUELTO) VALUES (?,?,?,?,?,?,?,?,?,?)")) {
            Timestamp ahora = Timestamp.valueOf(LocalDateTime.now());
            ps.setString(1, yo.usuario);
            ps.setString(2, destino);
            ps.setString(3, motivo);
            ps.setDate(4, Date.valueOf(desde));
            ps.setDate(5, Date.valueOf(hasta));
            ps.setInt(6, estimado);
            ps.setString(7, auto ? "APROBADA" : "PENDIENTE");
            ps.setString(8, auto ? yo.usuario : null);
            ps.setTimestamp(9, ahora);
            ps.setTimestamp(10, auto ? ahora : null);
            ps.executeUpdate();
        }
        if (!auto) Social.avisar(c, yo.responsable, "aprobaciones", "VIAJE", null, "viaje.pedido",
                obj("quien", yo.nombre, "destino", destino, "desde", desde.toString(), "hasta", hasta.toString()),
                yo.nombre + " ha pedido un viaje a " + destino
                + " (" + Api.corta(desde) + " – " + Api.corta(hasta) + ")");
        Map<String, Object> r = resumen();
        r.put("mensaje", auto ? "Viaje registrado." : "Solicitud de viaje a " + destino + " enviada a " + api.emp(yo.responsable).nombre + ".");
        return r;
    }

    private Map<String, Object> cancelarViaje(int id) throws SQLException {
        Map<String, Object> v = viaje(id);
        if (v == null || !yo.usuario.equals(((Map<?, ?>) v.get("persona")).get("usuario"))) throw new Api.Aviso("Ese viaje no es tuyo.");
        boolean futuro = LocalDate.parse((String) v.get("desde")).isAfter(LocalDate.now());
        if (!"PENDIENTE".equals(v.get("estado")) && !("APROBADA".equals(v.get("estado")) && futuro)) {
            throw new Api.Aviso("Solo se pueden cancelar viajes pendientes o que aún no han empezado.");
        }
        try (PreparedStatement ps = c.prepareStatement("UPDATE VIAJE SET ESTADO = 'CANCELADA', RESUELTO = ? WHERE ID = ?")) {
            ps.setTimestamp(1, Timestamp.valueOf(LocalDateTime.now()));
            ps.setInt(2, id);
            ps.executeUpdate();
        }
        Map<String, Object> r = resumen();
        r.put("mensaje", "Viaje cancelado.");
        return r;
    }

    // ---------------------------------------------------------------- Pagos (Administración)

    private Map<String, Object> pagos() throws SQLException {
        if (!puedePagar()) throw new Api.Aviso("Solo Administración puede gestionar los pagos.");
        List<Object> porPagar = new ArrayList<Object>(), pagadas = new ArrayList<Object>();
        int totalPorPagar = 0;
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM NOTA_GASTO WHERE ESTADO = 'APROBADA' ORDER BY RESUELTO");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Map<String, Object> n = notaJson(rs, false);
                totalPorPagar += (Integer) n.get("total");
                porPagar.add(n);
            }
        }
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM NOTA_GASTO WHERE ESTADO = 'PAGADA' ORDER BY PAGADO DESC")) {
            ps.setMaxRows(15);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) pagadas.add(notaJson(rs, false));
            }
        }
        return obj("porPagar", porPagar, "totalPorPagar", totalPorPagar, "pagadas", pagadas);
    }

    private Map<String, Object> pagar(String ids) throws SQLException {
        if (!puedePagar()) throw new Api.Aviso("Solo Administración puede gestionar los pagos.");
        if (ids == null || ids.trim().isEmpty()) throw new Api.Aviso("Selecciona las notas que quieres marcar como pagadas.");
        int n = 0;
        for (String s : ids.split(",")) {
            try (PreparedStatement ps = c.prepareStatement("UPDATE NOTA_GASTO SET ESTADO = 'PAGADA', PAGADOR = ?, PAGADO = ?"
                    + " WHERE ID = ? AND ESTADO = 'APROBADA'")) {
                ps.setString(1, yo.usuario);
                ps.setTimestamp(2, Timestamp.valueOf(LocalDateTime.now()));
                ps.setInt(3, Integer.parseInt(s.trim()));
                if (ps.executeUpdate() == 1) {
                    n++;
                    Map<String, Object> pagada = nota(Integer.parseInt(s.trim()));
                    Social.avisar(c, (String) ((Map<?, ?>) pagada.get("persona")).get("usuario"), "gastos", "NOTA", (Integer) pagada.get("id"),
                            "nota.pagada", obj("titulo", pagada.get("titulo"), "total", pagada.get("total")),
                            "Administración ha pagado tu nota «" + pagada.get("titulo") + "» (" + Ticket.euros((Integer) pagada.get("total")) + " €)");
                }
            }
        }
        Map<String, Object> r = pagos();
        r.put("mensaje", n == 1 ? "1 nota marcada como pagada." : n + " notas marcadas como pagadas.");
        return r;
    }

    private Map<String, Object> exportar(int anio, int mes) throws SQLException {
        if (!puedePagar()) throw new Api.Aviso("Solo Administración puede exportar a contabilidad.");
        LocalDate ini = LocalDate.of(anio, mes, 1);
        StringBuilder b = new StringBuilder("﻿Nota;Fecha de pago;Empleado;Usuario;Departamento;Fecha del gasto;Categoría;Descripción;"
                + "Km;Base imponible;IVA;Total;Justificación\r\n");
        int filas = 0;
        try (PreparedStatement ps = c.prepareStatement("SELECT N.ID, N.PAGADO, N.USUARIO, L.FECHA, L.CATEGORIA, L.DESCRIPCION, L.KM,"
                + " L.IMPORTE, L.IVA, L.JUSTIFICACION FROM NOTA_GASTO N JOIN LINEA_GASTO L ON L.NOTA = N.ID"
                + " WHERE N.ESTADO = 'PAGADA' AND N.PAGADO >= ? AND N.PAGADO < ? ORDER BY N.PAGADO, N.ID, L.FECHA")) {
            ps.setTimestamp(1, Timestamp.valueOf(ini.atStartOfDay()));
            ps.setTimestamp(2, Timestamp.valueOf(ini.plusMonths(1).atStartOfDay()));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Api.Emp e = api.emp(rs.getString(3));
                    int total = rs.getInt(8), iva = rs.getInt(9);
                    int km = rs.getInt(7);
                    String kms = rs.wasNull() ? "" : String.valueOf(km);
                    b.append(String.format("GAS-%05d", rs.getInt(1))).append(';')
                            .append(rs.getTimestamp(2).toLocalDateTime().toLocalDate()).append(';')
                            .append(campo(e.nombre)).append(';').append(e.usuario).append(';').append(campo(e.departamento)).append(';')
                            .append(rs.getDate(4)).append(';').append(nombre(rs.getString(5))).append(';').append(campo(rs.getString(6))).append(';')
                            .append(kms).append(';').append(Ticket.euros(total - iva)).append(';').append(Ticket.euros(iva)).append(';')
                            .append(Ticket.euros(total)).append(';').append(campo(rs.getString(10))).append("\r\n");
                    filas++;
                }
            }
        }
        return obj("nombre", String.format("gastos-pagados-%d-%02d.csv", anio, mes), "contenido", b.toString(), "filas", filas);
    }

    private static String campo(String s) {
        if (s == null) return "";
        return s.contains(";") || s.contains("\"") || s.contains("\n") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
    }

    // ---------------------------------------------------------------- Bandeja de aprobaciones

    int contarPendientes(Set<String> equipo) throws SQLException {
        int n = 0;
        for (String sql : new String[] {"SELECT USUARIO FROM NOTA_GASTO WHERE ESTADO = 'ENVIADA'", "SELECT USUARIO FROM VIAJE WHERE ESTADO = 'PENDIENTE'"}) {
            try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) if (equipo.contains(rs.getString(1))) n++;
            }
        }
        return n;
    }

    /** Añade a la bandeja las notas enviadas y los viajes pendientes del equipo, y lo resuelto por el usuario al historial. */
    void pendientes(Set<String> equipo, List<Map<String, Object>> items, List<Map<String, Object>> historial) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM NOTA_GASTO WHERE ESTADO = 'ENVIADA'"
                + " OR (APROBADOR = ? AND RESUELTO IS NOT NULL AND USUARIO <> ?) ORDER BY ENVIADO")) {
            ps.setString(1, yo.usuario);
            ps.setString(2, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    if (!equipo.contains(rs.getString("USUARIO"))) continue;
                    boolean pendiente = "ENVIADA".equals(rs.getString("ESTADO"));
                    Map<String, Object> j = notaJson(rs, pendiente);
                    j.put("clase", "NOTA");
                    if (pendiente) {
                        j.put("creado", j.get("enviado"));
                        items.add(j);
                    } else {
                        historial.add(j);
                    }
                }
            }
        }
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM VIAJE WHERE ESTADO = 'PENDIENTE'"
                + " OR (APROBADOR = ? AND RESUELTO IS NOT NULL AND USUARIO <> ?) ORDER BY CREADO")) {
            ps.setString(1, yo.usuario);
            ps.setString(2, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    if (!equipo.contains(rs.getString("USUARIO"))) continue;
                    Map<String, Object> j = viajeJson(rs);
                    j.put("clase", "VIAJE");
                    if ("PENDIENTE".equals(rs.getString("ESTADO"))) items.add(j);
                    else if (!"CANCELADA".equals(rs.getString("ESTADO"))) historial.add(j);
                }
            }
        }
    }

    /** Aprueba o rechaza una nota enviada o un viaje pendiente del equipo; devuelve el nombre de la persona. */
    String resolver(String clase, int id, boolean aprobar, String comentario) throws SQLException {
        boolean nota = "NOTA".equals(clase);
        String tabla = nota ? "NOTA_GASTO" : "VIAJE", esperado = nota ? "ENVIADA" : "PENDIENTE";
        String usuario;
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, ESTADO FROM " + tabla + " WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("La solicitud ya no existe.");
                if (!esperado.equals(rs.getString(2))) throw new Api.Aviso("La solicitud ya estaba resuelta.");
                usuario = rs.getString(1);
            }
        }
        if (!api.aprueboA().contains(usuario)) throw new Api.Aviso("Esa solicitud no es de tu equipo.");
        try (PreparedStatement ps = c.prepareStatement("UPDATE " + tabla + " SET ESTADO = ?, APROBADOR = ?, COMENTARIO_RESP = ?,"
                + " RESUELTO = ? WHERE ID = ?")) {
            ps.setString(1, aprobar ? "APROBADA" : "RECHAZADA");
            ps.setString(2, yo.usuario);
            ps.setString(3, comentario);
            ps.setTimestamp(4, Timestamp.valueOf(LocalDateTime.now()));
            ps.setInt(5, id);
            ps.executeUpdate();
        }
        Social.avisar(c, usuario, "gastos", clase, id, (nota ? "nota." : "viaje.") + (aprobar ? "aprobada" : "rechazada"),
                obj("quien", yo.nombre, "comentario", comentario), yo.nombre + (aprobar ? " ha aprobado " : " ha rechazado ")
                + (nota ? "tu nota de gasto" : "tu solicitud de viaje") + (comentario != null ? ": «" + comentario + "»" : "."));
        return api.emp(usuario).nombre;
    }
}
