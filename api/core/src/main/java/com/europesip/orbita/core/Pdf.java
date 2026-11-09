package com.europesip.orbita.core;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Generador de PDF mínimo (una página A4, Helvetica y Helvetica-Bold con WinAnsiEncoding: acentos, ñ y €), sin
 * dependencias. Solo lo usan los datos de demostración para crear nóminas, informes de cotización y certificados de
 * ejemplo. Coordenadas en puntos desde la esquina superior izquierda (y hacia abajo).
 */
final class Pdf {

    static final float ANCHO = 595, ALTO = 842;
    private static final Charset WIN = Charset.forName("windows-1252");
    private final StringBuilder c = new StringBuilder();

    /** Texto; tam en puntos. */
    Pdf texto(float x, float y, float tam, boolean negrita, String s) {
        c.append(String.format(Locale.ROOT, "BT /%s %.1f Tf %.2f %.2f Td (%s) Tj ET%n", negrita ? "F2" : "F1", tam, x, ALTO - y, cadena(s)));
        return this;
    }

    /** Texto alineado a la derecha en x. */
    Pdf derecha(float x, float y, float tam, boolean negrita, String s) {
        return texto(x - ancho(s, tam, negrita), y, tam, negrita, s);
    }

    /** Color de relleno para lo siguiente (texto y rectángulos), en RGB de 0 a 255. */
    Pdf color(int r, int g, int b) {
        c.append(String.format(Locale.ROOT, "%.3f %.3f %.3f rg %.3f %.3f %.3f RG%n", r / 255f, g / 255f, b / 255f, r / 255f, g / 255f, b / 255f));
        return this;
    }

    Pdf rect(float x, float y, float w, float h) {
        c.append(String.format(Locale.ROOT, "%.2f %.2f %.2f %.2f re f%n", x, ALTO - y - h, w, h));
        return this;
    }

    Pdf linea(float x1, float y1, float x2, float y2, float grosor) {
        c.append(String.format(Locale.ROOT, "%.2f w %.2f %.2f m %.2f %.2f l S%n", grosor, x1, ALTO - y1, x2, ALTO - y2));
        return this;
    }

    /** El documento PDF completo. */
    byte[] bytes() {
        byte[] contenido = c.toString().getBytes(StandardCharsets.US_ASCII);
        List<String> obj = new ArrayList<>();
        obj.add("<< /Type /Catalog /Pages 2 0 R >>");
        obj.add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
        obj.add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>");
        obj.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
        obj.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        escribir(o, "%PDF-1.4\n%âãÏÓ\n");
        List<Integer> pos = new ArrayList<>();
        for (int i = 0; i < obj.size(); i++) {
            pos.add(o.size());
            escribir(o, (i + 1) + " 0 obj\n" + obj.get(i) + "\nendobj\n");
        }
        pos.add(o.size());
        escribir(o, "6 0 obj\n<< /Length " + contenido.length + " >>\nstream\n");
        o.writeBytes(contenido);
        escribir(o, "\nendstream\nendobj\n");
        int xref = o.size();
        StringBuilder x = new StringBuilder("xref\n0 7\n0000000000 65535 f \n");
        for (int p : pos) x.append(String.format("%010d 00000 n \n", p));
        x.append("trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n").append(xref).append("\n%%EOF\n");
        escribir(o, x.toString());
        return o.toByteArray();
    }

    private static void escribir(ByteArrayOutputStream o, String s) {
        o.writeBytes(s.getBytes(StandardCharsets.ISO_8859_1));
    }

    /** Cadena PDF en WinAnsi: los caracteres fuera de ASCII van en octal (\ddd) para que el contenido sea ASCII. */
    private static String cadena(String s) {
        StringBuilder b = new StringBuilder();
        for (byte x : s.getBytes(WIN)) {
            int v = x & 0xff;
            if (v == '(' || v == ')' || v == '\\') b.append('\\').append((char) v);
            else if (v < 32 || v > 126) b.append(String.format("\\%03o", v));
            else b.append((char) v);
        }
        return b.toString();
    }

    /** Anchura aproximada en Helvetica (exacta para cifras, puntuación y espacios: lo que se alinea a la derecha). */
    static float ancho(String s, float tam, boolean negrita) {
        float w = 0;
        for (char ch : s.toCharArray()) {
            if (Character.isDigit(ch) || ch == '€' || ch == '$') w += 556;
            else if (ch == '.' || ch == ',' || ch == ' ' || ch == ':' || ch == '/') w += 278;
            else if (ch == '-') w += 333;
            else if (ch == '%') w += 889;
            else if (Character.isUpperCase(ch)) w += negrita ? 722 : 667;
            else if (ch == 'i' || ch == 'l' || ch == 'j' || ch == 't' || ch == 'f' || ch == 'í') w += 278;
            else if (ch == 'm' || ch == 'w') w += 833;
            else w += 556;
        }
        return w * tam / 1000f;
    }
}
