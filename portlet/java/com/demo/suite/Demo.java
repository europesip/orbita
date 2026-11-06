package com.demo.suite;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * Datos de demostración: una empresa con dos equipos (Ventas y Tecnología) y Dirección de Personas.
 * Las fechas son relativas al día de la carga, para que la demo esté siempre al día.
 */
final class Demo {

    private Demo() {}

    // usuario, nombre, puesto, departamento, responsable, rol
    private static final String[][] PLANTILLA = {
        {"wpsadmin", "Ana Torres", "Directora de Personas", "Personas", null, "RRHH"},
        {"carlos.ruiz", "Carlos Ruiz", "Responsable de Ventas", "Ventas", "wpsadmin", "RESPONSABLE"},
        {"lucia.martin", "Lucía Martín", "Comercial", "Ventas", "carlos.ruiz", "EMPLEADO"},
        {"javier.gomez", "Javier Gómez", "Comercial", "Ventas", "carlos.ruiz", "EMPLEADO"},
        {"marta.sanchez", "Marta Sánchez", "Responsable de Tecnología", "Tecnología", "wpsadmin", "RESPONSABLE"},
        {"david.lopez", "David López", "Desarrollador", "Tecnología", "marta.sanchez", "EMPLEADO"},
        {"elena.navarro", "Elena Navarro", "Diseñadora", "Tecnología", "marta.sanchez", "EMPLEADO"},
        {"pablo.diaz", "Pablo Díaz", "Técnico de soporte", "Tecnología", "marta.sanchez", "EMPLEADO"},
        {"rosa.molina", "Rosa Molina", "Responsable de Administración", "Administración", "wpsadmin", "ADMINISTRACION"},
    };

    // Festivos nacionales y Jueves Santo (festivo en casi todas las comunidades)
    private static final String[][] FESTIVOS = {
        {"2026-01-01", "Año Nuevo"}, {"2026-01-06", "Epifanía del Señor"}, {"2026-04-02", "Jueves Santo"},
        {"2026-04-03", "Viernes Santo"}, {"2026-05-01", "Fiesta del Trabajo"}, {"2026-08-15", "Asunción de la Virgen"},
        {"2026-10-12", "Fiesta Nacional de España"}, {"2026-11-01", "Todos los Santos"},
        {"2026-12-06", "Día de la Constitución"}, {"2026-12-08", "Inmaculada Concepción"}, {"2026-12-25", "Navidad"},
        {"2027-01-01", "Año Nuevo"}, {"2027-01-06", "Epifanía del Señor"}, {"2027-03-25", "Jueves Santo"},
        {"2027-03-26", "Viernes Santo"}, {"2027-05-01", "Fiesta del Trabajo"}, {"2027-08-15", "Asunción de la Virgen"},
        {"2027-10-12", "Fiesta Nacional de España"}, {"2027-11-01", "Todos los Santos"},
        {"2027-12-06", "Día de la Constitución"}, {"2027-12-08", "Inmaculada Concepción"}, {"2027-12-25", "Navidad"},
    };

    // Días de teletrabajo de cada persona
    private static final Map<String, Set<DayOfWeek>> TELETRABAJO = new HashMap<String, Set<DayOfWeek>>();
    static {
        TELETRABAJO.put("lucia.martin", EnumSet.of(DayOfWeek.FRIDAY));
        TELETRABAJO.put("javier.gomez", EnumSet.of(DayOfWeek.THURSDAY));
        TELETRABAJO.put("marta.sanchez", EnumSet.of(DayOfWeek.FRIDAY));
        TELETRABAJO.put("david.lopez", EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.FRIDAY));
        TELETRABAJO.put("elena.navarro", EnumSet.of(DayOfWeek.WEDNESDAY));
    }

    static void cargar(Connection c) throws SQLException {
        LocalDate hoy = LocalDate.now();
        Set<LocalDate> festivos = new HashSet<LocalDate>();

        // PIN del quiosco y tarjeta (código QR) de cada persona
        String[] pines = {"1000", "2001", "1111", "2222", "3001", "3333", "4444", "5555", "6001"};
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO EMPLEADO VALUES (?,?,?,?,?,?,22,2,?,?)")) {
            for (int n = 0; n < PLANTILLA.length; n++) {
                String[] e = PLANTILLA[n];
                for (int i = 0; i < 6; i++) ps.setString(i + 1, e[i]);
                ps.setString(7, pines[n]);
                ps.setString(8, "SI-" + e[0].toUpperCase().replace(".", "-"));
                ps.addBatch();
            }
            ps.executeBatch();
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO FESTIVO VALUES (?,?)")) {
            for (String[] f : FESTIVOS) {
                LocalDate d = LocalDate.parse(f[0]);
                festivos.add(d);
                ps.setDate(1, Date.valueOf(d));
                ps.setString(2, f[1]);
                ps.addBatch();
            }
            ps.executeBatch();
        }

        // Ausencias (relativas al lunes de esta semana)
        LocalDate l = Calendario.lunes(hoy);
        Map<String, List<LocalDate[]>> libres = new HashMap<String, List<LocalDate[]>>();
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO AUSENCIA (USUARIO, TIPO, DESDE, HASTA, DIAS, COMENTARIO,"
                + " ESTADO, APROBADOR, COMENTARIO_RESP, CREADO, RESUELTO) VALUES (?,?,?,?,?,?,?,?,?,?,?)")) {
            ausencia(ps, libres, festivos, "lucia.martin", "VACACIONES", l.minusDays(63), l.minusDays(52), "APROBADA", "Vacaciones de verano", null);
            ausencia(ps, libres, festivos, "lucia.martin", "VACACIONES", l.plusDays(42), l.plusDays(46), "PENDIENTE", "Viaje familiar", null);
            ausencia(ps, libres, festivos, "javier.gomez", "VACACIONES", l.plusDays(14), l.plusDays(18), "APROBADA", null, null);
            ausencia(ps, libres, festivos, "javier.gomez", "VACACIONES", l.plusDays(44), l.plusDays(46), "PENDIENTE", "Puente con la familia", null);
            ausencia(ps, libres, festivos, "david.lopez", "VACACIONES", l.minusDays(28), l.minusDays(25), "APROBADA", null, null);
            ausencia(ps, libres, festivos, "david.lopez", "VACACIONES", l.plusDays(21), l.plusDays(25), "PENDIENTE", null, null);
            ausencia(ps, libres, festivos, "elena.navarro", "VACACIONES", l.plusDays(14), l.plusDays(18), "RECHAZADA", null,
                    "Coincide con la entrega del proyecto. ¿Podemos moverlo una semana?");
            ausencia(ps, libres, festivos, "elena.navarro", "VACACIONES", l.plusDays(49), l.plusDays(51), "APROBADA", null, null);
            LocalDate propio = Calendario.laborableDesde(hoy, 2, festivos);
            ausencia(ps, libres, festivos, "pablo.diaz", "ASUNTOS_PROPIOS", propio, propio, "APROBADA", "Gestiones personales", null);
            ausencia(ps, libres, festivos, "carlos.ruiz", "VACACIONES", l.minusDays(49), l.minusDays(45), "APROBADA", null, null);
            ausencia(ps, libres, festivos, "carlos.ruiz", "VACACIONES", l.plusDays(56), l.plusDays(60), "PENDIENTE", "Vacaciones de invierno", null);
            ausencia(ps, libres, festivos, "marta.sanchez", "VACACIONES", l.minusDays(84), l.minusDays(73), "APROBADA", null, null);
            ps.executeBatch();
        }

        // Fichajes de las últimas siete semanas; Lucía y Javier tienen un día sin fichar la salida
        LocalDate sinSalidaLucia = laborableAntes(hoy, 5, festivos);
        LocalDate sinSalidaJavier = laborableAntes(hoy, 3, festivos);
        // Incidencias retribuidas: Lucía fue al médico y Javier visitó a un cliente (cuentan como tiempo de trabajo)
        LocalDate medicoLucia = laborableAntes(hoy, 2, festivos);
        LocalDate visitaJavier = laborableAntes(hoy, 1, festivos);
        Random r = new Random(7);
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO FICHAJE (USUARIO, TIPO, MOMENTO, MODALIDAD, ORIGEN, CREADO,"
                + " INCIDENCIA, LAT, LON, PRECISION_M) VALUES (?,?,?,?,'WEB',?,?,?,?,?)")) {
            LocalDateTime ahora = LocalDateTime.now();
            for (String[] e : PLANTILLA) {
                String u = e[0];
                for (LocalDate d = hoy.minusDays(49); !d.isAfter(hoy); d = d.plusDays(1)) {
                    if (!Calendario.laborable(d, festivos) || libre(libres.get(u), d)) continue;
                    String mod = TELETRABAJO.containsKey(u) && TELETRABAJO.get(u).contains(d.getDayOfWeek()) ? "TELETRABAJO" : "OFICINA";
                    LocalDateTime entrada = d.atTime("pablo.diaz".equals(u) ? 7 : 8, 0).plusMinutes(r.nextInt(70));
                    boolean viernes = d.getDayOfWeek() == DayOfWeek.FRIDAY;
                    LocalDateTime pausa = d.atTime(14, 0).plusMinutes(r.nextInt(30));
                    int minPausa = 30 + r.nextInt(35);
                    int trabajo = (viernes ? 420 : 480) + r.nextInt(50) - 15;
                    LocalDateTime salida = entrada.plusMinutes(trabajo + (viernes ? 0 : minPausa));
                    if (d.equals(hoy)) {
                        // Hoy, hasta la hora de la carga: Lucía y Elena todavía no han fichado; Pablo sigue en su pausa
                        // (salvo que la demo se cargue por la tarde)
                        if ("lucia.martin".equals(u) || "elena.navarro".equals(u)) continue;
                        if (entrada.isBefore(ahora)) marca(ps, u, "ENTRADA", entrada, mod);
                        if (!viernes && pausa.isBefore(ahora)) marca(ps, u, "PAUSA", pausa, mod, "COMIDA");
                        if ("pablo.diaz".equals(u) && ahora.getHour() < 17) continue;
                        if (!viernes && pausa.plusMinutes(minPausa).isBefore(ahora)) marca(ps, u, "REANUDAR", pausa.plusMinutes(minPausa), mod);
                        if (salida.isBefore(ahora)) marca(ps, u, "SALIDA", salida, mod);
                        continue;
                    }
                    marca(ps, u, "ENTRADA", entrada, mod);
                    if ("lucia.martin".equals(u) && d.equals(medicoLucia)) {
                        marca(ps, u, "PAUSA", d.atTime(11, 10), mod, "MEDICO");
                        marca(ps, u, "REANUDAR", d.atTime(12, 35), mod);
                    } else if ("javier.gomez".equals(u) && d.equals(visitaJavier)) {
                        marca(ps, u, "PAUSA", d.atTime(10, 30), mod, "VISITA");
                        marca(ps, u, "REANUDAR", d.atTime(13, 15), mod);
                    } else if (r.nextInt(5) < 2) {
                        // Desayuno de 15-20 minutos (no retribuido: se recupera al final del día)
                        LocalDateTime cafe = d.atTime(10, 20).plusMinutes(r.nextInt(30));
                        int minCafe = 15 + r.nextInt(6);
                        marca(ps, u, "PAUSA", cafe, mod, "DESAYUNO");
                        marca(ps, u, "REANUDAR", cafe.plusMinutes(minCafe), mod);
                        salida = salida.plusMinutes(minCafe);
                    }
                    if (!viernes) {
                        marca(ps, u, "PAUSA", pausa, mod, "COMIDA");
                        marca(ps, u, "REANUDAR", pausa.plusMinutes(minPausa), mod);
                    }
                    boolean olvido = ("lucia.martin".equals(u) && d.equals(sinSalidaLucia)) || ("javier.gomez".equals(u) && d.equals(sinSalidaJavier));
                    if (!olvido) marca(ps, u, "SALIDA", salida, mod);
                }
            }
            ps.executeBatch();
        }

        // Javier ya ha pedido la corrección de su olvido: espera a Carlos en Aprobaciones
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO CORRECCION (USUARIO, FECHA, TIPO, HORA, MOTIVO, ESTADO, CREADO)"
                + " VALUES ('javier.gomez', ?, 'SALIDA', ?, ?, 'PENDIENTE', ?)")) {
            ps.setDate(1, Date.valueOf(sinSalidaJavier));
            ps.setTime(2, Time.valueOf(LocalTime.of(18, 5)));
            ps.setString(3, "Se me olvidó fichar la salida al terminar la visita a un cliente.");
            ps.setTimestamp(4, Timestamp.valueOf(sinSalidaJavier.plusDays(1).atTime(9, 12)));
            ps.executeUpdate();
        }

        gastos(c, hoy, festivos);
        social(c);
    }

    /** Una conversación en curso y avisos iniciales, para que la demo no empiece con la campana vacía. */
    private static void social(Connection c) throws SQLException {
        Integer notaJavier = null, viajeJavier = null, vacLucia = null;
        try (PreparedStatement ps = c.prepareStatement("SELECT ID FROM NOTA_GASTO WHERE USUARIO = 'javier.gomez' AND ESTADO = 'ENVIADA'");
                java.sql.ResultSet rs = ps.executeQuery()) {
            if (rs.next()) notaJavier = rs.getInt(1);
        }
        try (PreparedStatement ps = c.prepareStatement("SELECT ID FROM VIAJE WHERE USUARIO = 'javier.gomez' AND ESTADO = 'PENDIENTE'");
                java.sql.ResultSet rs = ps.executeQuery()) {
            if (rs.next()) viajeJavier = rs.getInt(1);
        }
        try (PreparedStatement ps = c.prepareStatement("SELECT ID FROM AUSENCIA WHERE USUARIO = 'lucia.martin' AND ESTADO = 'PENDIENTE'");
                java.sql.ResultSet rs = ps.executeQuery()) {
            if (rs.next()) vacLucia = rs.getInt(1);
        }
        LocalDateTime ayer = LocalDateTime.now().minusDays(1).withHour(10).withMinute(5).withSecond(0).withNano(0);
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO COMENTARIO (CLASE, OBJETO, USUARIO, TEXTO, CREADO) VALUES (?,?,?,?,?)")) {
            if (notaJavier != null) {
                comentario(ps, "NOTA", notaJavier, "carlos.ruiz", "Javier, ¿el parking de Toledo fue durante la visita a Ferretería Tajo? Para imputarlo al cliente.", ayer);
                comentario(ps, "NOTA", notaJavier, "javier.gomez", "Sí, aparqué allí toda la mañana mientras estaba con ellos.", ayer.plusMinutes(40));
            }
            if (vacLucia != null) {
                comentario(ps, "AUSENCIA", vacLucia, "lucia.martin", "Si hace falta cubrir algo esa semana, lo dejo preparado con Javier.", ayer.plusHours(2));
            }
            ps.executeBatch();
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO AVISO (USUARIO, APP, CLASE, OBJETO, TEXTO, LEIDO, CREADO) VALUES (?,?,?,?,?,?,?)")) {
            aviso(ps, "carlos.ruiz", "aprobaciones", "NOTA", notaJavier, "Javier Gómez ha enviado la nota de gasto «Visitas a clientes en Toledo y Guadalajara» (94,26 €)", 0, ayer.minusHours(1));
            aviso(ps, "carlos.ruiz", "aprobaciones", "NOTA", notaJavier, "Javier Gómez ha comentado su solicitud: «Sí, aparqué allí toda la mañana mientras estaba con ellos.»", 0, ayer.plusMinutes(40));
            aviso(ps, "carlos.ruiz", "aprobaciones", "VIAJE", viajeJavier, "Javier Gómez ha pedido un viaje a Barcelona", 0, ayer.plusHours(1));
            aviso(ps, "carlos.ruiz", "aprobaciones", "AUSENCIA", vacLucia, "Lucía Martín ha comentado su solicitud: «Si hace falta cubrir algo esa semana, lo dejo preparado con Javier.»", 0, ayer.plusHours(2));
            aviso(ps, "lucia.martin", "gastos", "NOTA", null, "Administración ha pagado tu nota «Visita a clientes en Valencia» (210,20 €)", 1, ayer.minusDays(5));
            aviso(ps, "lucia.martin", "vacaciones", "AUSENCIA", null, "Recuerda: te quedan días de vacaciones por pedir este año.", 0, ayer);
            aviso(ps, "javier.gomez", "gastos", "NOTA", notaJavier, "Carlos Ruiz ha comentado tu solicitud: «Javier, ¿el parking de Toledo fue durante la visita a Ferretería Tajo?…»", 1, ayer);
            aviso(ps, "rosa.molina", "gastos", "NOTA", null, "Hay notas de gasto aprobadas pendientes de pago.", 0, ayer);
            ps.executeBatch();
        }
    }

    private static void comentario(PreparedStatement ps, String clase, int objeto, String u, String texto, LocalDateTime cuando) throws SQLException {
        ps.setString(1, clase);
        ps.setInt(2, objeto);
        ps.setString(3, u);
        ps.setString(4, texto);
        ps.setTimestamp(5, Timestamp.valueOf(cuando));
        ps.addBatch();
    }

    private static void aviso(PreparedStatement ps, String u, String app, String clase, Integer objeto, String texto, int leido,
            LocalDateTime cuando) throws SQLException {
        ps.setString(1, u);
        ps.setString(2, app);
        ps.setString(3, clase);
        if (objeto == null) ps.setNull(4, java.sql.Types.INTEGER); else ps.setInt(4, objeto);
        ps.setString(5, texto);
        ps.setInt(6, leido);
        ps.setTimestamp(7, Timestamp.valueOf(cuando));
        ps.addBatch();
    }

    // ---------------------------------------------------------------- Gastos y viajes

    /** Notas de gasto en todos los estados (con tickets dibujados), dos viajes y uno pendiente de aprobar. */
    private static void gastos(Connection c, LocalDate hoy, Set<LocalDate> festivos) throws SQLException {
        LocalDate d17 = laborableAntes(hoy, 17, festivos), d16 = laborableAntes(hoy, 16, festivos);
        int valencia = viaje(c, "lucia.martin", "Valencia", "Visita a clientes de la zona de Levante", d17, d16, 35000, "APROBADA",
                d17.minusDays(7));
        LocalDate bcn = Calendario.laborableDesde(hoy, 8, festivos);
        viaje(c, "javier.gomez", "Barcelona", "Reunión con el distribuidor de Cataluña para cerrar el acuerdo anual", bcn, bcn.plusDays(1),
                45000, "PENDIENTE", hoy.minusDays(1));
        LocalDate d12 = laborableAntes(hoy, 12, festivos);
        int curso = viaje(c, "david.lopez", "Madrid · Curso AWS", "Curso oficial de arquitectura en AWS (2 días)", d12, d12, 6000, "APROBADA",
                d12.minusDays(10));

        int n = nota(c, "lucia.martin", "Visita a clientes en Valencia", valencia, "PAGADA", laborableAntes(hoy, 15, festivos),
                laborableAntes(hoy, 14, festivos), laborableAntes(hoy, 10, festivos), null);
        linea(c, n, d17, "TRANSPORTE", "Tren Madrid – Valencia (ida y vuelta)", 7840, 10, null, null, "Renfe Viajeros", "Estación Puerta de Atocha");
        linea(c, n, d17, "HOTEL", "Hotel, 1 noche", 9500, 10, null, null, "Hotel Puerta del Mar", "Av. del Puerto 12, Valencia");
        linea(c, n, d17, "COMIDA", "Comida con cliente (Grupo Levante)", 2450, 10, null, null, "Restaurante La Lonja", "C/ Lonja 4, Valencia");
        linea(c, n, d16, "TRANSPORTE", "Taxi estación – oficinas del cliente", 1230, 10, null, null, "Radio Taxi Valencia", "Valencia");

        n = nota(c, "lucia.martin", "Comidas con clientes", null, "BORRADOR", null, null, null, null);
        LocalDate d3 = laborableAntes(hoy, 3, festivos);
        linea(c, n, d3, "COMIDA", "Comida con cliente (Distribuciones Sur)", 4280, 10, null, null, "Restaurante El Puerto", "Paseo de la Castellana 80, Madrid");

        n = nota(c, "javier.gomez", "Visitas a clientes en Toledo y Guadalajara", null, "ENVIADA", laborableAntes(hoy, 1, festivos), null, null, null);
        LocalDate d4 = laborableAntes(hoy, 4, festivos);
        linea(c, n, d4, "KILOMETRAJE", "Madrid – Toledo – Guadalajara – Madrid", 186 * Gastos.TARIFA_KM, 0, 186, null, null, null);
        linea(c, n, d4, "PARKING", "Parking centro de Toledo", 1800, 21, null, null, "Parking Alcázar", "Toledo");
        linea(c, n, d4, "COMIDA", "Comida con cliente (Ferretería Tajo)", 2790, 10, null, null, "Mesón El Greco", "C/ Real 7, Toledo");

        n = nota(c, "david.lopez", "Curso de formación AWS", curso, "APROBADA", laborableAntes(hoy, 11, festivos),
                laborableAntes(hoy, 10, festivos), null, null);
        linea(c, n, d12, "TRANSPORTE", "Cercanías ida y vuelta", 1050, 10, null, null, "Cercanías Madrid", "Estación de Chamartín");
        linea(c, n, d12, "COMIDA", "Comida durante el curso", 1890, 10, null, null, "Restaurante Castellana", "Paseo de la Castellana 200, Madrid");

        n = nota(c, "elena.navarro", "Material para talleres de diseño", null, "ENVIADA", laborableAntes(hoy, 2, festivos), null, null, null);
        linea(c, n, laborableAntes(hoy, 2, festivos), "OTROS", "Rotuladores, papel kraft y cuadernos de bocetos", 6490, 21,
                null, "Material para los talleres de diseño con clientes de la semana que viene.", "Papelería Creativa", "C/ Fuencarral 45, Madrid");

        LocalDate d9 = laborableAntes(hoy, 9, festivos);
        n = nota(c, "pablo.diaz", "Desplazamiento a la sede de un cliente", null, "PAGADA", d9, laborableAntes(hoy, 8, festivos),
                laborableAntes(hoy, 6, festivos), null);
        linea(c, n, d9, "KILOMETRAJE", "Oficina – Alcobendas – Oficina", 42 * Gastos.TARIFA_KM, 0, 42, null, null, null);
        linea(c, n, d9, "PARKING", "Parking del cliente", 650, 21, null, null, "Parking Alcobendas Centro", "Alcobendas");

        LocalDate d7 = laborableAntes(hoy, 7, festivos);
        n = nota(c, "carlos.ruiz", "Comida trimestral del equipo de Ventas", null, "APROBADA", laborableAntes(hoy, 6, festivos),
                laborableAntes(hoy, 5, festivos), null, null);
        linea(c, n, d7, "COMIDA", "Comida de equipo (5 personas)", 14500, 10, null,
                "Comida trimestral del equipo de Ventas, 5 personas (29 € por persona).", "Restaurante Casa Lucio", "C/ Cava Baja 35, Madrid");

        LocalDate d8 = laborableAntes(hoy, 8, festivos);
        n = nota(c, "marta.sanchez", "Licencia de software de diagramas", null, "RECHAZADA", d8, d7, null,
                "Esta licencia la gestiona IT con el contrato corporativo: pídela por el catálogo de servicios.");
        linea(c, n, d8, "OTROS", "Licencia anual de herramienta de diagramas", 11900, 21, null,
                "La necesito para la documentación de arquitectura.", "Software Store", "Venta online");

        historico(c, hoy, festivos);
    }

    /** Notas ya pagadas de los meses anteriores, para que los gráficos de Gastos tengan historia. */
    private static void historico(Connection c, LocalDate hoy, Set<LocalDate> festivos) throws SQLException {
        String[][] lucia = {
            {"Feria comercial en IFEMA", "COMIDA", "Comida con clientes en la feria", "2850", "Restaurante Ferial", "IFEMA, Madrid",
                "TRANSPORTE", "Taxi oficina – IFEMA", "2210", "Taxi Madrid", "Madrid"},
            {"Visita a Zaragoza", "TRANSPORTE", "AVE Madrid – Zaragoza (ida y vuelta)", "8920", "Renfe Viajeros", "Estación Puerta de Atocha",
                "HOTEL", "Hotel, 1 noche", "8700", "Hotel Ebro", "Paseo Independencia 3, Zaragoza"},
            {"Comidas con clientes de julio", "COMIDA", "Comida con cliente (Grupo Norte)", "2680", "Taberna del Norte", "C/ Princesa 22, Madrid",
                "PARKING", "Parking Princesa", "1150", "Parking Princesa", "Madrid"},
            {"Visita a Toledo", "KILOMETRAJE", "Madrid – Toledo – Madrid", "144", null, null,
                "COMIDA", "Comida con cliente (Aceros Tajo)", "2900", "Mesón El Greco", "C/ Real 7, Toledo"},
        };
        String[][] javier = {
            {"Ruta por Castilla-La Mancha", "KILOMETRAJE", "Madrid – Cuenca – Albacete – Madrid", "512", null, null,
                "HOTEL", "Hotel, 1 noche", "7400", "Hotel La Mancha", "Albacete"},
            {"Comidas con clientes de agosto", "COMIDA", "Comida con cliente (Distribuciones Centro)", "2980", "Casa Pepe", "C/ Alcalá 120, Madrid",
                "OTROS", "Muestras para cliente", "4200", "Imprenta Rápida", "Madrid"},
            {"Visita a Segovia", "KILOMETRAJE", "Madrid – Segovia – Madrid", "182", null, null,
                "PARKING", "Parking acueducto", "900", "Parking Acueducto", "Segovia"},
        };
        hist(c, "lucia.martin", lucia, hoy, festivos);
        hist(c, "javier.gomez", javier, hoy, festivos);
    }

    private static void hist(Connection c, String u, String[][] notas, LocalDate hoy, Set<LocalDate> festivos) throws SQLException {
        for (int i = 0; i < notas.length; i++) {
            String[] x = notas[i];
            LocalDate dia = Calendario.laborableDesde(hoy.minusMonths(i + 1).withDayOfMonth(6), 0, festivos);
            int n = nota(c, u, x[0], null, "PAGADA", dia.plusDays(2), dia.plusDays(4), dia.plusDays(10), null);
            for (int k = 1; k + 4 < x.length + 1; k += 5) {
                boolean km = "KILOMETRAJE".equals(x[k]);
                int v = Integer.parseInt(x[k + 2]);
                linea(c, n, dia, x[k], x[k + 1], km ? v * Gastos.TARIFA_KM : v, km ? 0 : ("PARKING".equals(x[k]) || "OTROS".equals(x[k]) ? 21 : 10),
                        km ? v : null, null, x[k + 3], x[k + 4]);
            }
        }
    }

    private static String responsable(String u) {
        for (String[] e : PLANTILLA) if (e[0].equals(u)) return e[4];
        return null;
    }

    private static int viaje(Connection c, String u, String destino, String motivo, LocalDate desde, LocalDate hasta, int estimado,
            String estado, LocalDate creado) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO VIAJE (USUARIO, DESTINO, MOTIVO, DESDE, HASTA, ESTIMADO, ESTADO,"
                + " APROBADOR, CREADO, RESUELTO) VALUES (?,?,?,?,?,?,?,?,?,?)", java.sql.Statement.RETURN_GENERATED_KEYS)) {
            boolean resuelto = !"PENDIENTE".equals(estado);
            ps.setString(1, u);
            ps.setString(2, destino);
            ps.setString(3, motivo);
            ps.setDate(4, Date.valueOf(desde));
            ps.setDate(5, Date.valueOf(hasta));
            ps.setInt(6, estimado);
            ps.setString(7, estado);
            ps.setString(8, resuelto ? responsable(u) : null);
            ps.setTimestamp(9, Timestamp.valueOf(creado.atTime(9, 40)));
            ps.setTimestamp(10, resuelto ? Timestamp.valueOf(creado.plusDays(1).atTime(11, 5)) : null);
            ps.executeUpdate();
            try (java.sql.ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                return k.getInt(1);
            }
        }
    }

    private static int nota(Connection c, String u, String titulo, Integer viaje, String estado, LocalDate enviado, LocalDate resuelto,
            LocalDate pagado, String comentario) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO NOTA_GASTO (USUARIO, TITULO, VIAJE, ESTADO, APROBADOR, COMENTARIO_RESP,"
                + " PAGADOR, CREADO, ENVIADO, RESUELTO, PAGADO) VALUES (?,?,?,?,?,?,?,?,?,?,?)", java.sql.Statement.RETURN_GENERATED_KEYS)) {
            LocalDate creado = enviado != null ? enviado.minusDays(1) : LocalDate.now().minusDays(2);
            ps.setString(1, u);
            ps.setString(2, titulo);
            if (viaje == null) ps.setNull(3, java.sql.Types.INTEGER); else ps.setInt(3, viaje);
            ps.setString(4, estado);
            ps.setString(5, resuelto != null ? responsable(u) : null);
            ps.setString(6, comentario);
            ps.setString(7, pagado != null ? "rosa.molina" : null);
            ps.setTimestamp(8, Timestamp.valueOf(creado.atTime(18, 20)));
            ps.setTimestamp(9, enviado == null ? null : Timestamp.valueOf(enviado.atTime(9, 15)));
            ps.setTimestamp(10, resuelto == null ? null : Timestamp.valueOf(resuelto.atTime(12, 30)));
            ps.setTimestamp(11, pagado == null ? null : Timestamp.valueOf(pagado.atTime(10, 0)));
            ps.executeUpdate();
            try (java.sql.ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                return k.getInt(1);
            }
        }
    }

    /** Línea de gasto; con comercio se dibuja el ticket (IVA incluido al porcentaje indicado). */
    private static void linea(Connection c, int nota, LocalDate fecha, String cat, String desc, int importe, int ivaPct, Integer km,
            String justificacion, String comercio, String direccion) throws SQLException {
        int iva = importe - Math.round(importe / (1 + ivaPct / 100f));
        byte[] png = comercio == null ? null : Ticket.png(comercio, direccion, "B" + (10000000 + Math.abs(comercio.hashCode()) % 89999999),
                fecha, String.format("%02d:%02d", 9 + Math.abs(desc.hashCode()) % 10, Math.abs(desc.hashCode()) % 60),
                new String[][] {{desc, String.valueOf(importe)}}, ivaPct);
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO LINEA_GASTO (NOTA, FECHA, CATEGORIA, DESCRIPCION, IMPORTE, IVA, KM,"
                + " JUSTIFICACION, TICKET_NOMBRE, TICKET_TIPO, TICKET) VALUES (?,?,?,?,?,?,?,?,?,?,?)")) {
            ps.setInt(1, nota);
            ps.setDate(2, Date.valueOf(fecha));
            ps.setString(3, cat);
            ps.setString(4, desc);
            ps.setInt(5, importe);
            ps.setInt(6, km != null ? 0 : iva);
            if (km == null) ps.setNull(7, java.sql.Types.INTEGER); else ps.setInt(7, km);
            ps.setString(8, justificacion);
            ps.setString(9, png == null ? null : "ticket-" + comercio.toLowerCase().replaceAll("[^a-z0-9]+", "-") + ".png");
            ps.setString(10, png == null ? null : "image/png");
            ps.setBytes(11, png); // null incluido: válido con BLOB (Derby) y BYTEA (PostgreSQL)
            ps.executeUpdate();
        }
    }

    private static void ausencia(PreparedStatement ps, Map<String, List<LocalDate[]>> libres, Set<LocalDate> festivos,
            String u, String tipo, LocalDate desde, LocalDate hasta, String estado, String comentario, String resp) throws SQLException {
        String aprobador = null;
        for (String[] e : PLANTILLA) if (e[0].equals(u)) aprobador = e[4];
        LocalDateTime creado = desde.minusDays(20).atTime(10, 30);
        ps.setString(1, u);
        ps.setString(2, tipo);
        ps.setDate(3, Date.valueOf(desde));
        ps.setDate(4, Date.valueOf(hasta));
        ps.setInt(5, Calendario.laborables(desde, hasta, festivos));
        ps.setString(6, comentario);
        ps.setString(7, estado);
        boolean resuelta = !"PENDIENTE".equals(estado);
        ps.setString(8, resuelta ? aprobador : null);
        ps.setString(9, resp);
        ps.setTimestamp(10, Timestamp.valueOf(creado.isAfter(LocalDateTime.now()) ? LocalDateTime.now().minusDays(2) : creado));
        ps.setTimestamp(11, resuelta ? Timestamp.valueOf(creado.plusDays(1).isAfter(LocalDateTime.now()) ? LocalDateTime.now().minusDays(1) : creado.plusDays(1)) : null);
        ps.addBatch();
        if ("APROBADA".equals(estado)) {
            if (!libres.containsKey(u)) libres.put(u, new ArrayList<LocalDate[]>());
            libres.get(u).add(new LocalDate[] {desde, hasta});
        }
    }

    private static boolean libre(List<LocalDate[]> periodos, LocalDate d) {
        if (periodos != null) for (LocalDate[] p : periodos) if (!d.isBefore(p[0]) && !d.isAfter(p[1])) return true;
        return false;
    }

    private static LocalDate laborableAntes(LocalDate d, int n, Set<LocalDate> festivos) {
        for (int i = 0; i < n; ) {
            d = d.minusDays(1);
            if (Calendario.laborable(d, festivos)) i++;
        }
        return d;
    }

    private static void marca(PreparedStatement ps, String u, String tipo, LocalDateTime m, String mod) throws SQLException {
        marca(ps, u, tipo, m, mod, null);
    }

    // Oficina de la empresa ficticia (Paseo de la Castellana, Madrid)
    private static final double OFI_LAT = 40.4478, OFI_LON = -3.6925;
    private static final Random GPS = new Random(11);

    private static void marca(PreparedStatement ps, String u, String tipo, LocalDateTime m, String mod, String incidencia) throws SQLException {
        ps.setString(1, u);
        ps.setString(2, tipo);
        ps.setTimestamp(3, Timestamp.valueOf(m));
        ps.setString(4, mod);
        ps.setTimestamp(5, Timestamp.valueOf(m));
        ps.setString(6, incidencia);
        if ("OFICINA".equals(mod)) {
            ps.setDouble(7, OFI_LAT + (GPS.nextDouble() - .5) * .0006);
            ps.setDouble(8, OFI_LON + (GPS.nextDouble() - .5) * .0006);
            ps.setInt(9, 8 + GPS.nextInt(25));
        } else {
            // En teletrabajo, ubicación aproximada del domicilio (cada persona la suya)
            int h = Math.abs(u.hashCode());
            ps.setDouble(7, 40.38 + (h % 97) / 1000.0);
            ps.setDouble(8, -3.75 + (h % 89) / 1000.0);
            ps.setInt(9, 30 + GPS.nextInt(60));
        }
        ps.addBatch();
    }
}
