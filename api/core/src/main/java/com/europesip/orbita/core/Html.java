package com.europesip.orbita.core;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Limpieza del texto enriquecido de las noticias (el cuerpo que llega del editor de la portada y que se publica en
 * WCM). Lista blanca: párrafos, saltos, negrita, cursiva, subrayado, tachado, listas, títulos h2-h4, citas, separador y
 * enlaces http(s), mailto o relativos. Todo lo demás se quita: etiquetas no admitidas (su texto se conserva), atributos
 * (salvo href), comentarios y el contenido de script, style, iframe, object, svg y similares. Las etiquetas se cierran
 * bien aunque el original venga roto.
 */
final class Html {

    private static final Set<String> PERMITIDAS = Set.of("p", "br", "strong", "em", "u", "s", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a", "hr");
    private static final Set<String> VACIAS = Set.of("br", "hr");
    /** Etiquetas cuyo contenido tampoco se conserva. */
    private static final Set<String> FUERA = Set.of("script", "style", "iframe", "object", "embed", "svg", "math", "noscript", "template", "textarea", "select", "head", "title");
    private static final Map<String, String> EQUIVALENTES = Map.of("b", "strong", "i", "em", "strike", "s", "del", "s", "h1", "h2", "h5", "h4", "h6", "h4");
    private static final Pattern ETIQUETA = Pattern.compile("<!--.*?-->|<(/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>", Pattern.DOTALL);
    private static final Pattern HREF = Pattern.compile("\\bhref\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", Pattern.CASE_INSENSITIVE);

    private Html() {}

    static String limpiar(String html) {
        if (html == null) return "";
        StringBuilder out = new StringBuilder();
        Deque<String> abiertas = new ArrayDeque<>();
        String saltando = null;
        int fin = 0;
        Matcher m = ETIQUETA.matcher(html);
        while (m.find()) {
            if (saltando == null) texto(out, html.substring(fin, m.start()));
            fin = m.end();
            if (m.group(2) == null) continue;                      // comentario
            boolean cierre = !m.group(1).isEmpty();
            String t = m.group(2).toLowerCase(Locale.ROOT);
            if (saltando != null) {
                if (cierre && t.equals(saltando)) saltando = null;
                continue;
            }
            if (FUERA.contains(t)) {
                if (!cierre && !m.group(3).trim().endsWith("/")) saltando = t;
                continue;
            }
            t = EQUIVALENTES.getOrDefault(t, t);
            if (!PERMITIDAS.contains(t)) continue;                 // div, span, img...: fuera la etiqueta, queda el texto
            if (VACIAS.contains(t)) {
                if (!cierre) out.append('<').append(t).append('>');
                continue;
            }
            if (!cierre) {
                if (t.equals("a")) {
                    String href = enlace(m.group(3));
                    if (href == null) continue;
                    out.append("<a href=\"").append(atributo(href)).append("\" rel=\"noopener noreferrer\">");
                } else {
                    out.append('<').append(t).append('>');
                }
                abiertas.push(t);
            } else if (abiertas.contains(t)) {
                while (!abiertas.isEmpty()) {                       // cierra también lo que quedó abierto dentro
                    String a = abiertas.pop();
                    out.append("</").append(a).append('>');
                    if (a.equals(t)) break;
                }
            }
        }
        if (saltando == null) texto(out, html.substring(fin));
        while (!abiertas.isEmpty()) out.append("</").append(abiertas.pop()).append('>');
        return out.toString().trim();
    }

    /** El texto sin ninguna etiqueta (para resúmenes y para comprobar que el cuerpo no está vacío). */
    static String texto(String html) {
        String t = limpiar(html).replaceAll("<[^>]+>", " ");
        return entidades(t).replace('\u00a0', ' ').replaceAll("\\s+", " ").trim();
    }

    private static String enlace(String atributos) {
        Matcher h = HREF.matcher(atributos);
        if (!h.find()) return null;
        String v = h.group(2) != null ? h.group(2) : h.group(3) != null ? h.group(3) : h.group(4);
        v = entidades(v).trim();
        String l = v.toLowerCase(Locale.ROOT).replaceAll("[\\s\\x00-\\x1f]", "");
        if (l.startsWith("https://") || l.startsWith("http://") || l.startsWith("mailto:") || (l.startsWith("/") && !l.startsWith("//"))) return v;
        return null;                                               // javascript:, data:, vbscript:...
    }

    /** Texto escapado; las entidades que ya venían se decodifican antes para no escaparlas dos veces. */
    private static void texto(StringBuilder out, String s) {
        out.append(escapar(entidades(s)));
    }

    static String escapar(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String atributo(String s) {
        return escapar(s).replace("\"", "&quot;");
    }

    private static String entidades(String s) {
        if (s.indexOf('&') < 0) return s;
        Matcher m = Pattern.compile("&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);").matcher(s);
        StringBuilder b = new StringBuilder();
        while (m.find()) {
            String e = m.group(1), r;
            try {
                if (e.startsWith("#x") || e.startsWith("#X")) r = new String(Character.toChars(Integer.parseInt(e.substring(2), 16)));
                else if (e.startsWith("#")) r = new String(Character.toChars(Integer.parseInt(e.substring(1))));
                else r = switch (e) {
                    case "amp" -> "&";
                    case "lt" -> "<";
                    case "gt" -> ">";
                    case "quot" -> "\"";
                    case "apos" -> "'";
                    case "nbsp" -> "\u00a0";
                    default -> m.group(0);
                };
            } catch (IllegalArgumentException ex) {
                r = "";
            }
            m.appendReplacement(b, Matcher.quoteReplacement(r));
        }
        m.appendTail(b);
        return b.toString();
    }
}
