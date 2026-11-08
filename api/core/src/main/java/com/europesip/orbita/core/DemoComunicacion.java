package com.europesip.orbita.core;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Random;
import java.util.UUID;

/**
 * Datos de demostración de Comunicación con RRHH (los carga Demo.cargar). La historia, por papeles:
 *  - RRHH ha publicado la nueva política de teletrabajo, que hay que confirmar: ventas-1 aún no la ha abierto y
 *    ventas-2 la ha leído pero no la ha confirmado. Tecnología tiene una formación obligatoria por confirmar.
 *  - ventas-2 tiene una consulta sobre su nómina en curso con RRHH; tecnologia-1 acaba de preguntar por su cuenta
 *    bancaria (sin atender) y ventas-1 tiene una resuelta y valorada.
 *  - El pulso de octubre está cerrado con resultados (Tecnología llega al mínimo; el resto de departamentos no) y el de
 *    noviembre está abierto: ventas-1 aún no ha respondido.
 */
final class DemoComunicacion {

    private DemoComunicacion() {}

    private static String u(String papel) { return Personas.u(papel); }

    private static String pila(String papel) { return Personas.de(papel).nombrePila(); }

    static void cargar(Connection c, LocalDate hoy) throws SQLException {
        LocalDateTime ahora = LocalDateTime.now().withSecond(0).withNano(0);

        // ------------------------------------------------------------------------------------------- Comunicados
        int teletrabajo = comunicado(c, "Nueva política de teletrabajo", "POLITICA", "TODOS", true, hoy.plusDays(10), hoy.minusDays(3).atTime(9, 30),
                "A partir del 1 de diciembre se aplica la nueva política de teletrabajo:\n\n"
                + "• Hasta 2 días de teletrabajo a la semana, a acordar con tu responsable.\n"
                + "• Los martes son presenciales para todos los equipos.\n"
                + "• Al fichar, indica la modalidad (oficina o teletrabajo).\n"
                + "• La empresa compensa 30 € al mes por gastos de conexión a quien teletrabaje al menos 4 días al mes.\n\n"
                + "Léela con atención y confírmala antes de la fecha límite. Cualquier duda, en Consultas a RRHH.", null);
        int calendario = comunicado(c, "Calendario laboral " + (hoy.getYear() + 1), "AVISO", "TODOS", false, null, hoy.minusDays(12).atTime(10, 0),
                "Ya está disponible el calendario laboral del año que viene, con los festivos nacionales, autonómicos y locales. "
                + "Los festivos aparecen también en Vacaciones y en Fichaje, y no cuentan como días de vacaciones.", null);
        int medico = comunicado(c, "Revisión médica anual: pide tu cita", "BENEFICIO", "TODOS", false, null, hoy.minusDays(6).atTime(12, 15),
                "La revisión médica anual es voluntaria y gratuita. Este año se hace en la clínica de siempre, del 1 al 19 del mes que viene. "
                + "Pide tu cita en el teléfono de la clínica indicando que vienes de parte de la empresa. El tiempo de la revisión cuenta como "
                + "tiempo de trabajo: al fichar la pausa, elige «Médico».", null);
        int seguridad = comunicado(c, "Formación obligatoria en seguridad de la información", "POLITICA", "DEPARTAMENTO:Tecnología", true,
                hoy.plusDays(20), hoy.minusDays(1).atTime(16, 45),
                "Todo el equipo de Tecnología tiene que completar el curso en línea de seguridad de la información (2 horas) antes de la fecha "
                + "límite. Confirma aquí que has leído las normas de uso de equipos y contraseñas.", "https://www.europesip.com");
        int cena = comunicado(c, "Cena de empresa de fin de año", "EVENTO", "TODOS", false, null, ahora.minusHours(20),
                "Este año celebramos la cena de fin de año el viernes 18 de diciembre a las 21:00. Confirma tu asistencia a " + pila("rrhh")
                + " antes del día 10. ¡Os esperamos!", null);

        String[] todos = {"rrhh", "ventas-responsable", "ventas-1", "ventas-2", "tecnologia-responsable", "tecnologia-1", "tecnologia-2",
            "tecnologia-3", "administracion"};
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO COMUNICADO_LECTURA (COMUNICADO, USUARIO, LEIDO, CONFIRMADO) VALUES (?,?,?,?)")) {
            LocalDateTime t = hoy.minusDays(3).atTime(9, 40);
            for (String p : new String[] {"rrhh", "ventas-responsable", "tecnologia-responsable", "tecnologia-1", "administracion"}) {
                lectura(ps, teletrabajo, u(p), t, t.plusMinutes(5));
                t = t.plusHours(3);
            }
            lectura(ps, teletrabajo, u("ventas-2"), hoy.minusDays(2).atTime(8, 55), null);
            lectura(ps, teletrabajo, u("tecnologia-2"), hoy.minusDays(1).atTime(17, 2), null);
            for (String p : todos) if (!"tecnologia-3".equals(p)) lectura(ps, calendario, u(p), hoy.minusDays(11).atTime(9, 0), null);
            for (String p : new String[] {"rrhh", "ventas-2", "tecnologia-1", "administracion", "tecnologia-responsable"}) {
                lectura(ps, medico, u(p), hoy.minusDays(5).atTime(10, 30), null);
            }
            lectura(ps, seguridad, u("tecnologia-responsable"), hoy.minusDays(1).atTime(17, 0), hoy.minusDays(1).atTime(17, 3));
            lectura(ps, cena, u("rrhh"), ahora.minusHours(20), null);
            ps.executeBatch();
        }

        // ------------------------------------------------------------------------------------------- Preguntas frecuentes
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO PREGUNTA_FRECUENTE (CATEGORIA, PREGUNTA, RESPUESTA, ACTUALIZADO) VALUES (?,?,?,?)")) {
            Timestamp t = Timestamp.valueOf(hoy.minusDays(30).atTime(9, 0));
            faq(ps, t, "NOMINA", "¿Qué día se paga la nómina?",
                    "La nómina se paga el último día laborable de cada mes. Si ese día es festivo, se adelanta al día laborable anterior.");
            faq(ps, t, "NOMINA", "¿Dónde puedo descargar mis nóminas?",
                    "En el portal del empleado de la gestoría, con tu usuario de la empresa. Si no puedes entrar, abre una consulta de nómina.");
            faq(ps, t, "CERTIFICADO", "¿Cómo pido un certificado de empresa?",
                    "Abre una consulta en la categoría Certificados e indica para qué lo necesitas (banco, alquiler, ayudas...). RRHH te lo envía "
                    + "firmado en 2 o 3 días laborables.");
            faq(ps, t, "DATOS", "¿Cómo cambio la cuenta bancaria de la nómina?",
                    "Abre una consulta en la categoría Datos personales con el nuevo IBAN y un certificado de titularidad del banco. Si llega antes "
                    + "del día 20, se aplica en la nómina de ese mes.");
            faq(ps, t, "CONTRATO", "¿Cuántos días de teletrabajo tengo?",
                    "Hasta 2 días por semana, a acordar con tu responsable; los martes son presenciales. Está en el comunicado «Nueva política de "
                    + "teletrabajo».");
            faq(ps, t, "OTRA", "¿Qué hago si estoy de baja médica?",
                    "Avisa a tu responsable cuanto antes y registra la baja en Vacaciones (tipo «Baja médica»). Envía el parte a RRHH en una "
                    + "consulta en los 3 días siguientes.");
            faq(ps, t, "FORMACION", "¿La empresa paga cursos de formación?",
                    "Sí, la formación relacionada con tu puesto, con el visto bueno de tu responsable. Cuéntanos qué curso te interesa en una "
                    + "consulta de formación.");
            ps.executeBatch();
        }

        // ------------------------------------------------------------------------------------------- Consultas a RRHH
        LocalDateTime t1 = hoy.minusDays(2).atTime(11, 0);
        int irpf = consulta(c, u("ventas-2"), "NOMINA", "No me cuadra la retención de IRPF de octubre",
                "Hola, en la nómina de octubre me han retenido bastante más IRPF que en septiembre y no he tenido ningún cambio. ¿Me podéis "
                + "explicar por qué?", "EN_CURSO", u("rrhh"), t1, hoy.minusDays(1).atTime(9, 10), null, null);
        int hipoteca = consulta(c, u("ventas-1"), "CERTIFICADO", "Certificado de empresa para la hipoteca",
                "Necesito un certificado de empresa con mi antigüedad y mi salario bruto anual para el banco.", "RESUELTA", u("rrhh"),
                hoy.minusDays(9).atTime(10, 20), hoy.minusDays(7).atTime(12, 0), hoy.minusDays(7).atTime(12, 0), 5);
        int cuenta = consulta(c, u("tecnologia-1"), "DATOS", "Cambio de cuenta bancaria",
                "He cambiado de banco. ¿Qué tengo que enviaros para que la nómina de este mes llegue a la cuenta nueva?", "ABIERTA", null,
                ahora.minusHours(3), ahora.minusHours(3), null, null);
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO COMENTARIO (CLASE, OBJETO, USUARIO, TEXTO, CREADO) VALUES (?,?,?,?,?)")) {
            comentario(ps, irpf, u("rrhh"), "Hola " + pila("ventas-2") + ": en octubre se regularizó el IRPF del año por la subida de julio. "
                    + "Te preparo el detalle del cálculo.", t1.plusHours(2).plusMinutes(20));
            comentario(ps, irpf, u("ventas-2"), "Gracias, ¿me lo puedes enviar antes del viernes?", hoy.minusDays(1).atTime(9, 10));
            comentario(ps, hipoteca, u("rrhh"), "Te lo he enviado firmado a tu correo. Si el banco pide algo más, dímelo aquí.",
                    hoy.minusDays(7).atTime(12, 0));
            comentario(ps, hipoteca, u("ventas-1"), "¡Recibido, muchas gracias!", hoy.minusDays(7).atTime(12, 30));
            ps.executeBatch();
        }

        // ------------------------------------------------------------------------------------------- Pulso
        String[][] preguntas = {
            {"ESCALA", "¿Cómo de equilibrada está tu carga de trabajo?"},
            {"ESCALA", "¿Sientes que tu responsable te escucha?"},
            {"ESCALA", "¿Tienes lo que necesitas para hacer bien tu trabajo?"},
            {"ENPS", "Del 0 al 10, ¿recomendarías la empresa a un amigo para trabajar?"},
            {"TEXTO", "¿Algo que quieras contarnos? (opcional)"},
        };
        int octubre = encuesta(c, "Pulso de octubre", "CERRADA", hoy.minusDays(35).atTime(9, 0), hoy.minusDays(21), preguntas);
        int noviembre = encuesta(c, "Pulso de noviembre", "ABIERTA", hoy.minusDays(2).atTime(9, 0), hoy.plusDays(12), preguntas);
        Random r = new Random(23);
        String[] comentarios = {"Demasiadas reuniones los lunes por la mañana.", "Muy buen ambiente en el equipo.",
            "Me gustaría saber mejor cuáles son los objetivos del trimestre.", "La nueva política de teletrabajo es un acierto."};
        int k = 0;
        for (String p : todos) {
            // En Tecnología la carga es más alta; las respuestas varían un poco por persona
            boolean tec = p.startsWith("tecnologia");
            responder(c, octubre, p, new int[] {tec ? 2 + r.nextInt(2) : 3 + r.nextInt(2), 3 + r.nextInt(3), 3 + r.nextInt(3), tec ? 5 + r.nextInt(5) : 8 + r.nextInt(3)},
                    k < comentarios.length && r.nextBoolean() ? comentarios[k++] : null);
        }
        for (String p : new String[] {"rrhh", "ventas-responsable", "tecnologia-responsable", "tecnologia-1", "administracion"}) {
            responder(c, noviembre, p, new int[] {3 + r.nextInt(2), 3 + r.nextInt(3), 4 + r.nextInt(2), 7 + r.nextInt(4)}, null);
        }

        // ------------------------------------------------------------------------------------------- Avisos
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO AVISO (USUARIO, APP, CLASE, OBJETO, TEXTO, LEIDO, CREADO) VALUES (?,?,?,?,?,?,?)")) {
            String lim = Api.corta(hoy.plusDays(10));
            for (String p : new String[] {"ventas-1", "ventas-2", "tecnologia-2", "tecnologia-3"}) {
                aviso(ps, u(p), "COMUNICADO", teletrabajo, "RRHH ha publicado «Nueva política de teletrabajo»: léelo y confírmalo antes del " + lim + ".",
                        "ventas-2".equals(p) ? 1 : 0, hoy.minusDays(3).atTime(9, 30));
            }
            aviso(ps, u("ventas-1"), "COMUNICADO", cena, "Nuevo comunicado de RRHH: «Cena de empresa de fin de año».", 0, ahora.minusHours(20));
            aviso(ps, u("ventas-1"), "ENCUESTA", noviembre, "Nueva encuesta anónima de RRHH: «Pulso de noviembre». Es un minuto.", 0, hoy.minusDays(2).atTime(9, 0));
            aviso(ps, u("ventas-2"), "CONSULTA", irpf, "RRHH ha respondido a tu consulta: «Hola " + pila("ventas-2") + ": en octubre se regularizó el IRPF…»",
                    1, t1.plusHours(2).plusMinutes(20));
            aviso(ps, u("rrhh"), "CONSULTA", irpf, Personas.de("ventas-2").nombre() + " ha comentado su consulta: «Gracias, ¿me lo puedes enviar antes del viernes?»",
                    0, hoy.minusDays(1).atTime(9, 10));
            aviso(ps, u("rrhh"), "CONSULTA", cuenta, Personas.de("tecnologia-1").nombre() + " ha enviado una consulta a RRHH: «Cambio de cuenta bancaria».",
                    0, ahora.minusHours(3));
            ps.executeBatch();
        }
    }

    private static int comunicado(Connection c, String titulo, String categoria, String ambito, boolean confirmar, LocalDate limite,
            LocalDateTime publicado, String texto, String enlace) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO COMUNICADO (TITULO, TEXTO, CATEGORIA, AMBITO, CONFIRMAR, ENLACE, LIMITE, AUTOR,"
                + " PUBLICADO) VALUES (?,?,?,?,?,?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, titulo);
            ps.setString(2, texto);
            ps.setString(3, categoria);
            ps.setString(4, ambito);
            ps.setInt(5, confirmar ? 1 : 0);
            ps.setString(6, enlace);
            ps.setDate(7, limite == null ? null : Date.valueOf(limite));
            ps.setString(8, u("rrhh"));
            ps.setTimestamp(9, Timestamp.valueOf(publicado));
            ps.executeUpdate();
            return clave(ps);
        }
    }

    private static void lectura(PreparedStatement ps, int comunicado, String usuario, LocalDateTime leido, LocalDateTime confirmado) throws SQLException {
        ps.setInt(1, comunicado);
        ps.setString(2, usuario);
        ps.setTimestamp(3, Timestamp.valueOf(leido));
        ps.setTimestamp(4, confirmado == null ? null : Timestamp.valueOf(confirmado));
        ps.addBatch();
    }

    private static void faq(PreparedStatement ps, Timestamp t, String categoria, String pregunta, String respuesta) throws SQLException {
        ps.setString(1, categoria);
        ps.setString(2, pregunta);
        ps.setString(3, respuesta);
        ps.setTimestamp(4, t);
        ps.addBatch();
    }

    private static int consulta(Connection c, String usuario, String categoria, String asunto, String texto, String estado, String atiende,
            LocalDateTime creado, LocalDateTime actualizado, LocalDateTime resuelto, Integer valoracion) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO CONSULTA (USUARIO, CATEGORIA, ASUNTO, TEXTO, ESTADO, ATIENDE, CREADO, ACTUALIZADO,"
                + " RESUELTO, VALORACION) VALUES (?,?,?,?,?,?,?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, usuario);
            ps.setString(2, categoria);
            ps.setString(3, asunto);
            ps.setString(4, texto);
            ps.setString(5, estado);
            ps.setString(6, atiende);
            ps.setTimestamp(7, Timestamp.valueOf(creado));
            ps.setTimestamp(8, Timestamp.valueOf(actualizado));
            ps.setTimestamp(9, resuelto == null ? null : Timestamp.valueOf(resuelto));
            if (valoracion == null) ps.setNull(10, java.sql.Types.SMALLINT); else ps.setInt(10, valoracion);
            ps.executeUpdate();
            return clave(ps);
        }
    }

    private static void comentario(PreparedStatement ps, int consulta, String usuario, String texto, LocalDateTime cuando) throws SQLException {
        ps.setString(1, "CONSULTA");
        ps.setInt(2, consulta);
        ps.setString(3, usuario);
        ps.setString(4, texto);
        ps.setTimestamp(5, Timestamp.valueOf(cuando));
        ps.addBatch();
    }

    private static int encuesta(Connection c, String titulo, String estado, LocalDateTime abierta, LocalDate cierre, String[][] preguntas) throws SQLException {
        int id;
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA (TITULO, DESCRIPCION, AMBITO, MINIMO, ESTADO, AUTOR, ABIERTA, CIERRE)"
                + " VALUES (?,?,'TODOS',4,?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, titulo);
            ps.setString(2, "Cinco preguntas, un minuto. Es anónima: nadie, tampoco RRHH, ve qué ha respondido cada persona.");
            ps.setString(3, estado);
            ps.setString(4, u("rrhh"));
            ps.setTimestamp(5, Timestamp.valueOf(abierta));
            ps.setDate(6, Date.valueOf(cierre));
            ps.executeUpdate();
            id = clave(ps);
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_PREGUNTA (ENCUESTA, ORDEN, TIPO, TEXTO) VALUES (?,?,?,?)")) {
            for (int i = 0; i < preguntas.length; i++) {
                ps.setInt(1, id);
                ps.setInt(2, i + 1);
                ps.setString(3, preguntas[i][0]);
                ps.setString(4, preguntas[i][1]);
                ps.addBatch();
            }
            ps.executeBatch();
        }
        return id;
    }

    /** Responde como lo haría la aplicación: participación por un lado y respuestas sin usuario por otro. */
    private static void responder(Connection c, int encuesta, String papel, int[] valores, String comentario) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_PARTICIPACION (ENCUESTA, USUARIO) VALUES (?,?)")) {
            ps.setInt(1, encuesta);
            ps.setString(2, u(papel));
            ps.executeUpdate();
        }
        List<Integer> ids = new java.util.ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT ID FROM ENCUESTA_PREGUNTA WHERE ENCUESTA = ? ORDER BY ORDEN")) {
            ps.setInt(1, encuesta);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) ids.add(rs.getInt(1));
            }
        }
        String envio = UUID.randomUUID().toString();
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO ENCUESTA_RESPUESTA (ENVIO, ENCUESTA, PREGUNTA, DEPARTAMENTO, VALOR, TEXTO)"
                + " VALUES (?,?,?,?,?,?)")) {
            for (int i = 0; i < ids.size(); i++) {
                boolean texto = i >= valores.length;
                if (texto && comentario == null) continue;
                ps.setString(1, envio);
                ps.setInt(2, encuesta);
                ps.setInt(3, ids.get(i));
                ps.setString(4, Personas.de(papel).departamento());
                if (texto) ps.setNull(5, java.sql.Types.SMALLINT); else ps.setInt(5, valores[i]);
                ps.setString(6, texto ? comentario : null);
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private static void aviso(PreparedStatement ps, String u, String clase, int objeto, String texto, int leido, LocalDateTime cuando) throws SQLException {
        ps.setString(1, u);
        ps.setString(2, "comunicacion");
        ps.setString(3, clase);
        ps.setInt(4, objeto);
        ps.setString(5, texto);
        ps.setInt(6, leido);
        ps.setTimestamp(7, Timestamp.valueOf(cuando));
        ps.addBatch();
    }

    private static int clave(PreparedStatement ps) throws SQLException {
        try (ResultSet k = ps.getGeneratedKeys()) {
            k.next();
            return k.getInt(1);
        }
    }
}
