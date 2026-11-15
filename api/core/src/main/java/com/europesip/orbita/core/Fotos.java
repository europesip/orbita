package com.europesip.orbita.core;

import static com.europesip.orbita.core.Json.obj;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

/**
 * Fotos de las personas (op=fotos.*), en EMPLEADO_FOTO (V7__fotos.sql). Las ven todas las personas con ficha, igual que
 * el directorio; cada persona pone o quita la suya y RRHH la de cualquiera. Es opcional: sin foto se ven las iniciales.
 *
 * La imagen que llega (JPG o PNG, por su contenido, como mucho 6 MB y 6.000 px de lado) se vuelve a dibujar: se recorta
 * en cuadrado por el centro, se reduce a 256 px y se guarda en JPEG. Así ocupa poco (unos 20 KB) y no conserva nada del
 * fichero original: ni la ubicación ni la cámara (EXIF), ni contenido oculto.
 *
 * La imagen en sí no va en JSON: la sirve el punto de acceso GET /v1/fotos/{usuario} de orbita-rest (ver imagen()),
 * con su versión para que el navegador la guarde en caché.
 */
final class Fotos {

    static final int LADO = 256;
    private static final int MAX_BYTES = 6 * 1024 * 1024;
    private static final int MAX_PIXELES_LADO = 6000;

    /** Una foto guardada: su tipo, sus bytes y su versión (milisegundos de la última actualización). */
    record Imagen(String tipo, byte[] datos, long version) {}

    private final Api api;
    private final Connection c;
    private final Api.Emp yo;

    Fotos(Api api, Connection c) {
        this.api = api;
        this.c = c;
        this.yo = api.yo();
    }

    Object ejecutar(String op, Map<String, String> p) throws SQLException {
        switch (op) {
            case "fotos.lista": return obj("fotos", versiones(c));
            case "fotos.subir": return subir(p.get("usuario"), p.get("datos"));
            case "fotos.borrar": return borrar(p.get("usuario"));
            default: throw new Api.Aviso("Operación desconocida: " + op);
        }
    }

    /** usuario → versión de su foto, de quien la tiene. La interfaz la pide una vez y pinta las fotos con ?v=versión. */
    static Map<String, Object> versiones(Connection c) throws SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO, ACTUALIZADA FROM EMPLEADO_FOTO ORDER BY USUARIO");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) m.put(rs.getString(1), rs.getTimestamp(2).getTime());
        }
        return m;
    }

    /** La foto de una persona, o null si no tiene. */
    static Imagen imagen(Connection c, String usuario) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT TIPO, FOTO, ACTUALIZADA FROM EMPLEADO_FOTO WHERE USUARIO = ?")) {
            ps.setString(1, usuario);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new Imagen(rs.getString(1), rs.getBytes(2), rs.getTimestamp(3).getTime()) : null;
            }
        }
    }

    private Api.Emp persona(String usuario) {
        if (usuario == null || usuario.isBlank()) throw new Api.Aviso("Indica de quién es la foto.");
        Api.Emp e = api.emp(usuario.trim());
        if (e == null) throw new Api.Aviso("Esa persona no tiene ficha en ÓRBITA.");
        if (!e.usuario.equals(yo.usuario) && !"RRHH".equals(yo.rol)) {
            throw new Api.Aviso("Solo puedes cambiar tu propia foto (RRHH puede cambiar la de cualquiera).");
        }
        return e;
    }

    private Map<String, Object> subir(String usuario, String b64) throws SQLException {
        Api.Emp e = persona(usuario);
        if (b64 == null || b64.isBlank()) throw new Api.Aviso("Elige una foto (JPG o PNG).");
        int coma = b64.indexOf(',');
        if (b64.startsWith("data:") && coma > 0) b64 = b64.substring(coma + 1);
        byte[] d;
        try {
            d = Base64.getDecoder().decode(b64.replaceAll("\\s", ""));
        } catch (IllegalArgumentException ex) {
            throw new Api.Aviso("La foto no ha llegado bien. Vuelve a elegirla.");
        }
        byte[] jpeg = normalizar(d);
        LocalDateTime ahora = LocalDateTime.now();
        guardar(c, e.usuario, jpeg, ahora, yo.usuario);
        return obj("usuario", e.usuario, "foto", Timestamp.valueOf(ahora).getTime(), "mensaje", "Foto guardada.");
    }

    private Map<String, Object> borrar(String usuario) throws SQLException {
        Api.Emp e = persona(usuario);
        try (PreparedStatement ps = c.prepareStatement("DELETE FROM EMPLEADO_FOTO WHERE USUARIO = ?")) {
            ps.setString(1, e.usuario);
            ps.executeUpdate();
        }
        return obj("usuario", e.usuario, "foto", null, "mensaje", "Foto quitada: se verán las iniciales.");
    }

    static void guardar(Connection c, String usuario, byte[] jpeg, LocalDateTime cuando, String subidaPor) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO EMPLEADO_FOTO (USUARIO, FOTO, TIPO, ACTUALIZADA, SUBIDA_POR) VALUES (?,?,?,?,?)"
                + " ON CONFLICT (USUARIO) DO UPDATE SET FOTO = EXCLUDED.FOTO, TIPO = EXCLUDED.TIPO, ACTUALIZADA = EXCLUDED.ACTUALIZADA,"
                + " SUBIDA_POR = EXCLUDED.SUBIDA_POR")) {
            ps.setString(1, usuario);
            ps.setBytes(2, jpeg);
            ps.setString(3, "image/jpeg");
            ps.setTimestamp(4, Timestamp.valueOf(cuando));
            ps.setString(5, subidaPor);
            ps.executeUpdate();
        }
    }

    /**
     * Comprueba la imagen y la vuelve a dibujar: cuadrado central, LADO px, JPEG sin metadatos. Lanza Api.Aviso si no es
     * un JPG o PNG válido, si ocupa demasiado o si es enorme (se mira el tamaño antes de descomprimirla).
     */
    static byte[] normalizar(byte[] d) {
        BufferedImage img = leer(d, MAX_BYTES, "La foto ocupa demasiado (máximo 6 MB).");
        int lado = Math.min(img.getWidth(), img.getHeight());
        if (lado < 32) throw new Api.Aviso("La foto es demasiado pequeña (al menos 32 píxeles de lado).");
        int x = (img.getWidth() - lado) / 2, y = (img.getHeight() - lado) / 2;
        BufferedImage cuadrada = new BufferedImage(LADO, LADO, BufferedImage.TYPE_INT_RGB);
        dibujar(cuadrada, img, 0, 0, LADO, LADO, x, y, x + lado, y + lado);
        return jpeg(cuadrada);
    }

    /** Lee un JPG o PNG comprobado (por su contenido, tamaño y dimensiones antes de descomprimirlo). */
    static BufferedImage leer(byte[] d, int maxBytes, String demasiado) {
        if (d.length > maxBytes) throw new Api.Aviso(demasiado);
        String tipo = Documentos.tipo(d);
        if (!"image/jpeg".equals(tipo) && !"image/png".equals(tipo)) throw new Api.Aviso("La foto tiene que ser JPG o PNG.");
        BufferedImage img;
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(d))) {
            Iterator<ImageReader> lectores = ImageIO.getImageReaders(in);
            if (!lectores.hasNext()) throw new Api.Aviso("La foto tiene que ser JPG o PNG.");
            ImageReader r = lectores.next();
            try {
                r.setInput(in, true, true);
                if (r.getWidth(0) > MAX_PIXELES_LADO || r.getHeight(0) > MAX_PIXELES_LADO) {
                    throw new Api.Aviso("La foto es demasiado grande (como mucho 6.000 píxeles de lado).");
                }
                img = r.read(0);
            } finally {
                r.dispose();
            }
        } catch (IOException | RuntimeException ex) {
            if (ex instanceof Api.Aviso a) throw a;
            throw new Api.Aviso("No se puede leer la foto: prueba con otro fichero JPG o PNG.");
        }
        return img;
    }

    /** Dibuja en destino la zona (sx1,sy1)-(sx2,sy2) de img, escalada a (dx,dy,w,h), sobre blanco (PNG transparentes). */
    static void dibujar(BufferedImage destino, BufferedImage img, int dx, int dy, int w, int h, int sx1, int sy1, int sx2, int sy2) {
        Graphics2D g = destino.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, destino.getWidth(), destino.getHeight());
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.drawImage(img, dx, dy, dx + w, dy + h, sx1, sy1, sx2, sy2, null);
        } finally {
            g.dispose();
        }
    }

    static byte[] jpeg(BufferedImage img) {
        ImageWriter w = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        try (ImageOutputStream out = ImageIO.createImageOutputStream(o)) {
            w.setOutput(out);
            ImageWriteParam prm = w.getDefaultWriteParam();
            prm.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            prm.setCompressionQuality(0.86f);
            w.write(null, new IIOImage(img, null, null), prm);
        } catch (IOException ex) {
            throw new IllegalStateException("No se puede generar el JPEG", ex);
        } finally {
            w.dispose();
        }
        return o.toByteArray();
    }
}
