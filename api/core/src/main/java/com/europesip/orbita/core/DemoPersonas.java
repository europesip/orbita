package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Datos de demostración de Personas (los carga Demo.cargar). La historia, por papeles:
 *  - Cada persona tiene contacto, sede (Madrid o Valencia), habilidades, idiomas y unas líneas sobre ella.
 *  - Celebraciones de los próximos días: ventas-2 cumple años hoy y tecnologia-2 dentro de 3 días (los dos lo muestran;
 *    ventas-1 no lo muestra); ventas-responsable cumple 5 años en la empresa dentro de 6 días y administracion 10
 *    dentro de 19; tecnologia-3 se incorporó hace 18 días.
 *  - Reconocimientos entre compañeros: el último de ventas-1 se lo ha hecho su responsable hace 2 días (lo ve en Mi
 *    intranet, con su aviso sin leer).
 * Las fechas son relativas al día de la carga.
 */
final class DemoPersonas {

    private DemoPersonas() {}

    private static String u(String papel) { return Personas.u(papel); }

    // papel, sede, ubicación, teléfono, extensión, idiomas, habilidades, sobre mí
    private static final String[][] PERFILES = {
        {"rrhh", "Madrid", "Planta 4 · Personas", "+34 910 000 410", "4100", "Español, Inglés",
            "Gestión de personas, Selección, Relaciones laborales, Comunicación interna, Liderazgo",
            "Llevo la Dirección de Personas. Si tienes una idea para que trabajar aquí sea mejor, mi puerta está abierta."},
        {"ventas-responsable", "Madrid", "Planta 3 · Ventas", "+34 910 000 320", "3200", "Español, Inglés, Portugués",
            "Negociación, Ventas consultivas, Previsión de ventas, Liderazgo de equipos, Cuentas clave",
            "Dirijo el equipo de Ventas. Antes de vender, escuchar: es lo que más repito al equipo."},
        {"ventas-1", "Madrid", "Planta 3 · Ventas", "+34 910 000 321", "3211", "Español, Inglés",
            "Licitaciones públicas, Presentaciones, Prospección, Negociación",
            "Comercial del sector público. Me encantan las presentaciones difíciles y el café de media mañana."},
        {"ventas-2", "Valencia", "Oficina de Valencia", "+34 960 000 322", "3222", "Español, Valenciano, Inglés",
            "Cuentas clave, Distribución, Demostraciones de producto",
            "Llevo los clientes de Levante desde la oficina de Valencia. Pregúntame por cualquier cliente de la zona."},
        {"tecnologia-responsable", "Madrid", "Planta 2 · Tecnología", "+34 910 000 230", "2300", "Español, Inglés, Alemán",
            "Arquitectura de software, Kubernetes, Seguridad, Liderazgo técnico, HCL DX",
            "Responsable de Tecnología. Me interesa que lo que construimos sea sencillo de mantener."},
        {"tecnologia-1", "Madrid", "Planta 2 · Tecnología", "+34 910 000 231", "2311", "Español, Inglés",
            "Java, React, PostgreSQL, Kubernetes, APIs REST, HCL DX",
            "Desarrollador. Si algo de la intranet no funciona, seguramente lo he tocado yo (y lo arreglo)."},
        {"tecnologia-2", "Valencia", "Oficina de Valencia", "+34 960 000 232", "2322", "Español, Inglés, Francés",
            "Diseño de interfaces, Accesibilidad, Investigación de usuarios, Prototipado",
            "Diseño las pantallas que usáis cada día. Siempre busco voluntarios para probar prototipos."},
        {"tecnologia-3", "Madrid", "Planta 2 · Soporte", "+34 910 000 233", "2333", "Español, Inglés",
            "Soporte técnico, Puestos de trabajo, Redes, Linux, Atención al usuario",
            "Recién llegado al equipo de soporte. ¿Problemas con el portátil? Escríbeme."},
        {"administracion", "Madrid", "Planta 4 · Administración", "+34 910 000 440", "4400", "Español, Inglés",
            "Contabilidad, Tesorería, Fiscalidad, Control de gastos",
            "Me encargo de que las notas de gasto se paguen a tiempo. Tickets legibles, por favor."},
    };

    static void cargar(Connection c, LocalDate hoy) throws SQLException {
        // Incorporación: aniversarios de ventas-responsable (5 años, en 6 días) y administracion (10, en 19 días) y la
        // llegada de tecnologia-3 hace 18 días; el resto, en fechas que no caen en los próximos 30 días
        java.util.Map<String, LocalDate> incorporacion = java.util.Map.of(
                "rrhh", hoy.minusYears(12).minusDays(140),
                "ventas-responsable", hoy.plusDays(6).minusYears(5),
                "ventas-1", hoy.minusYears(3).minusDays(200),
                "ventas-2", hoy.minusYears(2).minusDays(40),
                "tecnologia-responsable", hoy.minusYears(7).minusDays(80),
                "tecnologia-1", hoy.minusYears(4).minusDays(100),
                "tecnologia-2", hoy.minusYears(1).minusDays(150),
                "tecnologia-3", hoy.minusDays(18),
                "administracion", hoy.plusDays(19).minusYears(10));
        // Cumpleaños (MM-DD): ventas-2 hoy y tecnologia-2 en 3 días, visibles; ventas-1 lo tiene guardado pero oculto
        java.util.Map<String, LocalDate> cumple = java.util.Map.of(
                "ventas-2", hoy, "tecnologia-2", hoy.plusDays(3), "ventas-1", hoy.plusDays(9), "tecnologia-1", hoy.minusDays(70));
        java.util.Set<String> visible = java.util.Set.of("ventas-2", "tecnologia-2", "tecnologia-1");

        try (PreparedStatement ps = c.prepareStatement("UPDATE EMPLEADO SET EMAIL = ?, TELEFONO = ?, EXTENSION = ?, SEDE = ?, UBICACION = ?,"
                + " INCORPORACION = ?, SOBRE_MI = ?, HABILIDADES = ?, IDIOMAS = ?, CUMPLEANOS = ?, CUMPLE_VISIBLE = ? WHERE USUARIO = ?")) {
            for (String[] x : PERFILES) {
                Personas.Persona p = Personas.de(x[0]);
                LocalDate cu = cumple.get(x[0]);
                ps.setString(1, correo(p.nombre()));
                ps.setString(2, x[3]);
                ps.setString(3, x[4]);
                ps.setString(4, x[1]);
                ps.setString(5, x[2]);
                ps.setDate(6, Date.valueOf(incorporacion.get(x[0])));
                ps.setString(7, x[7]);
                ps.setString(8, x[6]);
                ps.setString(9, x[5]);
                ps.setString(10, cu == null ? null : String.format("%02d-%02d", cu.getMonthValue(), cu.getDayOfMonth()));
                ps.setInt(11, visible.contains(x[0]) ? 1 : 0);
                ps.setString(12, p.uid());
                ps.addBatch();
            }
            ps.executeBatch();
        }

        // Reconocimientos entre compañeros
        LocalDateTime ahora = LocalDateTime.now().withSecond(0).withNano(0);
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO RECONOCIMIENTO (DE, PARA, VALOR, TEXTO, CREADO) VALUES (?,?,?,?,?)")) {
            reconocimiento(ps, "ventas-2", "ventas-1", "EQUIPO", "Por preparar conmigo la oferta de la licitación aunque no era tuya. Así da gusto.",
                    ahora.minusDays(20).withHour(18).withMinute(5));
            reconocimiento(ps, "rrhh", "administracion", "EQUIPO", "Cierre del trimestre impecable y a tiempo, como siempre. ¡Gracias!",
                    ahora.minusDays(12).withHour(9).withMinute(40));
            reconocimiento(ps, "tecnologia-1", "tecnologia-2", "IDEA", "El rediseño del formulario de gastos ha reducido a la mitad las dudas que nos llegan.",
                    ahora.minusDays(9).withHour(12).withMinute(15));
            reconocimiento(ps, "ventas-1", "ventas-2", "AYUDA", "Por cubrirme la visita al cliente del jueves sin que te lo pidiera.",
                    ahora.minusDays(6).withHour(16).withMinute(30));
            reconocimiento(ps, "tecnologia-responsable", "tecnologia-1", "LOGRO", "Despliegue del nuevo portal sin una sola incidencia. Enorme trabajo.",
                    ahora.minusDays(4).withHour(19).withMinute(10));
            reconocimiento(ps, "ventas-responsable", "ventas-1", "CLIENTE", "La presentación al cliente de Valencia fue redonda: salieron convencidos.",
                    ahora.minusDays(2).withHour(17).withMinute(20));
            reconocimiento(ps, "tecnologia-2", "tecnologia-3", "AYUDA", "Bienvenido: en tu segunda semana ya me has dejado el portátil como nuevo.",
                    ahora.minusDays(1).withHour(11).withMinute(0));
            ps.executeBatch();
        }
        Personas.Persona carlos = Personas.de("ventas-responsable");
        Social.avisar(c, u("ventas-1"), "personas", "RECONOCER", null, "reconocimiento.recibido", obj("quien", carlos.nombre(), "valor", "CLIENTE"),
                carlos.nombre() + " te ha hecho un reconocimiento: «Pasión por el cliente».");
    }

    private static void reconocimiento(PreparedStatement ps, String de, String para, String valor, String texto, LocalDateTime cuando) throws SQLException {
        ps.setString(1, u(de));
        ps.setString(2, u(para));
        ps.setString(3, valor);
        ps.setString(4, texto);
        ps.setTimestamp(5, Timestamp.valueOf(cuando));
        ps.addBatch();
    }

    /** «Lucía Martín» → lucia.martin@example.com (dominio reservado para ejemplos: nunca llega a nadie). */
    static String correo(String nombre) {
        String s = Directorio.plano(nombre).replaceAll("[^a-z0-9 ]", "").trim().replaceAll("\\s+", ".");
        return (s.isEmpty() ? "persona" : s) + "@example.com";
    }
}
