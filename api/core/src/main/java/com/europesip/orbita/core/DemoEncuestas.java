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
import java.util.List;
import java.util.Random;

/**
 * Datos de demostración de Encuestas (los carga Demo.cargar). La historia:
 *  - Clima laboral 2025 y 2026 (serie CLIMA, cerradas): respondió toda la plantilla; 2026 mejora en casi todo salvo la
 *    carga de trabajo de Tecnología, y tiene comentarios y un plan de acción con tres acciones.
 *  - Pulsos de septiembre y octubre (cerrados) y de noviembre (abierto): ventas-1 aún no ha respondido el de noviembre.
 *  - Un borrador («Teletrabajo: seis meses después») y una encuesta programada para dentro de una semana.
 * Las respuestas se guardan como lo hace la aplicación: quién por un lado y qué (sin quién) por otro.
 */
final class DemoEncuestas {

    private DemoEncuestas() {}

    private static String u(String papel) { return Personas.u(papel); }

    static final String[] PAPELES = {"rrhh", "ventas-responsable", "ventas-1", "ventas-2", "tecnologia-responsable", "tecnologia-1", "tecnologia-2",
        "tecnologia-3", "administracion"};

    private static final String[] MEJORAS = {"Salario y beneficios", "Formación", "Flexibilidad horaria", "Herramientas de trabajo",
        "Comunicación interna", "Carga de trabajo", "Reconocimiento"};

    /** Las preguntas del clima laboral: tipo, texto, dimensión, sección, obligatoria, opciones. */
    static List<Object[]> clima() {
        List<Object[]> l = new ArrayList<>();
        String s1 = "Tu trabajo", s2 = "Tu equipo y tu responsable", s3 = "Tu futuro en la empresa", s4 = "Para terminar";
        l.add(q("ACUERDO", "Mi carga de trabajo es razonable la mayoría de las semanas.", "CARGA", s1));
        l.add(q("ACUERDO", "Tengo los medios y las herramientas que necesito para hacer bien mi trabajo.", "RECURSOS", s1));
        l.add(q("ACUERDO", "Puedo compaginar mi trabajo con mi vida personal.", "FLEXIBILIDAD", s1));
        l.add(new Object[] {"MATRIZ", "Sobre tu responsable directo:", "LIDERAZGO", s2, true,
            json("Me da feedback útil sobre mi trabajo.", "Me escucha cuando planteo un problema.", "Reconoce el trabajo bien hecho.")});
        l.add(q("ACUERDO", "En mi equipo nos ayudamos cuando alguien lo necesita.", "EQUIPO", s2));
        l.add(q("ACUERDO", "Siento que mi trabajo se valora en la empresa.", "RECONOCIMIENTO", s2));
        l.add(q("ACUERDO", "Veo oportunidades para aprender y crecer aquí.", "DESARROLLO", s3));
        l.add(q("ACUERDO", "Sé cuáles son los objetivos de la empresa y cómo contribuyo a ellos.", "COMUNICACION", s3));
        l.add(q("ACUERDO", "Me veo trabajando aquí dentro de dos años.", "COMPROMISO", s3));
        l.add(q("ENPS", "Del 0 al 10, ¿recomendarías la empresa a un amigo para trabajar?", "COMPROMISO", s3));
        l.add(new Object[] {"MULTIPLE", "¿Qué mejorarías primero? (elige hasta tres)", null, s4, true, json(MEJORAS)});
        l.add(new Object[] {"UNICA", "¿Cómo describirías tu nivel de estrés en el último mes?", "BIENESTAR", s4, true, json("Bajo", "Moderado", "Alto", "Muy alto")});
        l.add(new Object[] {"TEXTO", "¿Qué es lo que más te gusta de trabajar aquí?", null, s4, false, null});
        l.add(new Object[] {"TEXTO", "Si pudieras cambiar una cosa, ¿cuál sería?", null, s4, false, null});
        return l;
    }

    /** Las preguntas del pulso mensual. */
    static List<Object[]> pulso() {
        List<Object[]> l = new ArrayList<>();
        l.add(q("ACUERDO", "Este mes mi carga de trabajo ha sido razonable.", "CARGA", null));
        l.add(q("ACUERDO", "Mi responsable me escucha y me apoya.", "LIDERAZGO", null));
        l.add(q("ACUERDO", "Tengo lo que necesito para hacer bien mi trabajo.", "RECURSOS", null));
        l.add(new Object[] {"SINO", "¿Has podido desconectar del trabajo el último fin de semana?", "BIENESTAR", null, true, null});
        l.add(q("ENPS", "Del 0 al 10, ¿recomendarías la empresa a un amigo para trabajar?", "COMPROMISO", null));
        l.add(new Object[] {"TEXTO", "¿Algo que quieras contarnos? (opcional)", null, null, false, null});
        return l;
    }

    private static Object[] q(String tipo, String texto, String dim, String seccion) {
        return new Object[] {tipo, texto, dim, seccion, true, null};
    }

    private static String json(String... s) {
        var b = jakarta.json.Json.createArrayBuilder();
        for (String x : s) b.add(x);
        return b.build().toString();
    }

    private static final String[] COMENTARIOS_GUSTA = {"El ambiente del equipo: siempre hay alguien dispuesto a echar una mano.",
        "La flexibilidad para teletrabajar y organizarme el día.", "Que los proyectos son variados y se aprende mucho.",
        "La gente. Y que se puede hablar claro con los responsables.", "El teletrabajo y el horario de los viernes."};
    private static final String[] COMENTARIOS_CAMBIAR = {"Demasiadas reuniones los lunes por la mañana; se pierde media jornada.",
        "En Tecnología vamos muy justos de gente para la carga de trabajo que tenemos.", "Me gustaría un plan de formación claro, no cursos sueltos.",
        "Saber antes cuáles son los objetivos del trimestre y cómo vamos.", "Menos reuniones y más tiempo para trabajar de verdad.",
        "Un plan de carrera para los perfiles técnicos.", "Que el portátil no tarde tanto en arrancar: las herramientas cuentan."};

    static void cargar(Connection c, LocalDate hoy) throws SQLException {
        Random r = new Random(31);
        LocalDateTime ahora = LocalDateTime.now().withSecond(0).withNano(0);
        String autor = u("rrhh");

        // Clima laboral 2025 y 2026 (la de 2026 mejora, salvo la carga de Tecnología)
        int clima25 = encuesta(c, "Clima laboral " + (hoy.getYear() - 1), "Tu opinión sobre la empresa, una vez al año. Unos 5 minutos y totalmente anónima.",
                "CLIMA", "CERRADA", hoy.minusYears(1).minusDays(40).atTime(9, 0), hoy.minusYears(1).minusDays(20), 3, "TODOS", autor, clima(),
                "Gracias. En unas semanas compartiremos los resultados y el plan de acción.");
        int clima26 = encuesta(c, "Clima laboral " + hoy.getYear(), "Tu opinión sobre la empresa, una vez al año. Unos 5 minutos y totalmente anónima.",
                "CLIMA", "CERRADA", hoy.minusDays(55).atTime(9, 0), hoy.minusDays(35), 3, "TODOS", autor, clima(),
                "Gracias. En unas semanas compartiremos los resultados y el plan de acción.");
        int gusta = 0, cambiar = 0;
        for (String p : PAPELES) {
            responder(c, clima25, p, r, -0.5, null, null);
            String g = r.nextInt(10) < 6 && gusta < COMENTARIOS_GUSTA.length ? COMENTARIOS_GUSTA[gusta++] : null;
            String k = r.nextInt(10) < 8 && cambiar < COMENTARIOS_CAMBIAR.length ? COMENTARIOS_CAMBIAR[cambiar++] : null;
            responder(c, clima26, p, r, 0, g, k);
        }

        // Pulsos mensuales
        int sep = encuesta(c, "Pulso de " + mes(hoy.minusDays(63)), "Seis preguntas, un minuto. Es anónima: nadie, tampoco RRHH, ve qué ha respondido cada persona.",
                "PULSO", "CERRADA", hoy.minusDays(70).atTime(9, 0), hoy.minusDays(56), 3, "TODOS", autor, pulso(), null);
        int oct = encuesta(c, "Pulso de " + mes(hoy.minusDays(30)), "Seis preguntas, un minuto. Es anónima: nadie, tampoco RRHH, ve qué ha respondido cada persona.",
                "PULSO", "CERRADA", hoy.minusDays(35).atTime(9, 0), hoy.minusDays(21), 3, "TODOS", autor, pulso(), null);
        int nov = encuesta(c, "Pulso de " + mes(hoy), "Seis preguntas, un minuto. Es anónima: nadie, tampoco RRHH, ve qué ha respondido cada persona.",
                "PULSO", "ABIERTA", hoy.minusDays(2).atTime(9, 0), hoy.plusDays(12), 3, "TODOS", autor, pulso(), null);
        for (int i = 0; i < PAPELES.length; i++) if (i != 2 && i != 7) responder(c, sep, PAPELES[i], r, -0.3, null, null);
        String[] pulsoComentarios = {"Por fin menos reuniones los lunes.", null, "Mucho trabajo acumulado este mes en Tecnología.", null};
        for (int i = 0; i < PAPELES.length; i++) responder(c, oct, PAPELES[i], r, 0.1, i < pulsoComentarios.length ? pulsoComentarios[i] : null, null);
        for (String p : new String[] {"rrhh", "ventas-responsable", "tecnologia-responsable", "tecnologia-1", "administracion"}) responder(c, nov, p, r, 0.2, null, null);
        Social.avisar(c, u("ventas-1"), "encuestas", "ENCUESTA", nov, "encuesta.nueva", obj("titulo", "Pulso de " + mes(hoy)),
                "Nueva encuesta anónima: «Pulso de " + mes(hoy) + "». Tu opinión cuenta.");

        // Un borrador y una programada
        List<Object[]> tele = new ArrayList<>();
        tele.add(q("ACUERDO", "La política de teletrabajo me permite organizarme mejor.", "FLEXIBILIDAD", null));
        tele.add(q("ACUERDO", "Cuando teletrabajo tengo los medios que necesito.", "RECURSOS", null));
        tele.add(new Object[] {"UNICA", "¿Cuántos días a la semana te gustaría teletrabajar?", "FLEXIBILIDAD", null, true, json("Ninguno", "1", "2", "3 o más")});
        tele.add(new Object[] {"TEXTO", "¿Qué cambiarías de la política de teletrabajo?", null, null, false, null});
        encuesta(c, "Teletrabajo: seis meses después", "Queremos saber cómo te está funcionando la nueva política de teletrabajo.", "TELETRABAJO",
                "BORRADOR", null, null, 3, "TODOS", autor, tele, null);
        List<Object[]> bien = new ArrayList<>();
        bien.add(q("ESCALA", "¿Cómo valorarías tu energía al final de la semana?", "BIENESTAR", null));
        bien.add(new Object[] {"SINO", "¿Conoces el programa de apoyo emocional de la empresa?", "BIENESTAR", null, true, null});
        bien.add(new Object[] {"MULTIPLE", "¿Qué te ayudaría a cuidarte mejor?", "BIENESTAR", null, false,
            json("Pausas activas", "Más flexibilidad horaria", "Actividades de equipo", "Charlas de salud", "Menos reuniones")});
        int programada = encuesta(c, "Bienestar de fin de año", "Cuatro preguntas sobre cómo llegas al final del año.", "BIENESTAR",
                "BORRADOR", null, hoy.plusDays(21), 3, "TODOS", autor, bien, null);
        try (PreparedStatement ps = c.prepareStatement("UPDATE ENCUESTA SET ESTADO = 'PROGRAMADA', APERTURA = ? WHERE ID = ?")) {
            ps.setTimestamp(1, Timestamp.valueOf(hoy.plusDays(7).atTime(9, 0)));
            ps.setInt(2, programada);
            ps.executeUpdate();
        }

        // Plan de acción del clima 2026
        accion(c, clima26, "CARGA", null, "Lunes sin reuniones antes de las 11:00",
                "Las reuniones de seguimiento pasan a los martes; los lunes por la mañana quedan para trabajar.", "rrhh", hoy.plusDays(20), "EN_CURSO",
                ahora.minusDays(25));
        accion(c, clima26, "DESARROLLO", "Tecnología", "Plan de carrera técnica para Tecnología",
                "Niveles, competencias y formación para crecer sin tener que pasar a gestionar personas.", "tecnologia-responsable", hoy.plusDays(60),
                "PENDIENTE", ahora.minusDays(20));
        accion(c, clima26, "COMUNICACION", null, "Objetivos del trimestre en Mi intranet",
                "Cada trimestre publicamos los objetivos de la empresa y cómo vamos, en un comunicado y en Mi intranet.", "rrhh", hoy.minusDays(5),
                "HECHA", ahora.minusDays(30));
    }

    private static String mes(LocalDate d) {
        return Documentos.periodoTexto(String.format("%d-%02d", d.getYear(), d.getMonthValue())).replaceAll(" de \\d{4}$", "");
    }

    static int encuesta(Connection c, String titulo, String descripcion, String serie, String estado, LocalDateTime abierta, LocalDate cierre, int minimo,
            String ambito, String autor, List<Object[]> preguntas, String gracias) throws SQLException {
        int id;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA (TITULO, DESCRIPCION, AMBITO, MINIMO, ESTADO, AUTOR, ABIERTA, CIERRE, SERIE,"
                + " GRACIAS, CREADA) VALUES (?,?,?,?,?,?,?,?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, titulo);
            ps.setString(2, descripcion);
            ps.setString(3, ambito);
            ps.setInt(4, minimo);
            ps.setString(5, estado);
            ps.setString(6, autor);
            ps.setTimestamp(7, abierta == null ? null : Timestamp.valueOf(abierta));
            ps.setDate(8, cierre == null ? null : Date.valueOf(cierre));
            ps.setString(9, serie);
            ps.setString(10, gracias);
            ps.setTimestamp(11, Timestamp.valueOf(abierta == null ? LocalDateTime.now().withNano(0).minusDays(1) : abierta.minusDays(3)));
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) {
                k.next();
                id = k.getInt(1);
            }
        }
        Encuestas.insertarPreguntas(c, id, preguntas);
        return id;
    }

    /**
     * Responde como lo haría una persona: Tecnología tiene la carga más baja; "mejora" desplaza todas las respuestas
     * (la encuesta del año anterior, un poco peor). El primer campo de texto recibe "gusta" y el segundo "cambiar".
     */
    private static void responder(Connection c, int encuesta, String papel, Random r, double mejora, String gusta, String cambiar) throws SQLException {
        boolean tec = papel.startsWith("tecnologia");
        List<Object[]> filas = new ArrayList<>();
        int textos = 0;
        try (PreparedStatement ps = c.prepareStatement("SELECT ID, TIPO, DIMENSION, OPCIONES FROM ENCUESTA_PREGUNTA WHERE ENCUESTA = ? ORDER BY ORDEN")) {
            ps.setInt(1, encuesta);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int id = rs.getInt(1);
                    String tipo = rs.getString(2), dim = rs.getString(3);
                    double base = 3.8 + mejora + (tec && "CARGA".equals(dim) ? -1.7 - mejora : 0) + (tec && "DESARROLLO".equals(dim) ? -0.6 : 0);
                    switch (tipo) {
                        case "ACUERDO": case "ESCALA":
                            filas.add(new Object[] {id, 0, escala(base, r), null});
                            break;
                        case "MATRIZ":
                            for (int i = 0; i < 3; i++) filas.add(new Object[] {id, i, escala(base + (i == 2 ? -0.4 : 0.2), r), null});
                            break;
                        case "ENPS":
                            filas.add(new Object[] {id, 0, Math.max(0, Math.min(10, (int) Math.round((tec ? 7 : 8.3) + mejora * 2 + r.nextGaussian() * 1.3))), null});
                            break;
                        case "SINO":
                            filas.add(new Object[] {id, 0, r.nextDouble() < (tec ? 0.5 : 0.8) + mejora / 4 ? 1 : 0, null});
                            break;
                        case "UNICA":
                            filas.add(new Object[] {id, 0, Math.max(0, Math.min(3, (tec ? 2 : 1) + (r.nextDouble() < 0.4 ? (r.nextBoolean() ? 1 : -1) : 0))), null});
                            break;
                        case "MULTIPLE": {
                            java.util.Set<Integer> m = new java.util.TreeSet<>();
                            m.add(tec ? 5 : r.nextInt(MEJORAS.length));
                            if (r.nextBoolean()) m.add(r.nextBoolean() ? 1 : 4);
                            if (r.nextInt(3) == 0) m.add(r.nextInt(MEJORAS.length));
                            for (int i : m) filas.add(new Object[] {id, i, 1, null});
                            break;
                        }
                        case "TEXTO": {
                            String t = textos++ == 0 ? gusta : cambiar;
                            if (t != null) filas.add(new Object[] {id, 0, null, t});
                            break;
                        }
                        default:
                            break;
                    }
                }
            }
        }
        Encuestas.guardarRespuestas(c, encuesta, u(papel), Personas.de(papel).departamento(), filas);
    }

    private static int escala(double base, Random r) {
        return (int) Math.max(1, Math.min(5, Math.round(base + r.nextGaussian() * 0.8)));
    }

    private static void accion(Connection c, int encuesta, String dim, String depto, String titulo, String desc, String papel, LocalDate limite,
            String estado, LocalDateTime creado) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_ACCION (ENCUESTA, DIMENSION, DEPARTAMENTO, TITULO, DESCRIPCION, RESPONSABLE,"
                + " LIMITE, ESTADO, AUTOR, CREADO, ACTUALIZADO) VALUES (?,?,?,?,?,?,?,?,?,?,?)")) {
            ps.setInt(1, encuesta);
            ps.setString(2, dim);
            ps.setString(3, depto);
            ps.setString(4, titulo);
            ps.setString(5, desc);
            ps.setString(6, u(papel));
            ps.setDate(7, Date.valueOf(limite));
            ps.setString(8, estado);
            ps.setString(9, u("rrhh"));
            ps.setTimestamp(10, Timestamp.valueOf(creado));
            ps.setTimestamp(11, Timestamp.valueOf(creado.plusDays(3)));
            ps.executeUpdate();
        }
    }
}
