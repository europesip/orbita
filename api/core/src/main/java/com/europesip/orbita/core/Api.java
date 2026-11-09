package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Operaciones de la suite (op=...: las rutas REST de orbita-api y las herramientas del MCP llegan aquí). Siempre en
 * nombre del usuario de DX que hace la petición; los permisos dependen de su rol y de quién tiene a su cargo.
 */
final class Api {

    /** Error para mostrar tal cual al usuario (validaciones, permisos). */
    static final class Aviso extends RuntimeException {
        private static final long serialVersionUID = 1L;
        Aviso(String msg) { super(msg); }
    }

    static final class Emp {
        String usuario, nombre, puesto, departamento, responsable, rol, pin, tarjeta;
        int diasVacaciones, diasPropios;
        Map<String, Object> json() {
            return obj("usuario", usuario, "nombre", nombre, "puesto", puesto, "departamento", departamento, "rol", rol);
        }
    }

    private static final class Marca {
        String tipo, modalidad, origen, incidencia;
        LocalDateTime momento;
        Double lat, lon;
        Integer precision;
        Map<String, Object> json() {
            Map<String, Object> j = obj("tipo", tipo, "hora", HM.format(momento), "modalidad", modalidad, "origen", origen,
                    "incidencia", incidencia);
            if (lat != null) j.put("geo", obj("lat", lat, "lon", lon, "precision", precision));
            return j;
        }
    }

    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");
    private static final List<String> TIPOS_MARCA = Arrays.asList("ENTRADA", "PAUSA", "REANUDAR", "SALIDA");
    /** Motivos de pausa; los retribuidos (médico, visita a cliente) cuentan como tiempo de trabajo. */
    static final List<String> INCIDENCIAS = Arrays.asList("DESAYUNO", "COMIDA", "MEDICO", "VISITA", "GESTION", "OTRA");
    static final List<String> RETRIBUIDAS = Arrays.asList("MEDICO", "VISITA");
    private static final List<String> TIPOS_AUSENCIA = Arrays.asList("VACACIONES", "ASUNTOS_PROPIOS", "PERMISO", "BAJA");

    private final Connection c;
    private final Map<String, Emp> plantilla = new LinkedHashMap<String, Emp>();
    private final Map<LocalDate, String> festivos = new TreeMap<LocalDate, String>();
    private final Emp yo;

    Api(Connection c, String usuario) throws SQLException {
        this.c = c;
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM EMPLEADO ORDER BY NOMBRE"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Emp e = new Emp();
                e.usuario = rs.getString("USUARIO");
                e.nombre = rs.getString("NOMBRE");
                e.puesto = rs.getString("PUESTO");
                e.departamento = rs.getString("DEPARTAMENTO");
                e.responsable = rs.getString("RESPONSABLE");
                e.rol = rs.getString("ROL");
                e.diasVacaciones = rs.getInt("DIAS_VACACIONES");
                e.diasPropios = rs.getInt("DIAS_PROPIOS");
                e.pin = rs.getString("PIN");
                e.tarjeta = rs.getString("TARJETA");
                plantilla.put(e.usuario, e);
            }
        }
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM FESTIVO ORDER BY FECHA"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) festivos.put(rs.getDate("FECHA").toLocalDate(), rs.getString("NOMBRE"));
        }
        yo = plantilla.get(usuario);
        if (yo == null) throw new Aviso("Tu usuario de DX (" + usuario + ") no tiene ficha de empleado en ÓRBITA.");
    }

    Object ejecutar(String op, Map<String, String> p) throws SQLException {
        switch (op) {
            case "yo": return yoJson();
            case "fichaje.estado": return fichajeEstado();
            case "fichaje.marcar": return marcar(p);
            case "fichaje.mes": return mes(entero(p, "anio"), entero(p, "mes"), p.get("usuario"));
            case "fichaje.correccion": return correccion(p);
            case "fichaje.equipo": return equipoAhora();
            case "fichaje.csv": return csv(entero(p, "anio"), entero(p, "mes"), p.get("ambito"));
            case "vac.resumen": return resumenVacaciones();
            case "vac.solicitar": return solicitar(p);
            case "vac.cancelar": return cancelar(entero(p, "id"));
            case "vac.calendario": return calendario(entero(p, "anio"), entero(p, "mes"));
            case "vac.anio": return anioAusencias(entero(p, "anio"));
            case "apr.pendientes": return pendientes();
            case "apr.resolver": return resolver(p.get("clase"), entero(p, "id"), p.get("decision"), p.get("comentario"));
            case "demo.reiniciar":
                if (!"RRHH".equals(yo.rol)) throw new Aviso("Solo RRHH puede restaurar los datos de demostración.");
                if (!Config.demo()) throw new Aviso("Esta instalación no tiene datos de demostración.");
                try {
                    Db.restaurar(c);
                } catch (SQLException e) {
                    throw e;
                } catch (Exception e) {
                    throw new SQLException(e);
                }
                return obj("ok", true, "mensaje", "Datos de demostración restaurados.");
            case "avisos.lista": return Social.avisos(c, yo.usuario);
            case "avisos.leer": return Social.leer(c, yo.usuario, p.get("id"));
            case "com.lista": return Social.comentarios(c, this, p.get("clase"), entero(p, "objeto"));
            case "com.enviar": return Social.comentar(c, this, p.get("clase"), entero(p, "objeto"), p.get("texto"));
            case "inicio.resumen": return inicio();
            default:
                if (op.startsWith("gastos.") || op.startsWith("viaje.")) return new Gastos(this, c).ejecutar(op, p);
                if (op.startsWith("encuestas.") || op.startsWith("pulso.")) return new Encuestas(this, c).ejecutar(op, p);
                if (op.startsWith("comunicados.") || op.startsWith("consultas.") || op.startsWith("faq.")
                        || op.equals("comunicacion.resumen")) {
                    return new Comunicacion(this, c).ejecutar(op, p);
                }
                if (op.startsWith("personas.") || op.startsWith("reconocimientos.")) return new Directorio(this, c).ejecutar(op, p);
                if (op.startsWith("docs.")) return new Documentos(this, c).ejecutar(op, p);
                throw new Aviso("Operación desconocida: " + op);
        }
    }

    Emp yo() { return yo; }

    Emp emp(String usuario) { return plantilla.get(usuario); }

    /** Toda la plantilla, en orden alfabético. */
    java.util.Collection<Emp> plantilla() { return plantilla.values(); }

    // ---------------------------------------------------------------- Personas

    private Map<String, Object> yoJson() throws SQLException {
        Emp resp = plantilla.get(yo.responsable);
        List<Object> fest = new ArrayList<Object>();
        for (Map.Entry<LocalDate, String> f : festivos.entrySet()) fest.add(obj("fecha", f.getKey().toString(), "nombre", f.getValue()));
        Map<String, Object> j = yo.json();
        j.put("responsable", resp == null ? null : resp.nombre);
        j.put("tieneEquipo", !aCargo().isEmpty());
        j.put("hoy", LocalDate.now().toString());
        j.put("festivos", fest);
        j.put("pendientes", contarPendientes());
        j.put("pin", yo.pin);
        j.put("tarjeta", yo.tarjeta);
        j.put("avisos", Social.avisos(c, yo.usuario).get("noLeidos"));
        return j;
    }

    /** Resumen para la página Mi intranet: fichaje, vacaciones, gastos, aprobaciones, equipo y avisos. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> inicio() throws SQLException {
        LocalDate hoy = LocalDate.now();
        // Horas de las últimas seis semanas (lunes a domingo) frente a la jornada teórica
        List<Object> semanas = new ArrayList<Object>();
        LocalDate lunes = Calendario.lunes(hoy).minusWeeks(5);
        Map<LocalDate, List<Marca>> dias = porDia(marcas(yo.usuario, lunes, hoy.plusDays(1)));
        Set<LocalDate> libres = diasAusencia(yo.usuario, lunes, hoy);
        LocalDateTime ahora = LocalDateTime.now();
        for (int s = 0; s < 6; s++) {
            LocalDate ini = lunes.plusWeeks(s);
            int min = 0, ob = 0;
            for (int i = 0; i < 7; i++) {
                LocalDate d = ini.plusDays(i);
                if (d.isAfter(hoy)) break;
                if (dias.containsKey(d)) min += trabajados(dias.get(d), d.equals(hoy) ? ahora : null);
                if (!libres.contains(d)) ob += Calendario.objetivo(d, festivos.keySet());
            }
            semanas.add(obj("lunes", ini.toString(), "minutos", min, "objetivo", ob));
        }
        // Quién falta en los próximos 14 días (aprobadas) de mi equipo
        List<Object> fuera = new ArrayList<Object>();
        for (Emp e : equipoCalendario()) {
            for (Map.Entry<LocalDate, String> a : ausenciasAprobadas(e.usuario, hoy, hoy.plusDays(13)).entrySet()) {
                fuera.add(obj("usuario", e.usuario, "nombre", e == yo ? "Yo" : e.nombre, "fecha", a.getKey().toString(), "tipo", a.getValue()));
            }
        }
        // Gastos del año por categoría
        Map<String, Integer> porCategoria = new LinkedHashMap<String, Integer>();
        try (PreparedStatement ps = c.prepareStatement("SELECT L.CATEGORIA, SUM(L.IMPORTE) FROM LINEA_GASTO L JOIN NOTA_GASTO N ON N.ID = L.NOTA"
                + " WHERE N.USUARIO = ? AND N.ESTADO IN ('ENVIADA','APROBADA','PAGADA') AND L.FECHA >= ? GROUP BY L.CATEGORIA")) {
            ps.setString(1, yo.usuario);
            ps.setDate(2, Date.valueOf(LocalDate.of(hoy.getYear(), 1, 1)));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) porCategoria.put(rs.getString(1), rs.getInt(2));
            }
        }
        List<Object> cats = new ArrayList<Object>();
        for (String[] k : Gastos.CATEGORIAS) if (porCategoria.containsKey(k[0])) cats.add(obj("id", k[0], "nombre", k[1], "importe", porCategoria.get(k[0])));
        Map<String, Object> gastos = (Map<String, Object>) new Gastos(this, c).ejecutar("gastos.resumen", new java.util.HashMap<String, String>());
        Map<String, Object> vac = resumenVacaciones();
        List<Map<String, Object>> pend = (List<Map<String, Object>>) pendientes().get("items");
        return obj("yo", yoJson(), "fichaje", fichajeEstado(), "semanas", semanas,
                "vacaciones", vac.get("vacaciones"), "propios", vac.get("propios"), "proxima", vac.get("proxima"),
                "gastos", gastos.get("kpi"), "gastosPorCategoria", cats,
                "pendientes", pend.subList(0, Math.min(4, pend.size())), "numPendientes", pend.size(),
                "fuera", fuera, "avisos", Social.avisos(c, yo.usuario), "comunicacion", new Comunicacion(this, c).resumen(),
                "personas", new Directorio(this, c).resumenInicio(), "documentos", documentosInicio());
    }

    /** Mis documentos en Mi intranet: lo nuevo, lo que falta por firmar y la última nómina (sin el año entero). */
    private Map<String, Object> documentosInicio() throws SQLException {
        Map<String, Object> r = new Documentos(this, c).resumen();
        r.remove("anio");
        return r;
    }

    /** Personas a cargo directo (RRHH ve a toda la plantilla). */
    private List<Emp> aCargo() {
        List<Emp> l = new ArrayList<Emp>();
        for (Emp e : plantilla.values()) {
            if (e == yo) continue;
            if (yo.usuario.equals(e.responsable) || "RRHH".equals(yo.rol)) l.add(e);
        }
        return l;
    }

    /** Equipo para el calendario: yo, mi responsable y mis compañeros, o mis personas a cargo. */
    private List<Emp> equipoCalendario() {
        List<Emp> l = new ArrayList<Emp>();
        l.add(yo);
        List<Emp> cargo = aCargo();
        if (!cargo.isEmpty()) {
            l.addAll(cargo);
            return l;
        }
        for (Emp e : plantilla.values()) {
            if (e == yo) continue;
            if (e.usuario.equals(yo.responsable) || (yo.responsable != null && yo.responsable.equals(e.responsable))) l.add(e);
        }
        return l;
    }

    private Emp visible(String usuario) {
        if (usuario == null || usuario.isEmpty() || usuario.equals(yo.usuario)) return yo;
        Emp e = plantilla.get(usuario);
        if (e == null || !aCargo().contains(e)) throw new Aviso("No tienes permiso para ver el registro de esa persona.");
        return e;
    }

    // ---------------------------------------------------------------- Fichaje

    private List<Marca> marcas(String usuario, LocalDate desde, LocalDate hastaExcl) throws SQLException {
        List<Marca> l = new ArrayList<Marca>();
        try (PreparedStatement ps = c.prepareStatement("SELECT TIPO, MOMENTO, MODALIDAD, ORIGEN, INCIDENCIA, LAT, LON, PRECISION_M"
                + " FROM FICHAJE WHERE USUARIO = ? AND MOMENTO >= ? AND MOMENTO < ? ORDER BY MOMENTO, ID")) {
            ps.setString(1, usuario);
            ps.setTimestamp(2, Timestamp.valueOf(desde.atStartOfDay()));
            ps.setTimestamp(3, Timestamp.valueOf(hastaExcl.atStartOfDay()));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Marca m = new Marca();
                    m.tipo = rs.getString(1);
                    m.momento = rs.getTimestamp(2).toLocalDateTime();
                    m.modalidad = rs.getString(3);
                    m.origen = rs.getString(4);
                    m.incidencia = rs.getString(5);
                    double lat = rs.getDouble(6);
                    if (!rs.wasNull()) {
                        m.lat = lat;
                        m.lon = rs.getDouble(7);
                        m.precision = rs.getInt(8);
                    }
                    l.add(m);
                }
            }
        }
        return l;
    }

    private static Map<LocalDate, List<Marca>> porDia(List<Marca> l) {
        Map<LocalDate, List<Marca>> m = new TreeMap<LocalDate, List<Marca>>();
        for (Marca x : l) {
            LocalDate d = x.momento.toLocalDate();
            if (!m.containsKey(d)) m.put(d, new ArrayList<Marca>());
            m.get(d).add(x);
        }
        return m;
    }

    private static boolean retribuida(Marca m) {
        return "PAUSA".equals(m.tipo) && RETRIBUIDAS.contains(m.incidencia);
    }

    /**
     * Minutos trabajados; si el tramo sigue abierto y se da "ahora", cuenta hasta ese momento. Una pausa con incidencia
     * retribuida (médico, visita a cliente) no interrumpe el tiempo de trabajo.
     */
    private static int trabajados(List<Marca> dia, LocalDateTime ahora) {
        long total = 0;
        LocalDateTime ini = null;
        for (Marca m : dia) {
            if ("ENTRADA".equals(m.tipo) || "REANUDAR".equals(m.tipo)) {
                if (ini == null) ini = m.momento;
            } else if (retribuida(m)) {
                continue;
            } else if (ini != null) {
                total += Duration.between(ini, m.momento).toMinutes();
                ini = null;
            }
        }
        if (ini != null && ahora != null) total += Duration.between(ini, ahora).toMinutes();
        return (int) Math.max(0, total);
    }

    /** Minutos de pausa no retribuida. */
    private static int pausas(List<Marca> dia) {
        long total = 0;
        LocalDateTime ini = null;
        for (Marca m : dia) {
            if ("PAUSA".equals(m.tipo)) ini = retribuida(m) ? null : m.momento;
            else if ("REANUDAR".equals(m.tipo) && ini != null) {
                total += Duration.between(ini, m.momento).toMinutes();
                ini = null;
            }
        }
        return (int) total;
    }

    /** Último motivo de pausa del día (si la persona está en pausa). */
    private static String incidenciaActual(List<Marca> dia) {
        if (dia.isEmpty() || !"PAUSA".equals(dia.get(dia.size() - 1).tipo)) return null;
        return dia.get(dia.size() - 1).incidencia;
    }

    private static String estado(List<Marca> dia) {
        if (dia.isEmpty()) return "FUERA";
        String t = dia.get(dia.size() - 1).tipo;
        return "SALIDA".equals(t) ? "FUERA" : "PAUSA".equals(t) ? "PAUSA" : "TRABAJANDO";
    }

    private static String primera(List<Marca> dia, String tipo) {
        for (Marca m : dia) if (tipo.equals(m.tipo)) return HM.format(m.momento);
        return null;
    }

    private static String ultima(List<Marca> dia, String tipo) {
        for (int i = dia.size() - 1; i >= 0; i--) if (tipo.equals(dia.get(i).tipo)) return HM.format(dia.get(i).momento);
        return null;
    }

    Map<String, Object> fichajeEstado() throws SQLException {
        LocalDate hoy = LocalDate.now();
        LocalDateTime ahora = LocalDateTime.now();
        List<Marca> dia = marcas(yo.usuario, hoy, hoy.plusDays(1));
        String est = estado(dia);
        List<Object> ev = new ArrayList<Object>();
        for (Marca m : dia) ev.add(m.json());

        LocalDate lunes = Calendario.lunes(hoy);
        Map<LocalDate, List<Marca>> sem = porDia(marcas(yo.usuario, lunes, lunes.plusDays(7)));
        Set<LocalDate> libres = diasAusencia(yo.usuario, lunes, lunes.plusDays(6));
        List<Object> semana = new ArrayList<Object>();
        int totSem = 0, objSem = 0;
        for (int i = 0; i < 5; i++) {
            LocalDate d = lunes.plusDays(i);
            List<Marca> m = sem.containsKey(d) ? sem.get(d) : Collections.<Marca>emptyList();
            int min = trabajados(m, d.equals(hoy) ? ahora : null);
            int ob = libres.contains(d) ? 0 : Calendario.objetivo(d, festivos.keySet());
            totSem += min;
            objSem += ob;
            semana.add(obj("fecha", d.toString(), "minutos", min, "objetivo", ob, "festivo", festivos.get(d), "ausencia", libres.contains(d)));
        }
        // Saldo del mes (bolsa de horas) e incidencias de fichaje sin resolver
        Map<String, Object> m = mes(hoy.getYear(), hoy.getMonthValue(), null);
        int incid = 0;
        for (Object o : (List<?>) m.get("dias")) {
            Map<?, ?> d = (Map<?, ?>) o;
            if (("INCOMPLETO".equals(d.get("estado")) || "SIN_FICHAJE".equals(d.get("estado"))) && !Boolean.TRUE.equals(d.get("correccionPendiente"))) incid++;
        }
        String inc = incidenciaActual(dia);
        return obj("estado", est,
                "desde", "TRABAJANDO".equals(est) ? primera(dia, "ENTRADA") : "PAUSA".equals(est) ? ultima(dia, "PAUSA") : null,
                "entrada", primera(dia, "ENTRADA"),
                "incidencia", inc, "cuenta", "TRABAJANDO".equals(est) || RETRIBUIDAS.contains(inc),
                "modalidad", dia.isEmpty() ? "OFICINA" : dia.get(dia.size() - 1).modalidad,
                "minutosHoy", trabajados(dia, ahora), "pausasHoy", pausas(dia), "objetivoHoy", Calendario.objetivo(hoy, festivos.keySet()),
                "marcas", ev, "semana", semana, "minutosSemana", totSem, "objetivoSemana", objSem,
                "saldoMes", (Integer) m.get("minutos") - (Integer) m.get("objetivoHastaHoy"), "incidenciasMes", incid,
                "ausenciaHoy", libres.contains(hoy), "festivoHoy", festivos.get(hoy));
    }

    private Map<String, Object> marcar(Map<String, String> p) throws SQLException {
        Double lat = null, lon = null;
        Integer prec = null;
        try {
            if (p.get("lat") != null && !p.get("lat").isEmpty()) {
                lat = Double.valueOf(p.get("lat"));
                lon = Double.valueOf(p.get("lon"));
                prec = (int) Math.round(Double.parseDouble(p.get("precision")));
            }
        } catch (NumberFormatException e) {
            lat = null;
            lon = null;
        }
        return marcar(p.get("tipo"), p.get("modalidad"), "WEB", p.get("incidencia"), lat, lon, prec);
    }

    /** Fichar ahora desde el quiosco (sin motivo ni ubicación del dispositivo). */
    Map<String, Object> marcar(String tipo, String modalidad, String origen) throws SQLException {
        return marcar(tipo, modalidad, origen, null, null, null, null);
    }

    /** Fichar ahora (origen WEB o KIOSCO), comprobando que la marca corresponde al estado actual. */
    private Map<String, Object> marcar(String tipo, String modalidad, String origen, String incidencia,
            Double lat, Double lon, Integer precision) throws SQLException {
        if (!TIPOS_MARCA.contains(tipo)) throw new Aviso("Tipo de fichaje no válido.");
        if (!"PAUSA".equals(tipo) || !INCIDENCIAS.contains(incidencia)) incidencia = "PAUSA".equals(tipo) ? "OTRA" : null;
        LocalDate hoy = LocalDate.now();
        List<Marca> deHoy = marcas(yo.usuario, hoy, hoy.plusDays(1));
        // Sin modalidad (p. ej. desde el asistente de IA), la pausa, la vuelta y la salida siguen la de la jornada
        if (modalidad == null && !"ENTRADA".equals(tipo) && !deHoy.isEmpty()) modalidad = deHoy.get(deHoy.size() - 1).modalidad;
        if (!"TELETRABAJO".equals(modalidad)) modalidad = "OFICINA";
        String est = estado(deHoy);
        boolean ok = ("FUERA".equals(est) && "ENTRADA".equals(tipo))
                || ("TRABAJANDO".equals(est) && ("PAUSA".equals(tipo) || "SALIDA".equals(tipo)))
                || ("PAUSA".equals(est) && ("REANUDAR".equals(tipo) || "SALIDA".equals(tipo)));
        if (!ok) throw new Aviso("Ese fichaje no corresponde a tu estado actual. Recarga la página.");
        insertarMarca(yo.usuario, tipo, LocalDateTime.now().withNano(0), modalidad, origen, incidencia, lat, lon, precision);
        return fichajeEstado();
    }

    private void insertarMarca(String usuario, String tipo, LocalDateTime momento, String modalidad, String origen) throws SQLException {
        insertarMarca(usuario, tipo, momento, modalidad, origen, null, null, null, null);
    }

    private void insertarMarca(String usuario, String tipo, LocalDateTime momento, String modalidad, String origen,
            String incidencia, Double lat, Double lon, Integer precision) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO FICHAJE (USUARIO, TIPO, MOMENTO, MODALIDAD, ORIGEN, CREADO,"
                + " INCIDENCIA, LAT, LON, PRECISION_M) VALUES (?,?,?,?,?,?,?,?,?,?)")) {
            ps.setString(1, usuario);
            ps.setString(2, tipo);
            ps.setTimestamp(3, Timestamp.valueOf(momento));
            ps.setString(4, modalidad);
            ps.setString(5, origen);
            ps.setTimestamp(6, Timestamp.valueOf(LocalDateTime.now()));
            ps.setString(7, incidencia);
            if (lat != null) {
                ps.setDouble(8, lat);
                ps.setDouble(9, lon);
                ps.setInt(10, precision == null ? 0 : precision);
            } else {
                ps.setNull(8, java.sql.Types.DOUBLE);
                ps.setNull(9, java.sql.Types.DOUBLE);
                ps.setNull(10, java.sql.Types.INTEGER);
            }
            ps.executeUpdate();
        }
    }

    private Map<String, Object> mes(int anio, int mes, String usuario) throws SQLException {
        Emp e = visible(usuario);
        LocalDate ini = LocalDate.of(anio, mes, 1), fin = ini.plusMonths(1);
        LocalDate hoy = LocalDate.now();
        LocalDateTime ahora = LocalDateTime.now();
        Map<LocalDate, List<Marca>> dias = porDia(marcas(e.usuario, ini, fin));
        Map<LocalDate, String> ausencias = ausenciasAprobadas(e.usuario, ini, fin.minusDays(1));
        Set<LocalDate> conCorreccion = new HashSet<LocalDate>();
        try (PreparedStatement ps = c.prepareStatement("SELECT FECHA FROM CORRECCION WHERE USUARIO = ? AND ESTADO = 'PENDIENTE'"
                + " AND FECHA >= ? AND FECHA < ?")) {
            ps.setString(1, e.usuario);
            ps.setDate(2, Date.valueOf(ini));
            ps.setDate(3, Date.valueOf(fin));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) conCorreccion.add(rs.getDate(1).toLocalDate());
            }
        }
        List<Object> lista = new ArrayList<Object>();
        int total = 0, objHoy = 0, objMes = 0;
        for (LocalDate d = ini; d.isBefore(fin); d = d.plusDays(1)) {
            List<Marca> m = dias.containsKey(d) ? dias.get(d) : Collections.<Marca>emptyList();
            String aus = ausencias.get(d);
            int ob = aus != null ? 0 : Calendario.objetivo(d, festivos.keySet());
            int min = trabajados(m, d.equals(hoy) ? ahora : null);
            String est;
            if (d.isAfter(hoy)) est = aus != null ? "AUSENCIA" : "FUTURO";
            else if (!m.isEmpty()) est = d.equals(hoy) ? "EN_CURSO" : "SALIDA".equals(m.get(m.size() - 1).tipo) ? "COMPLETO" : "INCOMPLETO";
            else if (festivos.containsKey(d)) est = "FESTIVO";
            else if (!Calendario.laborable(d, festivos.keySet())) est = "DESCANSO";
            else if (aus != null) est = "AUSENCIA";
            else est = d.equals(hoy) ? "EN_CURSO" : "SIN_FICHAJE";
            boolean corregido = false;
            List<Object> mj = new ArrayList<Object>();
            for (Marca x : m) {
                if ("CORRECCION".equals(x.origen)) corregido = true;
                mj.add(x.json());
            }
            total += min;
            objMes += ob;
            // Hoy solo cuenta en la jornada teórica cuando ya se ha fichado la salida
            boolean terminado = !m.isEmpty() && "SALIDA".equals(m.get(m.size() - 1).tipo);
            if (d.isBefore(hoy) || (d.equals(hoy) && terminado)) objHoy += ob;
            lista.add(obj("fecha", d.toString(), "estado", est, "festivo", festivos.get(d), "ausencia", aus,
                    "entrada", primera(m, "ENTRADA"), "salida", ultima(m, "SALIDA"), "pausas", pausas(m), "minutos", min,
                    "objetivo", ob, "modalidad", m.isEmpty() ? null : m.get(0).modalidad, "marcas", mj,
                    "corregido", corregido, "correccionPendiente", conCorreccion.contains(d)));
        }
        return obj("persona", e.json(), "anio", anio, "mes", mes, "dias", lista,
                "minutos", total, "objetivoHastaHoy", objHoy, "objetivoMes", objMes);
    }

    private Map<String, Object> correccion(Map<String, String> p) throws SQLException {
        LocalDate fecha = fecha(p.get("fecha"));
        String tipo = p.get("tipo");
        String motivo = texto(p.get("motivo"));
        if (fecha.isAfter(LocalDate.now())) throw new Aviso("Solo se pueden corregir días pasados o de hoy.");
        if (!TIPOS_MARCA.contains(tipo)) throw new Aviso("Indica qué marca falta o es incorrecta.");
        if (motivo == null) throw new Aviso("Explica el motivo de la corrección.");
        LocalTime hora;
        try {
            hora = LocalTime.parse(p.get("hora"));
        } catch (Exception e) {
            throw new Aviso("Indica la hora correcta (hh:mm).");
        }
        boolean auto = yo.responsable == null;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO CORRECCION (USUARIO, FECHA, TIPO, HORA, MOTIVO, ESTADO,"
                + " APROBADOR, CREADO, RESUELTO) VALUES (?,?,?,?,?,?,?,?,?)")) {
            ps.setString(1, yo.usuario);
            ps.setDate(2, Date.valueOf(fecha));
            ps.setString(3, tipo);
            ps.setTime(4, Time.valueOf(hora));
            ps.setString(5, motivo);
            ps.setString(6, auto ? "APROBADA" : "PENDIENTE");
            ps.setString(7, auto ? yo.usuario : null);
            ps.setTimestamp(8, Timestamp.valueOf(LocalDateTime.now()));
            ps.setTimestamp(9, auto ? Timestamp.valueOf(LocalDateTime.now()) : null);
            ps.executeUpdate();
        }
        if (auto) aplicarCorreccion(yo.usuario, fecha, tipo, hora);
        else Social.avisar(c, yo.responsable, "aprobaciones", "CORRECCION", null, "correccion.pedida",
                obj("quien", yo.nombre, "fecha", fecha.toString(), "tipo", tipo, "hora", hora.toString()),
                yo.nombre + " pide corregir su fichaje del " + corta(fecha) + " (" + tipo.toLowerCase() + " a las " + hora + ")");
        return obj("ok", true, "mensaje", auto ? "Corrección registrada." : "Corrección enviada a " + plantilla.get(yo.responsable).nombre + ".");
    }

    private void aplicarCorreccion(String usuario, LocalDate fecha, String tipo, LocalTime hora) throws SQLException {
        List<Marca> dia = marcas(usuario, fecha, fecha.plusDays(1));
        insertarMarca(usuario, tipo, fecha.atTime(hora), dia.isEmpty() ? "OFICINA" : dia.get(0).modalidad, "CORRECCION");
    }

    private List<Object> equipoAhora() throws SQLException {
        List<Emp> equipo = aCargo();
        if (equipo.isEmpty()) throw new Aviso("No tienes personas a tu cargo.");
        LocalDate hoy = LocalDate.now(), lunes = Calendario.lunes(hoy);
        LocalDateTime ahora = LocalDateTime.now();
        List<Object> l = new ArrayList<Object>();
        for (Emp e : equipo) {
            Map<LocalDate, List<Marca>> sem = porDia(marcas(e.usuario, lunes, hoy.plusDays(1)));
            List<Marca> dia = sem.containsKey(hoy) ? sem.get(hoy) : Collections.<Marca>emptyList();
            int semana = 0, objetivo = 0;
            Set<LocalDate> libres = diasAusencia(e.usuario, lunes, hoy);
            for (LocalDate d = lunes; !d.isAfter(hoy); d = d.plusDays(1)) {
                semana += trabajados(sem.containsKey(d) ? sem.get(d) : Collections.<Marca>emptyList(), d.equals(hoy) ? ahora : null);
                if (!libres.contains(d)) objetivo += Calendario.objetivo(d, festivos.keySet());
            }
            String est = libres.contains(hoy) ? "AUSENTE" : estado(dia);
            Map<String, Object> j = e.json();
            j.put("estado", est);
            j.put("desde", "TRABAJANDO".equals(est) ? primera(dia, "ENTRADA") : "PAUSA".equals(est) ? ultima(dia, "PAUSA")
                    : "FUERA".equals(est) ? ultima(dia, "SALIDA") : null);
            j.put("modalidad", dia.isEmpty() ? null : dia.get(dia.size() - 1).modalidad);
            j.put("incidencia", incidenciaActual(dia));
            j.put("minutosHoy", trabajados(dia, ahora));
            j.put("minutosSemana", semana);
            j.put("objetivoSemana", objetivo);
            l.add(j);
        }
        return l;
    }

    private static final String[] ESTADO_DIA = {"COMPLETO", "Completo", "INCOMPLETO", "Falta la salida", "SIN_FICHAJE",
        "Sin fichaje", "AUSENCIA", "Ausencia", "FESTIVO", "Festivo", "DESCANSO", "Descanso", "EN_CURSO", "En curso", "FUTURO", ""};

    @SuppressWarnings("unchecked")
    private Map<String, Object> csv(int anio, int mes, String ambito) throws SQLException {
        List<Emp> personas = new ArrayList<Emp>();
        if ("todos".equals(ambito)) {
            if (!"RRHH".equals(yo.rol)) throw new Aviso("Solo RRHH puede exportar el registro de toda la plantilla.");
            personas.addAll(plantilla.values());
        } else if ("equipo".equals(ambito)) {
            personas.addAll(aCargo());
        } else {
            personas.add(yo);
        }
        StringBuilder b = new StringBuilder("﻿Empleado;Usuario;Departamento;Fecha;Entrada;Salida;Pausas (min);"
                + "Tiempo trabajado;Jornada teórica;Modalidad;Estado;Observaciones\r\n");
        for (Emp e : personas) {
            Map<String, Object> m = mes(anio, mes, e == yo ? null : e.usuario);
            for (Object o : (List<Object>) m.get("dias")) {
                Map<String, Object> d = (Map<String, Object>) o;
                String est = (String) d.get("estado");
                if ("FUTURO".equals(est)) continue;
                String obs = d.get("festivo") != null ? (String) d.get("festivo") : d.get("ausencia") != null ? nombreAusencia((String) d.get("ausencia")) : "";
                if (Boolean.TRUE.equals(d.get("corregido"))) obs = (obs.isEmpty() ? "" : obs + ". ") + "Incluye corrección aprobada";
                String estTxt = est;
                for (int i = 0; i < ESTADO_DIA.length; i += 2) if (ESTADO_DIA[i].equals(est)) estTxt = ESTADO_DIA[i + 1];
                b.append(csvCampo(e.nombre)).append(';').append(e.usuario).append(';').append(csvCampo(e.departamento)).append(';')
                        .append(d.get("fecha")).append(';').append(nz(d.get("entrada"))).append(';').append(nz(d.get("salida"))).append(';')
                        .append(d.get("pausas")).append(';').append(hm((Integer) d.get("minutos"))).append(';')
                        .append(hm((Integer) d.get("objetivo"))).append(';')
                        .append(d.get("modalidad") == null ? "" : "TELETRABAJO".equals(d.get("modalidad")) ? "Teletrabajo" : "Oficina").append(';')
                        .append(estTxt).append(';').append(csvCampo(obs)).append("\r\n");
            }
        }
        String quien = "todos".equals(ambito) ? "plantilla" : "equipo".equals(ambito) ? "equipo" : yo.usuario;
        return obj("nombre", String.format("registro-jornada-%s-%d-%02d.csv", quien, anio, mes), "contenido", b.toString());
    }

    // ---------------------------------------------------------------- Vacaciones y ausencias

    private Map<LocalDate, String> ausenciasAprobadas(String usuario, LocalDate desde, LocalDate hasta) throws SQLException {
        Map<LocalDate, String> m = new TreeMap<LocalDate, String>();
        try (PreparedStatement ps = c.prepareStatement("SELECT TIPO, DESDE, HASTA FROM AUSENCIA WHERE USUARIO = ?"
                + " AND ESTADO = 'APROBADA' AND DESDE <= ? AND HASTA >= ?")) {
            ps.setString(1, usuario);
            ps.setDate(2, Date.valueOf(hasta));
            ps.setDate(3, Date.valueOf(desde));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    for (LocalDate d = rs.getDate(2).toLocalDate(); !d.isAfter(rs.getDate(3).toLocalDate()); d = d.plusDays(1)) {
                        if (!d.isBefore(desde) && !d.isAfter(hasta)) m.put(d, rs.getString(1));
                    }
                }
            }
        }
        return m;
    }

    private Set<LocalDate> diasAusencia(String usuario, LocalDate desde, LocalDate hasta) throws SQLException {
        return ausenciasAprobadas(usuario, desde, hasta).keySet();
    }

    /** [aprobados, pendientes] de un tipo con saldo en el año indicado. */
    private int[] consumidos(String usuario, String tipo, int anio) throws SQLException {
        int[] r = new int[2];
        try (PreparedStatement ps = c.prepareStatement("SELECT ESTADO, SUM(DIAS) FROM AUSENCIA WHERE USUARIO = ? AND TIPO = ?"
                + " AND DESDE >= ? AND DESDE < ? AND ESTADO IN ('APROBADA','PENDIENTE') GROUP BY ESTADO")) {
            ps.setString(1, usuario);
            ps.setString(2, tipo);
            ps.setDate(3, Date.valueOf(LocalDate.of(anio, 1, 1)));
            ps.setDate(4, Date.valueOf(LocalDate.of(anio + 1, 1, 1)));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) r["APROBADA".equals(rs.getString(1)) ? 0 : 1] = rs.getInt(2);
            }
        }
        return r;
    }

    private Map<String, Object> saldo(int total, int[] usados) {
        return obj("total", total, "aprobados", usados[0], "pendientes", usados[1], "disponibles", total - usados[0] - usados[1]);
    }

    private Map<String, Object> resumenVacaciones() throws SQLException {
        int anio = LocalDate.now().getYear();
        LocalDate hoy = LocalDate.now();
        List<Object> sol = new ArrayList<Object>();
        Map<String, Object> proxima = null;
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM AUSENCIA WHERE USUARIO = ? ORDER BY DESDE DESC")) {
            ps.setString(1, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> a = ausenciaJson(rs);
                    sol.add(a);
                    LocalDate desde = rs.getDate("DESDE").toLocalDate();
                    if ("APROBADA".equals(rs.getString("ESTADO")) && !rs.getDate("HASTA").toLocalDate().isBefore(hoy)) proxima = a;
                }
            }
        }
        Emp resp = plantilla.get(yo.responsable);
        Social.anotar(Social.contar(c), sol, "AUSENCIA");
        return obj("anio", anio,
                "vacaciones", saldo(yo.diasVacaciones, consumidos(yo.usuario, "VACACIONES", anio)),
                "propios", saldo(yo.diasPropios, consumidos(yo.usuario, "ASUNTOS_PROPIOS", anio)),
                "solicitudes", sol, "proxima", proxima, "aprobador", resp == null ? null : resp.nombre);
    }

    private Map<String, Object> ausenciaJson(ResultSet rs) throws SQLException {
        Emp aprob = plantilla.get(rs.getString("APROBADOR"));
        Timestamp res = rs.getTimestamp("RESUELTO");
        return obj("id", rs.getInt("ID"), "tipo", rs.getString("TIPO"), "desde", rs.getDate("DESDE").toString(),
                "hasta", rs.getDate("HASTA").toString(), "dias", rs.getInt("DIAS"), "estado", rs.getString("ESTADO"),
                "comentario", rs.getString("COMENTARIO"), "comentarioResp", rs.getString("COMENTARIO_RESP"),
                "aprobador", aprob == null ? null : aprob.nombre, "creado", rs.getTimestamp("CREADO").toLocalDateTime().toLocalDate().toString(),
                "resuelto", res == null ? null : res.toLocalDateTime().toLocalDate().toString());
    }

    private Map<String, Object> solicitar(Map<String, String> p) throws SQLException {
        String tipo = p.get("tipo");
        if (!TIPOS_AUSENCIA.contains(tipo)) throw new Aviso("Elige el tipo de ausencia.");
        LocalDate desde = fecha(p.get("desde")), hasta = fecha(p.get("hasta"));
        if (hasta.isBefore(desde)) throw new Aviso("La fecha de fin es anterior a la de inicio.");
        if (!"BAJA".equals(tipo) && desde.isBefore(LocalDate.now())) throw new Aviso("No se pueden pedir ausencias en fechas pasadas.");
        if (desde.getYear() != hasta.getYear()) throw new Aviso("Pide por separado los días de cada año.");
        int dias = Calendario.laborables(desde, hasta, festivos.keySet());
        if (dias == 0) throw new Aviso("En esas fechas no hay ningún día laborable.");
        try (PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM AUSENCIA WHERE USUARIO = ?"
                + " AND ESTADO IN ('APROBADA','PENDIENTE') AND DESDE <= ? AND HASTA >= ?")) {
            ps.setString(1, yo.usuario);
            ps.setDate(2, Date.valueOf(hasta));
            ps.setDate(3, Date.valueOf(desde));
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                if (rs.getInt(1) > 0) throw new Aviso("Ya tienes una ausencia pedida o aprobada en esas fechas.");
            }
        }
        if ("VACACIONES".equals(tipo) || "ASUNTOS_PROPIOS".equals(tipo)) {
            int total = "VACACIONES".equals(tipo) ? yo.diasVacaciones : yo.diasPropios;
            int[] u = consumidos(yo.usuario, tipo, desde.getYear());
            int disp = total - u[0] - u[1];
            if (dias > disp) throw new Aviso("Pides " + dias + " días y te quedan " + disp + " disponibles en " + desde.getYear() + ".");
        }
        boolean auto = yo.responsable == null || "BAJA".equals(tipo);
        int id;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO AUSENCIA (USUARIO, TIPO, DESDE, HASTA, DIAS, COMENTARIO,"
                + " ESTADO, APROBADOR, CREADO, RESUELTO) VALUES (?,?,?,?,?,?,?,?,?,?)", java.sql.Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, yo.usuario);
            ps.setString(2, tipo);
            ps.setDate(3, Date.valueOf(desde));
            ps.setDate(4, Date.valueOf(hasta));
            ps.setInt(5, dias);
            ps.setString(6, texto(p.get("comentario")));
            ps.setString(7, auto ? "APROBADA" : "PENDIENTE");
            ps.setString(8, auto ? (yo.responsable == null ? yo.usuario : yo.responsable) : null);
            ps.setTimestamp(9, Timestamp.valueOf(LocalDateTime.now()));
            ps.setTimestamp(10, auto ? Timestamp.valueOf(LocalDateTime.now()) : null);
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                id = k.getInt(1);
            }
        }
        String n = dias + (dias == 1 ? " día" : " días");
        if (!auto) Social.avisar(c, yo.responsable, "aprobaciones", "AUSENCIA", id, "ausencia.pedida",
                obj("quien", yo.nombre, "tipo", tipo, "dias", dias, "desde", desde.toString(), "hasta", hasta.toString()),
                yo.nombre + " ha pedido " + nombreAusencia(tipo).toLowerCase() + " (" + n + ", " + corta(desde) + (desde.equals(hasta) ? "" : " – " + corta(hasta)) + ")");
        Map<String, Object> r = resumenVacaciones();
        r.put("mensaje", auto ? "Ausencia registrada (" + n + ")." : "Solicitud de " + n + " enviada a "
                + plantilla.get(yo.responsable).nombre + ".");
        return r;
    }

    private Map<String, Object> cancelar(int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT ESTADO, DESDE FROM AUSENCIA WHERE ID = ? AND USUARIO = ?")) {
            ps.setInt(1, id);
            ps.setString(2, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Aviso("No existe esa solicitud.");
                boolean pendiente = "PENDIENTE".equals(rs.getString(1));
                boolean futura = "APROBADA".equals(rs.getString(1)) && rs.getDate(2).toLocalDate().isAfter(LocalDate.now());
                if (!pendiente && !futura) throw new Aviso("Solo se pueden cancelar solicitudes pendientes o ausencias que aún no han empezado.");
            }
        }
        try (PreparedStatement ps = c.prepareStatement("UPDATE AUSENCIA SET ESTADO = 'CANCELADA', RESUELTO = ? WHERE ID = ?")) {
            ps.setTimestamp(1, Timestamp.valueOf(LocalDateTime.now()));
            ps.setInt(2, id);
            ps.executeUpdate();
        }
        Map<String, Object> r = resumenVacaciones();
        r.put("mensaje", "Solicitud cancelada.");
        return r;
    }

    /** Año completo para «Mi año»: mis ausencias, festivos y quién del equipo falta cada día laborable. */
    private Map<String, Object> anioAusencias(int anio) throws SQLException {
        LocalDate ini = LocalDate.of(anio, 1, 1), fin = LocalDate.of(anio, 12, 31);
        List<Object> mias = new ArrayList<Object>();
        Map<String, List<Object>> equipo = new TreeMap<String, List<Object>>();
        for (Emp e : equipoCalendario()) {
            try (PreparedStatement ps = c.prepareStatement("SELECT * FROM AUSENCIA WHERE USUARIO = ?"
                    + " AND ESTADO IN ('APROBADA','PENDIENTE') AND DESDE <= ? AND HASTA >= ? ORDER BY DESDE")) {
                ps.setString(1, e.usuario);
                ps.setDate(2, Date.valueOf(fin));
                ps.setDate(3, Date.valueOf(ini));
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        if (e == yo) {
                            mias.add(ausenciaJson(rs));
                            continue;
                        }
                        String nombre = e.nombre.split(" ")[0];
                        for (LocalDate d = rs.getDate("DESDE").toLocalDate(); !d.isAfter(rs.getDate("HASTA").toLocalDate()); d = d.plusDays(1)) {
                            if (d.isBefore(ini) || d.isAfter(fin) || !Calendario.laborable(d, festivos.keySet())) continue;
                            String k = d.toString();
                            if (!equipo.containsKey(k)) equipo.put(k, new ArrayList<Object>());
                            equipo.get(k).add(obj("nombre", nombre, "tipo", rs.getString("TIPO"), "estado", rs.getString("ESTADO")));
                        }
                    }
                }
            }
        }
        List<Object> fest = new ArrayList<Object>();
        for (Map.Entry<LocalDate, String> f : festivos.entrySet()) {
            if (!f.getKey().isBefore(ini) && !f.getKey().isAfter(fin)) fest.add(obj("fecha", f.getKey().toString(), "nombre", f.getValue()));
        }
        return obj("anio", anio, "festivos", fest, "mias", mias, "equipo", equipo, "tamEquipo", equipoCalendario().size() - 1);
    }

    private Map<String, Object> calendario(int anio, int mes) throws SQLException {
        LocalDate ini = LocalDate.of(anio, mes, 1), fin = ini.plusMonths(1).minusDays(1);
        List<Object> personas = new ArrayList<Object>();
        for (Emp e : equipoCalendario()) {
            List<Object> aus = new ArrayList<Object>();
            try (PreparedStatement ps = c.prepareStatement("SELECT TIPO, DESDE, HASTA, ESTADO FROM AUSENCIA WHERE USUARIO = ?"
                    + " AND ESTADO IN ('APROBADA','PENDIENTE') AND DESDE <= ? AND HASTA >= ? ORDER BY DESDE")) {
                ps.setString(1, e.usuario);
                ps.setDate(2, Date.valueOf(fin));
                ps.setDate(3, Date.valueOf(ini));
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) aus.add(obj("tipo", rs.getString(1), "desde", rs.getDate(2).toString(),
                            "hasta", rs.getDate(3).toString(), "estado", rs.getString(4)));
                }
            }
            Map<String, Object> j = e.json();
            j.put("yo", e == yo);
            j.put("ausencias", aus);
            personas.add(j);
        }
        List<Object> fest = new ArrayList<Object>();
        for (Map.Entry<LocalDate, String> f : festivos.entrySet()) {
            if (!f.getKey().isBefore(ini) && !f.getKey().isAfter(fin)) fest.add(obj("fecha", f.getKey().toString(), "nombre", f.getValue()));
        }
        return obj("anio", anio, "mes", mes, "dias", fin.getDayOfMonth(), "festivos", fest, "personas", personas);
    }

    // ---------------------------------------------------------------- Aprobaciones

    /** Personas cuyas solicitudes aprueba el usuario: su equipo directo. */
    Set<String> aprueboA() {
        Set<String> s = new HashSet<String>();
        for (Emp e : plantilla.values()) if (yo.usuario.equals(e.responsable)) s.add(e.usuario);
        return s;
    }

    private int contarPendientes() throws SQLException {
        Set<String> equipo = aprueboA();
        if (equipo.isEmpty()) return 0;
        int n = 0;
        for (String tabla : new String[] {"AUSENCIA", "CORRECCION"}) {
            try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO FROM " + tabla + " WHERE ESTADO = 'PENDIENTE'");
                    ResultSet rs = ps.executeQuery()) {
                while (rs.next()) if (equipo.contains(rs.getString(1))) n++;
            }
        }
        return n + new Gastos(this, c).contarPendientes(equipo);
    }

    private Map<String, Object> pendientes() throws SQLException {
        Set<String> equipo = aprueboA();
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        List<Map<String, Object>> historial = new ArrayList<Map<String, Object>>();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM AUSENCIA WHERE ESTADO = 'PENDIENTE'"
                + " OR (APROBADOR = ? AND RESUELTO IS NOT NULL AND USUARIO <> ?) ORDER BY CREADO")) {
            ps.setString(1, yo.usuario);
            ps.setString(2, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String u = rs.getString("USUARIO");
                    if (!equipo.contains(u)) continue;
                    Emp e = plantilla.get(u);
                    Map<String, Object> j = ausenciaJson(rs);
                    j.put("clase", "AUSENCIA");
                    j.put("persona", e.json());
                    if (!"PENDIENTE".equals(rs.getString("ESTADO"))) {
                        historial.add(j);
                        continue;
                    }
                    LocalDate desde = rs.getDate("DESDE").toLocalDate(), hasta = rs.getDate("HASTA").toLocalDate();
                    j.put("coincidencias", coincidencias(e, desde, hasta));
                    if ("VACACIONES".equals(rs.getString("TIPO")) || "ASUNTOS_PROPIOS".equals(rs.getString("TIPO"))) {
                        int total = "VACACIONES".equals(rs.getString("TIPO")) ? e.diasVacaciones : e.diasPropios;
                        int[] usados = consumidos(u, rs.getString("TIPO"), desde.getYear());
                        j.put("saldoRestante", total - usados[0] - rs.getInt("DIAS"));
                    }
                    items.add(j);
                }
            }
        }
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM CORRECCION WHERE ESTADO = 'PENDIENTE'"
                + " OR (APROBADOR = ? AND RESUELTO IS NOT NULL AND USUARIO <> ?) ORDER BY CREADO")) {
            ps.setString(1, yo.usuario);
            ps.setString(2, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String u = rs.getString("USUARIO");
                    if (!equipo.contains(u)) continue;
                    LocalDate f = rs.getDate("FECHA").toLocalDate();
                    Timestamp res = rs.getTimestamp("RESUELTO");
                    Map<String, Object> j = obj("clase", "CORRECCION", "id", rs.getInt("ID"), "persona", plantilla.get(u).json(),
                            "fecha", f.toString(), "tipo", rs.getString("TIPO"), "hora", HM.format(rs.getTime("HORA").toLocalTime()),
                            "motivo", rs.getString("MOTIVO"), "estado", rs.getString("ESTADO"),
                            "comentarioResp", rs.getString("COMENTARIO"),
                            "creado", rs.getTimestamp("CREADO").toLocalDateTime().toLocalDate().toString(),
                            "resuelto", res == null ? null : res.toLocalDateTime().toLocalDate().toString());
                    if (!"PENDIENTE".equals(rs.getString("ESTADO"))) {
                        historial.add(j);
                        continue;
                    }
                    List<Marca> dia = marcas(u, f, f.plusDays(1));
                    List<Object> mj = new ArrayList<Object>();
                    for (Marca m : dia) mj.add(obj("tipo", m.tipo, "hora", HM.format(m.momento)));
                    j.put("marcas", mj);
                    items.add(j);
                }
            }
        }
        new Gastos(this, c).pendientes(equipo, items, historial);
        Social.anotar(Social.contar(c), items, null);
        Collections.sort(historial, (a, b) -> String.valueOf(b.get("resuelto")).compareTo(String.valueOf(a.get("resuelto"))));
        return obj("items", items, "historial", historial.subList(0, Math.min(15, historial.size())), "politica", Gastos.politica());
    }

    /** Compañeros del mismo equipo con ausencias aprobadas o pendientes que se solapan con esas fechas. */
    private List<Object> coincidencias(Emp e, LocalDate desde, LocalDate hasta) throws SQLException {
        List<Object> l = new ArrayList<Object>();
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, ESTADO, DESDE, HASTA FROM AUSENCIA WHERE USUARIO <> ?"
                + " AND ESTADO IN ('APROBADA','PENDIENTE') AND DESDE <= ? AND HASTA >= ?")) {
            ps.setString(1, e.usuario);
            ps.setDate(2, Date.valueOf(hasta));
            ps.setDate(3, Date.valueOf(desde));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Emp o = plantilla.get(rs.getString(1));
                    if (o == null || e.responsable == null || !(e.responsable.equals(o.responsable) || e.responsable.equals(o.usuario))) continue;
                    l.add(obj("nombre", o.nombre, "estado", rs.getString(2), "desde", rs.getDate(3).toString(), "hasta", rs.getDate(4).toString()));
                }
            }
        }
        return l;
    }

    private Map<String, Object> resolver(String clase, int id, String decision, String comentario) throws SQLException {
        boolean aprobar = "APROBAR".equals(decision);
        if (!aprobar && !"RECHAZAR".equals(decision)) throw new Aviso("Decisión no válida.");
        comentario = texto(comentario);
        if (!aprobar && comentario == null) throw new Aviso("Explica el motivo del rechazo.");
        if ("NOTA".equals(clase) || "VIAJE".equals(clase)) {
            String quien = new Gastos(this, c).resolver(clase, id, aprobar, comentario);
            Map<String, Object> r = pendientes();
            r.put("mensaje", (aprobar ? "Aprobada" : "Rechazada") + " la " + ("NOTA".equals(clase) ? "nota de gasto" : "solicitud de viaje")
                    + " de " + quien + ".");
            return r;
        }
        String tabla = "CORRECCION".equals(clase) ? "CORRECCION" : "AUSENCIA";
        String usuario, tipo = null;
        LocalDate fecha = null;
        LocalTime hora = null;
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM " + tabla + " WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Aviso("La solicitud ya no existe.");
                if (!"PENDIENTE".equals(rs.getString("ESTADO"))) throw new Aviso("La solicitud ya estaba resuelta.");
                usuario = rs.getString("USUARIO");
                if ("CORRECCION".equals(tabla)) {
                    tipo = rs.getString("TIPO");
                    fecha = rs.getDate("FECHA").toLocalDate();
                    hora = rs.getTime("HORA").toLocalTime();
                }
            }
        }
        if (!aprueboA().contains(usuario)) throw new Aviso("Esa solicitud no es de tu equipo.");
        try (PreparedStatement ps = c.prepareStatement("UPDATE " + tabla + " SET ESTADO = ?, APROBADOR = ?, "
                + ("CORRECCION".equals(tabla) ? "COMENTARIO" : "COMENTARIO_RESP") + " = ?, RESUELTO = ? WHERE ID = ?")) {
            ps.setString(1, aprobar ? "APROBADA" : "RECHAZADA");
            ps.setString(2, yo.usuario);
            ps.setString(3, comentario);
            ps.setTimestamp(4, Timestamp.valueOf(LocalDateTime.now()));
            ps.setInt(5, id);
            ps.executeUpdate();
        }
        if (aprobar && "CORRECCION".equals(tabla)) aplicarCorreccion(usuario, fecha, tipo, hora);
        String que = "CORRECCION".equals(tabla) ? "tu corrección de fichaje del " + corta(fecha) : "tu solicitud de ausencia";
        Social.avisar(c, usuario, Social.appDe(tabla), tabla, id,
                ("CORRECCION".equals(tabla) ? "correccion." : "ausencia.") + (aprobar ? "aprobada" : "rechazada"),
                obj("quien", yo.nombre, "fecha", fecha == null ? null : fecha.toString(), "comentario", comentario),
                yo.nombre + (aprobar ? " ha aprobado " : " ha rechazado ") + que
                + (comentario != null ? ": «" + comentario + "»" : "."));
        Map<String, Object> r = pendientes();
        r.put("mensaje", (aprobar ? "Aprobada" : "Rechazada") + " la solicitud de " + plantilla.get(usuario).nombre + ".");
        return r;
    }

    // ---------------------------------------------------------------- Utilidades

    private static String nombreAusencia(String tipo) {
        switch (tipo) {
            case "VACACIONES": return "Vacaciones";
            case "ASUNTOS_PROPIOS": return "Asuntos propios";
            case "PERMISO": return "Permiso retribuido";
            case "BAJA": return "Baja médica";
            default: return tipo;
        }
    }

    private static String hm(int min) {
        return String.format("%d:%02d", min / 60, min % 60);
    }

    private static String nz(Object o) {
        return o == null ? "" : o.toString();
    }

    private static String csvCampo(String s) {
        if (s == null) return "";
        return s.contains(";") || s.contains("\"") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
    }

    /** Fecha corta en español para los avisos: «4 dic». */
    static String corta(LocalDate d) {
        return d.format(DateTimeFormatter.ofPattern("d MMM", new java.util.Locale("es", "ES"))).replace(".", "");
    }

    static String texto(String s) {
        if (s == null) return null;
        s = s.trim();
        if (s.length() > 500) s = s.substring(0, 500);
        return s.isEmpty() ? null : s;
    }

    static int entero(Map<String, String> p, String k) {
        try {
            return Integer.parseInt(p.get(k));
        } catch (Exception e) {
            throw new Aviso("Falta el dato " + k + ".");
        }
    }

    static LocalDate fecha(String s) {
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new Aviso("Fecha no válida.");
        }
    }
}
