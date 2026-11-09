package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.MonthDay;
import java.time.Period;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Personas (op=personas.* / reconocimientos.*): el directorio de la plantilla.
 *
 *  - Directorio con buscador (nombre, puesto, departamento, sede, habilidades, idiomas) y la disponibilidad de hoy de
 *    cada persona: en la oficina, teletrabajando, en pausa, no disponible o fuera (con la fecha de vuelta).
 *  - Ficha de cada persona: contacto, sede, su línea de responsables, su equipo, sus compañeros, su perfil (sobre mí,
 *    habilidades, idiomas, cumpleaños si quiere mostrarlo) y los reconocimientos que ha recibido.
 *  - Organigrama: el árbol de responsables (EMPLEADO.RESPONSABLE).
 *  - Celebraciones: cumpleaños (solo los visibles), aniversarios en la empresa e incorporaciones.
 *  - Reconocimientos públicos entre compañeros, con un valor de la empresa.
 *
 * Privacidad: la disponibilidad no dice nunca el motivo de una pausa ni el tipo de una ausencia (una baja médica se ve
 * como «fuera», igual que unas vacaciones), ni horas de fichaje; eso sigue en Fichaje y Vacaciones para la persona, su
 * responsable y RRHH. Cada persona edita su perfil; RRHH edita los datos de organización y da de alta fichas nuevas.
 */
final class Directorio {

    static final List<String> VALORES = Arrays.asList("EQUIPO", "CLIENTE", "IDEA", "AYUDA", "LOGRO");
    private static final Map<String, String> NOMBRE_VALOR = Map.of("EQUIPO", "Trabajo en equipo", "CLIENTE", "Pasión por el cliente",
            "IDEA", "Gran idea", "AYUDA", "Siempre ayuda", "LOGRO", "Objetivo cumplido");
    static final List<String> ROLES = Arrays.asList("EMPLEADO", "RESPONSABLE", "RRHH", "ADMINISTRACION");
    static final int MAX_HABILIDADES = 15;
    /** Días hacia delante que cubren las celebraciones. */
    private static final int DIAS_CELEBRACIONES = 30;

    /** Columnas de contacto y perfil de la ficha (V4__personas.sql). */
    private static final class Perfil {
        String email, telefono, extension, sede, ubicacion, sobreMi, idiomas, cumple;
        List<String> habilidades = new ArrayList<>();
        LocalDate incorporacion;
        boolean cumpleVisible;
    }

    private final Api api;
    private final Connection c;
    private final Api.Emp yo;
    private Map<String, Perfil> perfiles;
    private Map<String, Map<String, Object>> presencias;
    private Set<LocalDate> festivos;

    Directorio(Api api, Connection c) {
        this.api = api;
        this.c = c;
        this.yo = api.yo();
    }

    Object ejecutar(String op, Map<String, String> p) throws SQLException {
        switch (op) {
            case "personas.directorio": return directorio(p.get("q"), p.get("departamento"));
            case "personas.ficha": return ficha(p.get("usuario"));
            case "personas.organigrama": return organigrama();
            case "personas.celebraciones": return obj("celebraciones", celebraciones(DIAS_CELEBRACIONES), "dias", DIAS_CELEBRACIONES);
            case "personas.perfil": return perfil(p);
            case "personas.alta": return alta(p);
            case "personas.editar": return editar(p);
            case "reconocimientos.lista": return reconocimientos(p.get("usuario"), p.get("valor"));
            case "reconocimientos.enviar": return reconocer(p);
            case "reconocimientos.borrar": return borrarReconocimiento(Api.entero(p, "id"));
            default: throw new Api.Aviso("Operación desconocida: " + op);
        }
    }

    private boolean rrhh() {
        return "RRHH".equals(yo.rol);
    }

    // ---------------------------------------------------------------- Datos

    private Map<String, Perfil> perfiles() throws SQLException {
        if (perfiles != null) return perfiles;
        perfiles = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, EMAIL, TELEFONO, EXTENSION, SEDE, UBICACION, INCORPORACION, SOBRE_MI,"
                + " HABILIDADES, IDIOMAS, CUMPLEANOS, CUMPLE_VISIBLE FROM EMPLEADO"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Perfil f = new Perfil();
                f.email = rs.getString(2);
                f.telefono = rs.getString(3);
                f.extension = rs.getString(4);
                f.sede = rs.getString(5);
                f.ubicacion = rs.getString(6);
                Date inc = rs.getDate(7);
                f.incorporacion = inc == null ? null : inc.toLocalDate();
                f.sobreMi = rs.getString(8);
                f.habilidades = lista(rs.getString(9));
                f.idiomas = rs.getString(10);
                f.cumple = rs.getString(11);
                f.cumpleVisible = rs.getInt(12) == 1;
                perfiles.put(rs.getString(1), f);
            }
        }
        return perfiles;
    }

    private Perfil perfil(String usuario) throws SQLException {
        Perfil f = perfiles().get(usuario);
        return f == null ? new Perfil() : f;
    }

    private Set<LocalDate> festivos() throws SQLException {
        if (festivos != null) return festivos;
        festivos = new HashSet<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT FECHA FROM FESTIVO"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) festivos.add(rs.getDate(1).toLocalDate());
        }
        return festivos;
    }

    /**
     * Disponibilidad de hoy de cada persona: {estado, vuelve, proxima}. estado: OFICINA o TELETRABAJO (trabajando),
     * PAUSA, FUERA (ha salido, aún no ha entrado o no es día laborable) o AUSENTE (ausencia aprobada hoy, con la fecha
     * de vuelta). proxima: la próxima ausencia aprobada en los dos meses siguientes (solo las fechas).
     */
    private Map<String, Map<String, Object>> presencias() throws SQLException {
        if (presencias != null) return presencias;
        presencias = new HashMap<>();
        LocalDate hoy = LocalDate.now();
        Map<String, String[]> ultima = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT DISTINCT ON (USUARIO) USUARIO, TIPO, MODALIDAD FROM FICHAJE"
                + " WHERE MOMENTO >= ? AND MOMENTO < ? ORDER BY USUARIO, MOMENTO DESC, ID DESC")) {
            ps.setTimestamp(1, Timestamp.valueOf(hoy.atStartOfDay()));
            ps.setTimestamp(2, Timestamp.valueOf(hoy.plusDays(1).atStartOfDay()));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) ultima.put(rs.getString(1), new String[] {rs.getString(2), rs.getString(3)});
            }
        }
        Map<String, LocalDate[]> hoyFuera = new HashMap<>(), proxima = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, DESDE, HASTA FROM AUSENCIA WHERE ESTADO = 'APROBADA'"
                + " AND HASTA >= ? AND DESDE <= ? ORDER BY DESDE")) {
            ps.setDate(1, Date.valueOf(hoy));
            ps.setDate(2, Date.valueOf(hoy.plusDays(60)));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    LocalDate[] r = {rs.getDate(2).toLocalDate(), rs.getDate(3).toLocalDate()};
                    if (!r[0].isAfter(hoy)) hoyFuera.merge(rs.getString(1), r, (a, b) -> b[1].isAfter(a[1]) ? b : a);
                    else proxima.putIfAbsent(rs.getString(1), r);
                }
            }
        }
        for (Api.Emp e : api.plantilla()) {
            String estado;
            LocalDate vuelve = null;
            if (hoyFuera.containsKey(e.usuario)) {
                estado = "AUSENTE";
                // Ausencias seguidas (vacaciones y después un permiso) se juntan para dar la vuelta real
                LocalDate fin = hoyFuera.get(e.usuario)[1];
                LocalDate[] sig = proxima.get(e.usuario);
                if (sig != null && !sig[0].isAfter(Calendario.laborableDesde(fin.plusDays(1), 0, festivos()))) {
                    fin = sig[1];
                    proxima.remove(e.usuario);
                }
                vuelve = Calendario.laborableDesde(fin.plusDays(1), 0, festivos());
            } else {
                String[] u = ultima.get(e.usuario);
                if (u == null || "SALIDA".equals(u[0])) estado = "FUERA";
                else if ("PAUSA".equals(u[0])) estado = "PAUSA";
                else estado = "TELETRABAJO".equals(u[1]) ? "TELETRABAJO" : "OFICINA";
            }
            LocalDate[] px = proxima.get(e.usuario);
            presencias.put(e.usuario, obj("estado", estado, "vuelve", vuelve == null ? null : vuelve.toString(),
                    "proxima", px == null ? null : obj("desde", px[0].toString(), "hasta", px[1].toString())));
        }
        return presencias;
    }

    /** Número de personas a cargo directo de cada responsable. */
    private Map<String, Integer> aCargo() {
        Map<String, Integer> m = new HashMap<>();
        for (Api.Emp e : api.plantilla()) if (e.responsable != null) m.merge(e.responsable, 1, Integer::sum);
        return m;
    }

    /** Lo que se ve de cada persona en el directorio y en el organigrama. */
    private Map<String, Object> resumen(Api.Emp e) throws SQLException {
        Perfil f = perfil(e.usuario);
        Api.Emp resp = e.responsable == null ? null : api.emp(e.responsable);
        return obj("usuario", e.usuario, "nombre", e.nombre, "puesto", e.puesto, "departamento", e.departamento, "rol", e.rol,
                "sede", f.sede, "ubicacion", f.ubicacion, "email", f.email, "telefono", f.telefono, "extension", f.extension,
                "responsable", resp == null ? null : obj("usuario", resp.usuario, "nombre", resp.nombre),
                "habilidades", f.habilidades, "aCargo", aCargo().getOrDefault(e.usuario, 0),
                "presencia", presencias().get(e.usuario), "yo", e == yo);
    }

    private Map<String, Object> mini(Api.Emp e) throws SQLException {
        return obj("usuario", e.usuario, "nombre", e.nombre, "puesto", e.puesto, "departamento", e.departamento,
                "presencia", presencias().get(e.usuario));
    }

    // ---------------------------------------------------------------- Directorio y ficha

    private Map<String, Object> directorio(String q, String departamento) throws SQLException {
        String[] palabras = plano(q).split("\\s+");
        List<Object> l = new ArrayList<>();
        Set<String> deps = new TreeSet<>(), sedes = new TreeSet<>();
        Map<String, Integer> estados = new LinkedHashMap<>();
        for (Api.Emp e : api.plantilla()) {
            Perfil f = perfil(e.usuario);
            if (e.departamento != null) deps.add(e.departamento);
            if (f.sede != null) sedes.add(f.sede);
            if (departamento != null && !departamento.isBlank() && !departamento.equals(e.departamento)) continue;
            String texto = plano(String.join(" ", nz(e.nombre), nz(e.puesto), nz(e.departamento), nz(f.sede), nz(f.email), nz(f.idiomas),
                    String.join(" ", f.habilidades), e.usuario));
            boolean ok = true;
            for (String w : palabras) if (!w.isEmpty() && !texto.contains(w)) ok = false;
            if (!ok) continue;
            Map<String, Object> r = resumen(e);
            estados.merge((String) ((Map<?, ?>) r.get("presencia")).get("estado"), 1, Integer::sum);
            l.add(r);
        }
        return obj("personas", l, "total", api.plantilla().size(), "departamentos", new ArrayList<>(deps), "sedes", new ArrayList<>(sedes),
                "estados", estados, "rrhh", rrhh(), "yo", yo.usuario, "roles", ROLES);
    }

    private Map<String, Object> ficha(String usuario) throws SQLException {
        Api.Emp e = usuario == null || usuario.isBlank() ? yo : api.emp(usuario.trim());
        if (e == null) throw new Api.Aviso("Esa persona no está en el directorio.");
        Perfil f = perfil(e.usuario);
        Map<String, Object> m = resumen(e);
        boolean mia = e == yo;
        m.put("sobreMi", f.sobreMi);
        m.put("idiomas", f.idiomas);
        m.put("incorporacion", f.incorporacion == null ? null : f.incorporacion.toString());
        m.put("antiguedad", f.incorporacion == null || f.incorporacion.isAfter(LocalDate.now()) ? null
                : Period.between(f.incorporacion, LocalDate.now()).getYears());
        // El cumpleaños (sin año) solo si la persona lo hace visible; ella siempre ve el suyo
        m.put("cumpleanos", f.cumpleVisible || mia ? f.cumple : null);
        if (mia) m.put("cumpleVisible", f.cumpleVisible);
        // Línea de responsables, de arriba abajo (sin repetir a nadie si hubiera un círculo en los datos)
        List<Object> cadena = new ArrayList<>();
        Set<String> vistos = new HashSet<>();
        vistos.add(e.usuario);
        for (Api.Emp r = api.emp(e.responsable); r != null && vistos.add(r.usuario); r = api.emp(r.responsable)) cadena.add(0, mini(r));
        m.put("cadena", cadena);
        List<Object> equipo = new ArrayList<>(), companeros = new ArrayList<>();
        for (Api.Emp x : api.plantilla()) {
            if (x == e) continue;
            if (e.usuario.equals(x.responsable)) equipo.add(mini(x));
            else if (e.responsable != null && e.responsable.equals(x.responsable)) companeros.add(mini(x));
        }
        m.put("equipo", equipo);
        m.put("companeros", companeros);
        m.put("reconocimientos", recibidos(e.usuario));
        m.put("editarPerfil", mia);
        m.put("editarRrhh", rrhh());
        if (rrhh()) m.put("rrhhDatos", obj("diasVacaciones", e.diasVacaciones, "diasPropios", e.diasPropios));
        return m;
    }

    // ---------------------------------------------------------------- Organigrama

    /** El árbol de responsables: quien no tiene responsable (o lo tiene fuera de la plantilla) está arriba. */
    private Map<String, Object> organigrama() throws SQLException {
        Map<String, List<Api.Emp>> hijos = new HashMap<>();
        List<Api.Emp> raices = new ArrayList<>();
        for (Api.Emp e : api.plantilla()) {
            if (e.responsable == null || api.emp(e.responsable) == null || e.responsable.equals(e.usuario)) raices.add(e);
            else hijos.computeIfAbsent(e.responsable, k -> new ArrayList<>()).add(e);
        }
        Set<String> vistos = new HashSet<>();
        List<Object> arbol = new ArrayList<>();
        for (Api.Emp r : raices) arbol.add(nodo(r, hijos, vistos));
        // Por si los datos tuvieran un círculo (A depende de B y B de A): nadie se queda fuera del organigrama
        for (Api.Emp e : api.plantilla()) if (!vistos.contains(e.usuario)) arbol.add(nodo(e, hijos, vistos));
        return obj("arbol", arbol, "total", api.plantilla().size(), "yo", yo.usuario, "cadena", cadenaDe(yo));
    }

    private Map<String, Object> nodo(Api.Emp e, Map<String, List<Api.Emp>> hijos, Set<String> vistos) throws SQLException {
        vistos.add(e.usuario);
        Map<String, Object> m = mini(e);
        m.put("sede", perfil(e.usuario).sede);
        List<Object> equipo = new ArrayList<>();
        for (Api.Emp h : hijos.getOrDefault(e.usuario, List.of())) if (!vistos.contains(h.usuario)) equipo.add(nodo(h, hijos, vistos));
        m.put("equipo", equipo);
        m.put("total", total(equipo));
        return m;
    }

    @SuppressWarnings("unchecked")
    private static int total(List<Object> equipo) {
        int n = equipo.size();
        for (Object o : equipo) n += (Integer) ((Map<String, Object>) o).get("total");
        return n;
    }

    /** uids desde lo más alto hasta la persona (para abrir el organigrama por su rama). */
    private List<String> cadenaDe(Api.Emp e) {
        List<String> l = new ArrayList<>();
        Set<String> vistos = new HashSet<>();
        for (Api.Emp r = e; r != null && vistos.add(r.usuario); r = api.emp(r.responsable)) l.add(0, r.usuario);
        return l;
    }

    // ---------------------------------------------------------------- Celebraciones

    /** Cumpleaños (solo los visibles), aniversarios en la empresa e incorporaciones de los próximos días, por fecha. */
    List<Object> celebraciones(int dias) throws SQLException {
        LocalDate hoy = LocalDate.now(), fin = hoy.plusDays(dias);
        List<Map<String, Object>> l = new ArrayList<>();
        for (Api.Emp e : api.plantilla()) {
            Perfil f = perfil(e.usuario);
            if (f.cumpleVisible && f.cumple != null) {
                LocalDate d = proxima(f.cumple, hoy);
                if (d != null && !d.isAfter(fin)) l.add(celebracion("CUMPLEANOS", e, d, null));
            }
            if (f.incorporacion != null) {
                LocalDate inc = f.incorporacion;
                if (!inc.isBefore(hoy.minusDays(45)) && !inc.isAfter(fin)) {
                    l.add(celebracion("INCORPORACION", e, inc, null));
                } else if (inc.isBefore(hoy)) {
                    LocalDate d = proxima(String.format("%02d-%02d", inc.getMonthValue(), inc.getDayOfMonth()), hoy);
                    int anios = d == null ? 0 : d.getYear() - inc.getYear();
                    if (d != null && anios >= 1 && !d.isAfter(fin)) l.add(celebracion("ANIVERSARIO", e, d, anios));
                }
            }
        }
        l.sort((a, b) -> ((String) a.get("fecha")).compareTo((String) b.get("fecha")));
        return new ArrayList<>(l);
    }

    private Map<String, Object> celebracion(String tipo, Api.Emp e, LocalDate d, Integer anios) throws SQLException {
        Map<String, Object> m = mini(e);
        m.put("tipo", tipo);
        m.put("fecha", d.toString());
        m.put("hoy", d.equals(LocalDate.now()));
        m.put("anios", anios);
        return m;
    }

    /** La próxima vez (hoy incluido) que llega el día MM-DD; el 29 de febrero se celebra el 28 los años no bisiestos. */
    private static LocalDate proxima(String mmdd, LocalDate hoy) {
        MonthDay md;
        try {
            md = MonthDay.parse("--" + mmdd);
        } catch (DateTimeException e) {
            return null;
        }
        LocalDate d = md.atYear(hoy.getYear());
        if (d.isBefore(hoy)) d = md.atYear(hoy.getYear() + 1);
        return d;
    }

    /** Para Mi intranet: celebraciones de las dos próximas semanas y el último reconocimiento recibido (30 días). */
    Map<String, Object> resumenInicio() throws SQLException {
        List<Object> cel = celebraciones(14);
        Map<String, Object> ultimo = null;
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM RECONOCIMIENTO WHERE PARA = ? AND CREADO >= ? ORDER BY CREADO DESC, ID DESC LIMIT 1")) {
            ps.setString(1, yo.usuario);
            ps.setTimestamp(2, Timestamp.valueOf(LocalDateTime.now().minusDays(30)));
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) ultimo = reconocimientoJson(rs);
            }
        }
        return obj("celebraciones", cel.subList(0, Math.min(5, cel.size())), "reconocimiento", ultimo);
    }

    // ---------------------------------------------------------------- Mi perfil

    /** Cada persona cambia su perfil; solo se tocan los campos que llegan. */
    private Map<String, Object> perfil(Map<String, String> p) throws SQLException {
        Map<String, Object> cambios = new LinkedHashMap<>();
        if (p.containsKey("telefono")) {
            String t = limpio(p.get("telefono"), 40);
            if (t != null && !t.matches("[+0-9 ().-]{3,40}")) throw new Api.Aviso("El teléfono solo puede llevar números, espacios, +, guiones y paréntesis.");
            cambios.put("TELEFONO", t);
        }
        if (p.containsKey("extension")) {
            String t = limpio(p.get("extension"), 12);
            if (t != null && !t.matches("[0-9]{1,8}")) throw new Api.Aviso("La extensión son de 1 a 8 cifras.");
            cambios.put("EXTENSION", t);
        }
        if (p.containsKey("ubicacion")) cambios.put("UBICACION", limpio(p.get("ubicacion"), 80));
        if (p.containsKey("sobreMi")) {
            String t = limpioLargo(p.get("sobreMi"), 600);
            cambios.put("SOBRE_MI", t);
        }
        if (p.containsKey("idiomas")) cambios.put("IDIOMAS", limpio(p.get("idiomas"), 200));
        if (p.containsKey("habilidades")) {
            List<String> h = habilidades(p.get("habilidades"));
            cambios.put("HABILIDADES", h.isEmpty() ? null : String.join(", ", h));
        }
        if (p.containsKey("cumpleanos")) {
            String t = limpio(p.get("cumpleanos"), 5);
            if (t != null) {
                try {
                    MonthDay.parse("--" + t);
                } catch (DateTimeException e) {
                    throw new Api.Aviso("Indica el cumpleaños como mes y día (MM-DD).");
                }
            }
            cambios.put("CUMPLEANOS", t);
        }
        if (p.containsKey("cumpleVisible")) cambios.put("CUMPLE_VISIBLE", si(p.get("cumpleVisible")) ? 1 : 0);
        if (cambios.isEmpty()) throw new Api.Aviso("No hay nada que cambiar.");
        actualizar(yo.usuario, cambios);
        perfiles = null;
        Map<String, Object> r = ficha(yo.usuario);
        r.put("mensaje", "Perfil actualizado.");
        return r;
    }

    /** "Java, SQL, java ,  Kubernetes" → [Java, SQL, Kubernetes]: sin repetir, como mucho 15 de 40 caracteres. */
    static List<String> habilidades(String s) {
        Map<String, String> m = new LinkedHashMap<>();
        for (String x : lista(s)) {
            if (x.length() > 40) throw new Api.Aviso("Cada habilidad puede tener como mucho 40 caracteres.");
            m.putIfAbsent(x.toLowerCase(Locale.ROOT), x);
        }
        if (m.size() > MAX_HABILIDADES) throw new Api.Aviso("Como mucho " + MAX_HABILIDADES + " habilidades: elige las más importantes.");
        return new ArrayList<>(m.values());
    }

    private static List<String> lista(String s) {
        List<String> l = new ArrayList<>();
        if (s == null) return l;
        for (String x : s.split("[,;\\n]")) {
            x = x.trim().replaceAll("\\s+", " ");
            if (!x.isEmpty()) l.add(x);
        }
        return l;
    }

    // ---------------------------------------------------------------- RRHH: alta y datos de organización

    /** RRHH da de alta la ficha de un usuario de DX que ya existe (sin ficha, DX lo deja entrar pero ÓRBITA no). */
    private Map<String, Object> alta(Map<String, String> p) throws SQLException {
        if (!rrhh()) throw new Api.Aviso("Solo RRHH puede dar de alta a una persona.");
        String uid = p.get("usuario") == null ? "" : p.get("usuario").trim();
        if (!uid.matches("[A-Za-z0-9._@-]{1,64}")) throw new Api.Aviso("Indica el usuario de DX de la persona (letras, números, punto, guion o @).");
        if (api.emp(uid) != null) throw new Api.Aviso("Ese usuario ya tiene ficha en ÓRBITA.");
        String nombre = limpio(p.get("nombre"), 120);
        if (nombre == null) throw new Api.Aviso("Escribe el nombre y los apellidos.");
        String departamento = limpio(p.get("departamento"), 80);
        if (departamento == null) throw new Api.Aviso("Indica el departamento.");
        String rol = p.get("rol") == null || p.get("rol").isBlank() ? "EMPLEADO" : p.get("rol");
        if (!ROLES.contains(rol)) throw new Api.Aviso("Rol no válido.");
        String responsable = limpio(p.get("responsable"), 64);
        if (responsable != null && api.emp(responsable) == null) throw new Api.Aviso("El responsable no está en el directorio.");
        String email = email(p.get("email"));
        LocalDate inc = p.get("incorporacion") == null || p.get("incorporacion").isBlank() ? LocalDate.now() : Api.fecha(p.get("incorporacion"));
        int vac = numero(p.get("diasVacaciones"), 22), propios = numero(p.get("diasPropios"), 2);
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO EMPLEADO (USUARIO, NOMBRE, PUESTO, DEPARTAMENTO, RESPONSABLE, ROL,"
                + " DIAS_VACACIONES, DIAS_PROPIOS, EMAIL, SEDE, INCORPORACION) VALUES (?,?,?,?,?,?,?,?,?,?,?)")) {
            ps.setString(1, uid);
            ps.setString(2, nombre);
            ps.setString(3, limpio(p.get("puesto"), 120));
            ps.setString(4, departamento);
            ps.setString(5, responsable);
            ps.setString(6, rol);
            ps.setInt(7, vac);
            ps.setInt(8, propios);
            ps.setString(9, email);
            ps.setString(10, limpio(p.get("sede"), 80));
            ps.setDate(11, Date.valueOf(inc));
            ps.executeUpdate();
        }
        if (responsable != null && !responsable.equals(yo.usuario)) {
            Social.avisar(c, responsable, "personas", "PERSONA", null, "persona.equipo", obj("quien", nombre),
                    nombre + " se incorpora a tu equipo.");
        }
        return obj("ok", true, "usuario", uid, "mensaje", "Ficha creada: " + nombre + " ya puede usar ÓRBITA con su usuario de DX.");
    }

    /** RRHH cambia los datos de organización de una persona (sin crear círculos en el organigrama). */
    private Map<String, Object> editar(Map<String, String> p) throws SQLException {
        if (!rrhh()) throw new Api.Aviso("Solo RRHH puede cambiar los datos de organización.");
        Api.Emp e = api.emp(p.get("usuario"));
        if (e == null) throw new Api.Aviso("Esa persona no está en el directorio.");
        Map<String, Object> cambios = new LinkedHashMap<>();
        if (p.containsKey("nombre")) {
            String n = limpio(p.get("nombre"), 120);
            if (n == null) throw new Api.Aviso("Escribe el nombre y los apellidos.");
            cambios.put("NOMBRE", n);
        }
        if (p.containsKey("puesto")) cambios.put("PUESTO", limpio(p.get("puesto"), 120));
        if (p.containsKey("departamento")) {
            String d = limpio(p.get("departamento"), 80);
            if (d == null) throw new Api.Aviso("Indica el departamento.");
            cambios.put("DEPARTAMENTO", d);
        }
        if (p.get("rol") != null && !p.get("rol").equals(e.rol)) {
            if (!ROLES.contains(p.get("rol"))) throw new Api.Aviso("Rol no válido.");
            if (e == yo) throw new Api.Aviso("No puedes cambiar tu propio rol: pídeselo a otra persona de RRHH.");
            cambios.put("ROL", p.get("rol"));
        }
        if (p.containsKey("email")) cambios.put("EMAIL", email(p.get("email")));
        if (p.containsKey("sede")) cambios.put("SEDE", limpio(p.get("sede"), 80));
        if (p.containsKey("ubicacion")) cambios.put("UBICACION", limpio(p.get("ubicacion"), 80));
        if (p.containsKey("incorporacion")) {
            String s = p.get("incorporacion");
            cambios.put("INCORPORACION", s == null || s.isBlank() ? null : Date.valueOf(Api.fecha(s)));
        }
        if (p.containsKey("diasVacaciones")) cambios.put("DIAS_VACACIONES", numero(p.get("diasVacaciones"), e.diasVacaciones));
        if (p.containsKey("diasPropios")) cambios.put("DIAS_PROPIOS", numero(p.get("diasPropios"), e.diasPropios));
        String nuevoResp = null;
        boolean cambiaResp = false;
        if (p.containsKey("responsable")) {
            nuevoResp = limpio(p.get("responsable"), 64);
            cambiaResp = nuevoResp == null ? e.responsable != null : !nuevoResp.equals(e.responsable);
            if (cambiaResp) {
                if (nuevoResp != null) {
                    if (api.emp(nuevoResp) == null) throw new Api.Aviso("El responsable no está en el directorio.");
                    if (nuevoResp.equals(e.usuario)) throw new Api.Aviso("Una persona no puede ser su propio responsable.");
                    Set<String> vistos = new HashSet<>();
                    for (Api.Emp r = api.emp(nuevoResp); r != null && vistos.add(r.usuario); r = api.emp(r.responsable)) {
                        if (r.usuario.equals(e.usuario)) {
                            throw new Api.Aviso("Ese cambio crearía un círculo en el organigrama: " + api.emp(nuevoResp).nombre
                                    + " depende de " + e.nombre + ".");
                        }
                    }
                }
                cambios.put("RESPONSABLE", nuevoResp);
            }
        }
        if (cambios.isEmpty()) throw new Api.Aviso("No hay nada que cambiar.");
        actualizar(e.usuario, cambios);
        if (cambiaResp) {
            Api.Emp nr = nuevoResp == null ? null : api.emp(nuevoResp);
            if (nr != null && nr != yo) {
                Social.avisar(c, nr.usuario, "personas", "PERSONA", null, "persona.equipo", obj("quien", e.nombre),
                        e.nombre + " pasa a tu equipo.");
            }
            if (e != yo) {
                Social.avisar(c, e.usuario, "personas", "PERSONA", null, nr == null ? "persona.sinresponsable" : "persona.responsable",
                        obj("quien", nr == null ? null : nr.nombre),
                        nr == null ? "Ya no tienes responsable en ÓRBITA: tus solicitudes se aprueban solas." : "Tu responsable ahora es " + nr.nombre + ".");
            }
        }
        return obj("ok", true, "usuario", e.usuario, "mensaje", "Datos de " + e.nombre + " guardados.");
    }

    private void actualizar(String usuario, Map<String, Object> cambios) throws SQLException {
        StringBuilder sql = new StringBuilder("UPDATE EMPLEADO SET ");
        int i = 0;
        for (String col : cambios.keySet()) sql.append(i++ == 0 ? "" : ", ").append(col).append(" = ?");
        sql.append(" WHERE USUARIO = ?");
        try (PreparedStatement ps = c.prepareStatement(sql.toString())) {
            i = 1;
            for (Object v : cambios.values()) {
                if (v instanceof Integer n) ps.setInt(i++, n);
                else if (v instanceof Date d) ps.setDate(i++, d);
                else if (v == null) ps.setNull(i++, java.sql.Types.VARCHAR);
                else ps.setString(i++, v.toString());
            }
            ps.setString(i, usuario);
            ps.executeUpdate();
        }
    }

    // ---------------------------------------------------------------- Reconocimientos

    private Map<String, Object> reconocimientoJson(ResultSet rs) throws SQLException {
        Api.Emp de = api.emp(rs.getString("DE")), para = api.emp(rs.getString("PARA"));
        return obj("id", rs.getInt("ID"), "valor", rs.getString("VALOR"), "texto", rs.getString("TEXTO"),
                "creado", rs.getTimestamp("CREADO").toLocalDateTime().withNano(0).toString(),
                "de", persona(de, rs.getString("DE")), "para", persona(para, rs.getString("PARA")),
                "puedeBorrar", yo.usuario.equals(rs.getString("DE")) || rrhh());
    }

    private static Map<String, Object> persona(Api.Emp e, String uid) {
        return e == null ? obj("usuario", uid, "nombre", uid, "puesto", null) : obj("usuario", e.usuario, "nombre", e.nombre, "puesto", e.puesto);
    }

    /** Los recibidos por una persona: total, por valor y los últimos. */
    private Map<String, Object> recibidos(String usuario) throws SQLException {
        Map<String, Integer> porValor = new LinkedHashMap<>();
        for (String v : VALORES) porValor.put(v, 0);
        int total = 0;
        try (PreparedStatement ps = c.prepareStatement("SELECT VALOR, COUNT(*) FROM RECONOCIMIENTO WHERE PARA = ? GROUP BY VALOR")) {
            ps.setString(1, usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    porValor.put(rs.getString(1), rs.getInt(2));
                    total += rs.getInt(2);
                }
            }
        }
        List<Object> ultimos = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM RECONOCIMIENTO WHERE PARA = ? ORDER BY CREADO DESC, ID DESC LIMIT 5")) {
            ps.setString(1, usuario);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) ultimos.add(reconocimientoJson(rs));
            }
        }
        return obj("total", total, "porValor", porValor, "ultimos", ultimos);
    }

    /** El muro de reconocimientos (los 50 últimos), de toda la plantilla o de una persona, y opcionalmente de un valor. */
    private Map<String, Object> reconocimientos(String usuario, String valor) throws SQLException {
        boolean dePersona = usuario != null && !usuario.isBlank();
        boolean deValor = valor != null && VALORES.contains(valor);
        List<Object> l = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT * FROM RECONOCIMIENTO WHERE (? = '' OR PARA = ?) AND (? = '' OR VALOR = ?)"
                + " ORDER BY CREADO DESC, ID DESC LIMIT 50")) {
            ps.setString(1, dePersona ? usuario : "");
            ps.setString(2, dePersona ? usuario : "");
            ps.setString(3, deValor ? valor : "");
            ps.setString(4, deValor ? valor : "");
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) l.add(reconocimientoJson(rs));
            }
        }
        int recibidos = 0, enviados = 0;
        try (PreparedStatement ps = c.prepareStatement("SELECT SUM(CASE WHEN PARA = ? THEN 1 ELSE 0 END), SUM(CASE WHEN DE = ? THEN 1 ELSE 0 END)"
                + " FROM RECONOCIMIENTO")) {
            ps.setString(1, yo.usuario);
            ps.setString(2, yo.usuario);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    recibidos = rs.getInt(1);
                    enviados = rs.getInt(2);
                }
            }
        }
        return obj("reconocimientos", l, "valores", VALORES, "recibidos", recibidos, "enviados", enviados);
    }

    private Map<String, Object> reconocer(Map<String, String> p) throws SQLException {
        Api.Emp para = api.emp(p.get("para") == null ? null : p.get("para").trim());
        if (para == null) throw new Api.Aviso("Elige a la persona a la que quieres reconocer.");
        if (para == yo) throw new Api.Aviso("Los reconocimientos son para los compañeros, no para uno mismo.");
        String valor = p.get("valor");
        if (!VALORES.contains(valor)) throw new Api.Aviso("Elige el motivo del reconocimiento.");
        String texto = limpioLargo(p.get("texto"), 300);
        if (texto == null) throw new Api.Aviso("Cuenta en una frase por qué le das las gracias.");
        int id;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO RECONOCIMIENTO (DE, PARA, VALOR, TEXTO, CREADO) VALUES (?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, yo.usuario);
            ps.setString(2, para.usuario);
            ps.setString(3, valor);
            ps.setString(4, texto);
            ps.setTimestamp(5, Timestamp.valueOf(LocalDateTime.now().withNano(0)));
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                id = k.getInt(1);
            }
        }
        String nombreValor = NOMBRE_VALOR.get(valor);
        Social.avisar(c, para.usuario, "personas", "RECONOCER", id, "reconocimiento.recibido", obj("quien", yo.nombre, "valor", valor),
                yo.nombre + " te ha hecho un reconocimiento: «" + nombreValor + "».");
        // Su responsable también se entera (si no es quien lo envía)
        if (para.responsable != null && !para.responsable.equals(yo.usuario)) {
            Social.avisar(c, para.responsable, "personas", "RECONOCER", id, "reconocimiento.equipo",
                    obj("quien", yo.nombre, "para", para.nombre, "valor", valor),
                    yo.nombre + " ha reconocido a " + para.nombre + " de tu equipo: «" + nombreValor + "».");
        }
        return obj("ok", true, "id", id, "mensaje", "Reconocimiento enviado a " + para.nombre + ".");
    }

    private Map<String, Object> borrarReconocimiento(int id) throws SQLException {
        String de;
        try (PreparedStatement ps = c.prepareStatement("SELECT DE FROM RECONOCIMIENTO WHERE ID = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso("El reconocimiento ya no existe.");
                de = rs.getString(1);
            }
        }
        if (!yo.usuario.equals(de) && !rrhh()) throw new Api.Aviso("Solo quien lo envió o RRHH pueden quitar un reconocimiento.");
        try (PreparedStatement ps = c.prepareStatement("DELETE FROM RECONOCIMIENTO WHERE ID = ?")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        }
        return obj("ok", true, "mensaje", "Reconocimiento eliminado.");
    }

    // ---------------------------------------------------------------- Ayudas

    /** Sin tildes ni mayúsculas, para buscar. */
    static String plano(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    /** Texto de una línea, recortado; null si queda vacío. */
    private static String limpio(String s, int max) {
        if (s == null) return null;
        s = s.trim().replaceAll("\\s+", " ");
        if (s.length() > max) s = s.substring(0, max).trim();
        return s.isEmpty() ? null : s;
    }

    /** Texto que puede tener varias líneas (sobre mí, reconocimientos). */
    private static String limpioLargo(String s, int max) {
        if (s == null) return null;
        s = s.trim().replaceAll("[ \\t]+", " ").replaceAll("\\n{3,}", "\n\n");
        if (s.length() > max) s = s.substring(0, max).trim();
        return s.isEmpty() ? null : s;
    }

    private static String email(String s) {
        String e = limpio(s, 160);
        if (e != null && !e.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw new Api.Aviso("El correo electrónico no es válido.");
        return e;
    }

    private static int numero(String s, int defecto) {
        if (s == null || s.isBlank()) return defecto;
        try {
            int n = Integer.parseInt(s.trim());
            if (n < 0 || n > 60) throw new Api.Aviso("Los días tienen que estar entre 0 y 60.");
            return n;
        } catch (NumberFormatException e) {
            throw new Api.Aviso("Los días tienen que ser un número.");
        }
    }

    private static boolean si(String s) {
        return "true".equalsIgnoreCase(s) || "1".equals(s) || "si".equalsIgnoreCase(s) || "sí".equalsIgnoreCase(s);
    }
}
