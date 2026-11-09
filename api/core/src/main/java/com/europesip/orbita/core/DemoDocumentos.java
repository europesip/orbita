package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.Map;

/**
 * Datos de demostración de Mis documentos (los carga Demo.cargar, después de Personas). Los PDF se generan aquí (Pdf)
 * y dicen en grande que son de demostración. La historia, por papeles:
 *  - Toda la plantilla tiene sus nóminas de los últimos 10 meses (con la paga extra de junio o de diciembre), los
 *    informes de cotización de los tres últimos meses y el certificado de retenciones del año pasado. La nómina del
 *    último mes está sin abrir.
 *  - tecnologia-3, recién incorporado, tiene su contrato pendiente de firmar el recibí y una nómina de días sueltos.
 *  - ventas-2 tiene un certificado de empresa que pidió a RRHH.
 *  - ventas-1 ha enviado a RRHH un justificante médico (pendiente de revisar); tecnologia-1, su titulación (revisada);
 *    ventas-2, sus datos bancarios (devueltos: el titular no coincide).
 */
final class DemoDocumentos {

    private DemoDocumentos() {}

    private static String u(String papel) { return Personas.u(papel); }

    /** Bruto anual (en euros, 14 pagas) de cada papel. */
    private static final Map<String, Integer> ANUAL = Map.of("rrhh", 62000, "ventas-responsable", 54000, "ventas-1", 34000,
            "ventas-2", 33000, "tecnologia-responsable", 56000, "tecnologia-1", 38000, "tecnologia-2", 35000, "tecnologia-3", 26000,
            "administracion", 46000);
    private static final String EMPRESA = "Empresa de demostración ÓRBITA, S.L.";
    /** Cotización del trabajador: contingencias comunes, desempleo, formación profesional y MEI. */
    private static final double[][] SS = {{4.70}, {1.55}, {0.10}, {0.15}};
    private static final String[] SS_NOMBRE = {"Contingencias comunes", "Desempleo", "Formación profesional", "Mecanismo de equidad (MEI)"};

    static void cargar(Connection c, LocalDate hoy) throws SQLException {
        Map<String, LocalDate> alta = new HashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, INCORPORACION FROM EMPLEADO"); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) if (rs.getDate(2) != null) alta.put(rs.getString(1), rs.getDate(2).toLocalDate());
        }
        // Última nómina publicada: la del mes en curso si ya es día 28, si no la del mes anterior
        YearMonth ultimo = hoy.getDayOfMonth() >= 28 ? YearMonth.from(hoy) : YearMonth.from(hoy).minusMonths(1);
        String rrhh = u("rrhh"), admin = u("administracion");
        for (Personas.Persona per : Personas.todas()) {
            String papel = per.papel();
            LocalDate inc = alta.getOrDefault(per.uid(), hoy.minusYears(3));
            double anual = ANUAL.get(papel);
            for (int k = 9; k >= 0; k--) {
                YearMonth mes = ultimo.minusMonths(k);
                if (mes.isBefore(YearMonth.from(inc))) continue;
                boolean ultimoMes = k == 0;
                // Días trabajados del mes (quien entra a mitad cobra la parte proporcional)
                double parte = 1;
                if (YearMonth.from(inc).equals(mes)) parte = (mes.lengthOfMonth() - inc.getDayOfMonth() + 1) / (double) mes.lengthOfMonth();
                nomina(c, per, mes, false, anual, parte, admin, ultimoMes);
                if ((mes.getMonthValue() == 6 || mes.getMonthValue() == 12) && !mes.isBefore(YearMonth.from(inc).plusMonths(1))) {
                    nomina(c, per, mes, true, anual, 1, admin, ultimoMes);
                }
                if (k <= 2) cotizacion(c, per, mes, anual * parte, admin, ultimoMes);
            }
            if (inc.isBefore(LocalDate.of(hoy.getYear(), 1, 1))) retenciones(c, per, hoy.getYear() - 1, anual, inc, admin);
        }

        // Contrato de tecnologia-3, pendiente de recibí
        Personas.Persona pablo = Personas.de("tecnologia-3");
        LocalDate incPablo = alta.getOrDefault(pablo.uid(), hoy.minusDays(18));
        Pdf contrato = cabecera("Contrato de trabajo", "Indefinido · jornada completa (39 horas semanales)");
        persona(contrato, pablo, "Fecha de inicio", incPablo.toString());
        int y = 300;
        for (String l : new String[] {"Primera. La persona trabajadora prestará sus servicios como " + pablo.puesto() + " en el departamento de "
                + pablo.departamento() + ".", "Segunda. La jornada será de 39 horas semanales, de lunes a jueves 8 horas y viernes 7 horas.",
            "Tercera. La retribución bruta anual será de " + Documentos.euros(ANUAL.get("tecnologia-3") * 100L) + " en 14 pagas.",
            "Cuarta. El periodo de prueba será de seis meses.", "Quinta. Vacaciones: 22 días laborables al año y 2 días de asuntos propios."}) {
            contrato.texto(50, y, 10, false, l);
            y += 22;
        }
        pie(contrato);
        int idContrato = Documentos.insertar(c, pablo.uid(), "EMPRESA", "CONTRATO", "Contrato de trabajo", null, "contrato-" + pablo.uid() + ".pdf",
                "application/pdf", contrato.bytes(), "Léelo con calma y firma el recibí cuando lo tengas claro.", rrhh,
                incPablo.atTime(9, 15), true);
        Social.avisar(c, pablo.uid(), "documentos", "DOCUMENTO", idContrato, "documento.recibir", obj("titulo", "Contrato de trabajo"),
                "Tienes un documento nuevo: «Contrato de trabajo». Revísalo y firma el recibí.");

        // Certificado de empresa de ventas-2 (lo pidió a RRHH)
        Personas.Persona javier = Personas.de("ventas-2");
        Pdf cert = cabecera("Certificado de empresa", "A petición de la persona interesada, para presentar en su banco");
        persona(cert, javier, "Antigüedad", alta.getOrDefault(javier.uid(), hoy.minusYears(2)).toString());
        cert.texto(50, 300, 10, false, EMPRESA + " certifica que " + javier.nombre() + " trabaja en la empresa con un contrato indefinido");
        cert.texto(50, 316, 10, false, "a jornada completa, con una retribución bruta anual de " + Documentos.euros(ANUAL.get("ventas-2") * 100L) + ".");
        pie(cert);
        int idCert = Documentos.insertar(c, javier.uid(), "EMPRESA", "CERTIFICADO", "Certificado de empresa para el banco", null,
                "certificado-empresa-" + javier.uid() + ".pdf", "application/pdf", cert.bytes(), null, rrhh, hoy.minusDays(4).atTime(12, 40), false);
        leido(c, idCert, hoy.minusDays(4).atTime(13, 5));

        // Documentos que la plantilla ha enviado a RRHH
        Personas.Persona lucia = Personas.de("ventas-1"), david = Personas.de("tecnologia-1");
        int just = Documentos.insertar(c, lucia.uid(), "EMPLEADO", "JUSTIFICANTE", "Justificante de consulta médica", null, "justificante-medico.pdf",
                "application/pdf", simple("Justificante de asistencia a consulta médica", lucia.nombre() + " ha asistido a consulta médica de 9:00 a 11:30."),
                "Es el de la pausa de médico de esta semana.", lucia.uid(), hoy.minusDays(2).atTime(11, 50), false);
        estado(c, just, "PENDIENTE", null, null, null);
        Social.avisar(c, rrhh, "documentos", "DOCUMENTO", just, "documento.enviado", obj("quien", lucia.nombre(), "titulo", "Justificante de consulta médica"),
                lucia.nombre() + " ha enviado a RRHH «Justificante de consulta médica».");
        int tit = Documentos.insertar(c, david.uid(), "EMPLEADO", "TITULACION", "Certificación en Kubernetes", null, "certificacion-kubernetes.pdf",
                "application/pdf", simple("Certificado de formación", david.nombre() + " ha superado la certificación de administración de Kubernetes."),
                null, david.uid(), hoy.minusDays(21).atTime(16, 10), false);
        estado(c, tit, "REVISADO", rrhh, hoy.minusDays(20).atTime(9, 30), "Añadida a tu expediente. ¡Enhorabuena!");
        int banco = Documentos.insertar(c, javier.uid(), "EMPLEADO", "BANCARIO", "Cambio de cuenta para la nómina", null, "certificado-titularidad.pdf",
                "application/pdf", simple("Certificado de titularidad de cuenta", "Cuenta ES00 0000 0000 0000 0000 0000 (datos de demostración)."),
                "Quiero cobrar la nómina en esta cuenta a partir del mes que viene.", javier.uid(), hoy.minusDays(6).atTime(10, 20), false);
        estado(c, banco, "RECHAZADO", rrhh, hoy.minusDays(5).atTime(17, 0),
                "El titular del certificado no eres tú. Necesitamos un certificado de titularidad a tu nombre.");

        // La nómina del último mes, sin abrir: aviso a ventas-1 (el resto también la tiene sin abrir)
        Social.avisar(c, lucia.uid(), "documentos", "DOCUMENTO", null, "documento.nuevo",
                obj("titulo", Documentos.tituloPorDefecto("NOMINA", ultimo.toString(), false)),
                "Tienes un documento nuevo: «" + Documentos.tituloPorDefecto("NOMINA", ultimo.toString(), false) + "».");
    }

    // ---------------------------------------------------------------------------------------------- Nóminas

    private static double irpf(double anual) {
        return anual <= 28000 ? 11 : anual <= 35000 ? 14 : anual <= 45000 ? 17 : anual <= 55000 ? 20 : 23;
    }

    private static void nomina(Connection c, Personas.Persona per, YearMonth mes, boolean extra, double anual, double parte, String admin,
            boolean nueva) throws SQLException {
        long base = Math.round(anual / 14 * 100 * parte);                  // salario del mes (o de la paga extra), en céntimos
        long salario = Math.round(base * 0.85), complemento = base - salario;
        // La Seguridad Social se paga en las ordinarias sobre la base con las extras prorrateadas; en la extra, no
        long baseCot = extra ? 0 : Math.round(anual / 12 * 100 * parte);
        long[] ss = new long[SS.length];
        long totalSs = 0;
        for (int i = 0; i < SS.length; i++) {
            ss[i] = Math.round(baseCot * SS[i][0] / 100);
            totalSs += ss[i];
        }
        double tipoIrpf = irpf(anual);
        long irpf = Math.round(base * tipoIrpf / 100);
        long neto = base - totalSs - irpf;

        Pdf d = cabecera(extra ? "Paga extraordinaria" : "Recibo individual de salarios",
                "Periodo: " + Documentos.periodoTexto(mes.toString()) + (extra ? " · paga extra" : "") + "   ·   Días: "
                        + Math.round(mes.lengthOfMonth() * parte));
        persona(d, per, "Grupo de cotización", per.rol().equals("EMPLEADO") ? "Grupo 2" : "Grupo 1");
        int y = 286;
        y = seccion(d, y, "DEVENGOS");
        if (extra) {
            y = fila(d, y, "Paga extraordinaria", base);
        } else {
            y = fila(d, y, "Salario base", salario);
            y = fila(d, y, "Complemento de puesto", complemento);
        }
        y = total(d, y, "A. TOTAL DEVENGADO", base);
        y = seccion(d, y + 10, "DEDUCCIONES");
        for (int i = 0; i < SS.length; i++) if (!extra) y = fila(d, y, SS_NOMBRE[i] + " " + String.format("%.2f", SS[i][0]).replace('.', ',') + " %", ss[i]);
        y = fila(d, y, "Retención IRPF " + String.format("%.2f", tipoIrpf).replace('.', ',') + " %", irpf);
        y = total(d, y, "B. TOTAL A DEDUCIR", totalSs + irpf);
        d.color(5, 80, 220).rect(50, y + 14, 495, 34).color(255, 255, 255);
        d.texto(62, y + 36, 12, true, "LÍQUIDO TOTAL A PERCIBIR (A - B)");
        d.derecha(533, y + 36, 14, true, Documentos.euros(neto));
        d.color(0, 0, 0);
        if (!extra) d.texto(50, y + 76, 8, false, "Base de cotización por contingencias comunes: " + Documentos.euros(baseCot)
                + "   ·   Base sujeta a retención del IRPF: " + Documentos.euros(base));
        pie(d);
        LocalDateTime cuando = mes.atDay(Math.min(28, mes.lengthOfMonth())).atTime(extra ? 10 : 9, 0);
        String titulo = Documentos.tituloPorDefecto("NOMINA", mes.toString(), extra);
        int id = Documentos.insertar(c, per.uid(), "EMPRESA", "NOMINA", titulo, mes.toString(),
                (extra ? "paga-extra-" : "nomina-") + mes + "-" + per.uid() + ".pdf", "application/pdf", d.bytes(), null, admin, cuando, false);
        Documentos.insertarNomina(c, id, new int[] {(int) base, (int) irpf, (int) totalSs, 0, (int) neto}, extra);
        if (!nueva) leido(c, id, cuando.plusDays(1).withHour(8).withMinute(40));
    }

    private static void cotizacion(Connection c, Personas.Persona per, YearMonth mes, double anualParte, String admin, boolean nueva) throws SQLException {
        long base = Math.round(anualParte / 12 * 100);
        Pdf d = cabecera("Informe de bases de cotización", "Periodo: " + Documentos.periodoTexto(mes.toString()));
        persona(d, per, "Régimen", "General");
        int y = seccion(d, 286, "BASES");
        y = fila(d, y, "Base de contingencias comunes", base);
        y = fila(d, y, "Base de contingencias profesionales", base);
        y = seccion(d, y + 10, "APORTACIÓN DE LA PERSONA TRABAJADORA");
        long trab = 0;
        for (int i = 0; i < SS.length; i++) {
            long v = Math.round(base * SS[i][0] / 100);
            trab += v;
            y = fila(d, y, SS_NOMBRE[i] + " " + String.format("%.2f", SS[i][0]).replace('.', ',') + " %", v);
        }
        y = total(d, y, "Total persona trabajadora", trab);
        y = seccion(d, y + 10, "APORTACIÓN DE LA EMPRESA");
        long emp = Math.round(base * 0.3215);
        y = fila(d, y, "Contingencias comunes, desempleo, FOGASA, FP, MEI y AT/EP (32,15 %)", emp);
        total(d, y, "Total cotización del mes", trab + emp);
        pie(d);
        LocalDateTime cuando = mes.plusMonths(1).atDay(5).atTime(9, 30);
        if (cuando.isAfter(LocalDateTime.now())) cuando = mes.atDay(Math.min(28, mes.lengthOfMonth())).atTime(9, 30);
        int id = Documentos.insertar(c, per.uid(), "EMPRESA", "COTIZACION", Documentos.tituloPorDefecto("COTIZACION", mes.toString(), false),
                mes.toString(), "cotizacion-" + mes + "-" + per.uid() + ".pdf", "application/pdf", d.bytes(), null, admin, cuando, false);
        if (!nueva) leido(c, id, cuando.plusDays(2));
    }

    private static void retenciones(Connection c, Personas.Persona per, int anio, double anual, LocalDate inc, String admin) throws SQLException {
        double parte = inc.getYear() == anio ? (12 - inc.getMonthValue() + 1) / 12.0 : 1;
        long bruto = Math.round(anual * 100 * parte), irpf = Math.round(bruto * irpf(anual) / 100), ss = Math.round(bruto * 0.065);
        Pdf d = cabecera("Certificado de retenciones e ingresos a cuenta del IRPF", "Ejercicio " + anio);
        persona(d, per, "Ejercicio", String.valueOf(anio));
        int y = seccion(d, 286, "RENDIMIENTOS DEL TRABAJO");
        y = fila(d, y, "Retribuciones dinerarias íntegras", bruto);
        y = fila(d, y, "Retenciones practicadas", irpf);
        y = fila(d, y, "Cotizaciones a la Seguridad Social (gasto deducible)", ss);
        total(d, y, "Rendimiento neto", bruto - ss);
        d.texto(50, y + 60, 9, false, "Utilízalo para tu declaración de la renta de " + anio + ".");
        pie(d);
        int id = Documentos.insertar(c, per.uid(), "EMPRESA", "RETENCIONES", "Certificado de retenciones de " + anio, String.valueOf(anio),
                "retenciones-" + anio + "-" + per.uid() + ".pdf", "application/pdf", d.bytes(), null, admin, LocalDate.of(anio + 1, 2, 27).atTime(10, 0), false);
        leido(c, id, LocalDate.of(anio + 1, 3, 2).atTime(9, 0));
    }

    // ---------------------------------------------------------------------------------------------- Maquetación

    private static Pdf cabecera(String titulo, String sub) {
        Pdf d = new Pdf();
        d.color(5, 80, 220).rect(0, 0, Pdf.ANCHO, 92).color(255, 255, 255);
        d.texto(50, 40, 20, true, titulo);
        d.texto(50, 64, 11, false, sub);
        d.derecha(545, 40, 11, true, "ÓRBITA");
        d.derecha(545, 58, 8, false, EMPRESA);
        d.derecha(545, 70, 8, false, "CIF B00000000 · Calle de Ejemplo 1, Madrid");
        // Marca de agua: que nadie lo confunda con un documento real
        d.color(220, 40, 40).texto(50, 112, 9, true, "DOCUMENTO DE DEMOSTRACIÓN · DATOS FICTICIOS · SIN VALIDEZ").color(0, 0, 0);
        return d;
    }

    private static void persona(Pdf d, Personas.Persona per, String etiqueta, String valor) {
        d.color(244, 244, 244).rect(50, 128, 495, 120).color(0, 0, 0);
        String[][] datos = {{"Persona trabajadora", per.nombre()}, {"Usuario", per.uid()}, {"Puesto", per.puesto()},
            {"Departamento", per.departamento()}, {etiqueta, valor}};
        int y = 150;
        for (String[] x : datos) {
            d.color(90, 90, 90).texto(66, y, 9, false, x[0]).color(0, 0, 0).texto(200, y, 10, true, x[1]);
            y += 21;
        }
    }

    private static int seccion(Pdf d, int y, String titulo) {
        d.color(5, 80, 220).texto(50, y, 9, true, titulo).color(0, 0, 0);
        d.linea(50, y + 6, 545, y + 6, .6f);
        return y + 24;
    }

    private static int fila(Pdf d, int y, String concepto, long cent) {
        d.texto(60, y, 10, false, concepto);
        d.derecha(533, y, 10, false, Documentos.euros(cent));
        return y + 18;
    }

    private static int total(Pdf d, int y, String concepto, long cent) {
        d.linea(330, y - 8, 545, y - 8, .4f);
        d.texto(60, y + 4, 10, true, concepto);
        d.derecha(533, y + 4, 10, true, Documentos.euros(cent));
        return y + 24;
    }

    private static void pie(Pdf d) {
        d.linea(50, 790, 545, 790, .4f);
        d.color(110, 110, 110).texto(50, 806, 8, false, "Generado por ÓRBITA con datos de demostración. No es un documento oficial ni tiene validez.");
        d.color(0, 0, 0);
    }

    /** Un PDF sencillo de una página (los documentos que envía la plantilla). */
    private static byte[] simple(String titulo, String texto) {
        Pdf d = new Pdf();
        d.texto(50, 70, 18, true, titulo);
        d.color(220, 40, 40).texto(50, 92, 9, true, "DOCUMENTO DE DEMOSTRACIÓN · DATOS FICTICIOS · SIN VALIDEZ").color(0, 0, 0);
        d.texto(50, 130, 11, false, texto);
        pie(d);
        return d.bytes();
    }

    private static void leido(Connection c, int id, LocalDateTime cuando) throws SQLException {
        if (cuando.isAfter(LocalDateTime.now())) cuando = LocalDateTime.now().minusHours(1);
        try (PreparedStatement ps = c.prepareStatement("UPDATE DOCUMENTO SET LEIDO = ? WHERE ID = ?")) {
            ps.setTimestamp(1, Timestamp.valueOf(cuando));
            ps.setInt(2, id);
            ps.executeUpdate();
        }
    }

    private static void estado(Connection c, int id, String estado, String quien, LocalDateTime cuando, String comentario) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("UPDATE DOCUMENTO SET ESTADO = ?, REVISADO_POR = ?, REVISADO = ?, COMENTARIO_RRHH = ? WHERE ID = ?")) {
            ps.setString(1, estado);
            ps.setString(2, quien);
            ps.setTimestamp(3, cuando == null ? null : Timestamp.valueOf(cuando));
            ps.setString(4, comentario);
            ps.setInt(5, id);
            ps.executeUpdate();
        }
    }
}
