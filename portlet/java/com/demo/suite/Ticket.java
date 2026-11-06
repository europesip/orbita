package com.demo.suite;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Random;

import javax.imageio.ImageIO;

/** Tickets de ejemplo para los datos de demostración: un recibo de papel dibujado en PNG. */
final class Ticket {

    private Ticket() {}

    /** conceptos: {descripción, céntimos}; el total es la suma; IVA incluido con el porcentaje indicado. */
    static byte[] png(String comercio, String direccion, String cif, LocalDate fecha, String hora, String[][] conceptos, int ivaPct) {
        int ancho = 380, alto = 330 + conceptos.length * 26;
        BufferedImage img = new BufferedImage(ancho + 40, alto + 40, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(new Color(0x9aa0ab));
        g.fillRect(0, 0, img.getWidth(), img.getHeight());

        // Papel con el borde inferior rasgado y una leve sombra
        Random r = new Random(comercio.hashCode() + fecha.hashCode());
        Path2D papel = new Path2D.Double();
        papel.moveTo(20, 20);
        papel.lineTo(20 + ancho, 20);
        papel.lineTo(20 + ancho, 20 + alto);
        for (int x = ancho; x >= 0; x -= 10) papel.lineTo(20 + x, 20 + alto - (x / 10 % 2 == 0 ? 0 : 7) - r.nextInt(3));
        papel.closePath();
        g.translate(4, 5);
        g.setColor(new Color(0, 0, 0, 50));
        g.fill(papel);
        g.translate(-4, -5);
        g.setColor(new Color(0xfbfaf6));
        g.fill(papel);

        Font normal = new Font(Font.MONOSPACED, Font.PLAIN, 15), negrita = new Font(Font.MONOSPACED, Font.BOLD, 18);
        g.setColor(new Color(0x2b2b2b));
        int y = 62;
        y = centrado(g, negrita, comercio.toUpperCase(), ancho, y) + 22;
        y = centrado(g, normal, direccion, ancho, y) + 20;
        y = centrado(g, normal, "CIF " + cif, ancho, y) + 26;
        g.setFont(normal);
        g.drawString(fecha.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")) + "  " + hora, 44, y);
        g.drawString("Ticket " + (1000 + r.nextInt(8999)), 44 + 220, y);
        y += 16;
        linea(g, ancho, y);
        y += 28;
        int total = 0;
        for (String[] c : conceptos) {
            int cent = Integer.parseInt(c[1]);
            total += cent;
            g.drawString(c[0].length() > 26 ? c[0].substring(0, 26) : c[0], 44, y);
            derecha(g, euros(cent), ancho, y);
            y += 26;
        }
        linea(g, ancho, y - 8);
        y += 22;
        int base = Math.round(total / (1 + ivaPct / 100f));
        g.drawString("Base imponible", 44, y);
        derecha(g, euros(base), ancho, y);
        y += 22;
        g.drawString("IVA " + ivaPct + "%", 44, y);
        derecha(g, euros(total - base), ancho, y);
        y += 32;
        g.setFont(negrita);
        g.drawString("TOTAL", 44, y);
        derecha(g, euros(total) + " EUR", ancho, y);
        y += 34;
        g.setFont(normal);
        g.drawString("Pago con tarjeta **** " + (1000 + r.nextInt(8999)), 44, y);
        y += 30;
        centrado(g, normal, "Gracias por su visita", ancho, y);
        g.dispose();
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static String euros(int cent) {
        return String.format("%d,%02d", cent / 100, Math.abs(cent) % 100);
    }

    private static int centrado(Graphics2D g, Font f, String s, int ancho, int y) {
        g.setFont(f);
        FontMetrics fm = g.getFontMetrics();
        g.drawString(s, 20 + (ancho - fm.stringWidth(s)) / 2, y);
        return y;
    }

    private static void derecha(Graphics2D g, String s, int ancho, int y) {
        g.drawString(s, 20 + ancho - 24 - g.getFontMetrics().stringWidth(s), y);
    }

    private static void linea(Graphics2D g, int ancho, int y) {
        g.setStroke(new BasicStroke(1, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10, new float[] {4, 4}, 0));
        g.drawLine(44, y, 20 + ancho - 24, y);
        g.setStroke(new BasicStroke(1));
    }
}
