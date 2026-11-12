package com.europesip.orbita.core;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * Quién es el usuario: lo dice HCL DX. ÓRBITA no guarda claves LTPA ni consulta el LDAP; reenvía la cookie de sesión
 * del usuario (LtpaToken2, o WAS_<letra><hash> si DX usa OpenID Connect) a la API de perfil de DX y DX contesta con el perfil de ese usuario, o no contesta si la
 * sesión no es válida. Sirve igual para las Script Applications (el navegador envía la cookie, mismo host que DX) y
 * para el MCP (el Integrator de DX IQ reenvía las cookies del usuario en cada tools/call).
 *
 * Una sesión validada se recuerda unos segundos (Config.cacheSesionSegundos) por el hash de la cookie, nunca la cookie.
 */
public final class SesionDx {

    private static final Logger LOG = Logger.getLogger(SesionDx.class.getName());
    static final String PERFIL = "/wps/mycontenthandler/um/secure/currentuser/profile?expandRefs=true";
    private static final String UM = "http://www.ibm.com/xmlns/prod/websphere/um.xsd";

    /** Lo que ÓRBITA sabe del usuario por DX: su uid y su idioma preferido del perfil ("" si no tiene). */
    public record Perfil(String uid, String idioma) {}

    private record Entrada(Perfil perfil, long caduca) {}

    private static final Map<String, Entrada> CACHE = new ConcurrentHashMap<>();
    private static volatile HttpClient cliente;

    private SesionDx() {}

    /**
     * uid del usuario de la sesión de DX que viene en la cabecera Cookie, o null si no hay sesión o DX no la acepta.
     */
    public static String usuario(String cabeceraCookie) {
        Perfil p = perfil(cabeceraCookie);
        return p == null ? null : p.uid();
    }

    /** El perfil (uid e idioma) del usuario de la sesión de DX, o null si no hay sesión o DX no la acepta. */
    public static Perfil perfil(String cabeceraCookie) {
        String[] sesion = cookieSesion(cabeceraCookie, Config.cookieSesion());
        if (sesion == null) return null;
        String valor = sesion[1];
        String clave = hash(sesion[0] + "=" + valor);
        long ahora = System.currentTimeMillis();
        Entrada e = CACHE.get(clave);
        if (e != null && e.caduca() > ahora) return e.perfil();
        Perfil p = preguntarADx(sesion[0] + "=" + valor);
        // Las sesiones no válidas también se recuerdan (poco tiempo): una página con muchas llamadas no repite la consulta
        CACHE.put(clave, new Entrada(p, ahora + (p != null ? Config.cacheSesionSegundos() * 1000L : 10_000L)));
        if (CACHE.size() > 5000) CACHE.entrySet().removeIf(x -> x.getValue().caduca() <= ahora);
        return p;
    }

    /**
     * La cookie de sesión de DX en la cabecera Cookie: {nombre, valor}, o null. Los nombres admitidos van separados
     * por comas y pueden acabar en * (prefijo). Por defecto "LtpaToken2,WAS_*": con OpenID Connect (Keycloak, Entra
     * ID...) Liberty da a la cookie de SSO un nombre generado (WAS_n..., WAS_p...) en lugar de LtpaToken2.
     */
    static String[] cookieSesion(String cabecera, String nombres) {
        if (cabecera == null || nombres == null) return null;
        for (String n : nombres.split(",")) {
            String nombre = n.trim();
            if (nombre.isEmpty()) continue;
            boolean prefijo = nombre.endsWith("*");
            String base = prefijo ? nombre.substring(0, nombre.length() - 1) : nombre;
            for (String parte : cabecera.split(";")) {
                int igual = parte.indexOf('=');
                if (igual <= 0) continue;
                String k = parte.substring(0, igual).trim(), v = parte.substring(igual + 1).trim();
                if (!v.isEmpty() && (prefijo ? k.startsWith(base) && k.length() > base.length() : k.equals(base))) return new String[] {k, v};
            }
        }
        return null;
    }

    /** Valor de una cookie en la cabecera Cookie ("a=1; LtpaToken2=xyz"). */
    static String cookie(String cabecera, String nombre) {
        if (cabecera == null) return null;
        for (String parte : cabecera.split(";")) {
            int igual = parte.indexOf('=');
            if (igual > 0 && parte.substring(0, igual).trim().equals(nombre)) {
                String v = parte.substring(igual + 1).trim();
                return v.isEmpty() ? null : v;
            }
        }
        return null;
    }

    private static Perfil preguntarADx(String cookie) {
        String base = Config.dxUrl();
        if (base == null) {
            LOG.severe("ORBITA: falta ORBITA_DX_URL, no se puede validar la sesión con DX");
            return null;
        }
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(base.replaceAll("/+$", "") + PERFIL))
                    .timeout(Duration.ofSeconds(10)).header("Cookie", cookie).header("Accept", "application/xml").GET().build();
            HttpResponse<byte[]> r = cliente().send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (r.statusCode() != 200) return null;          // sin sesión DX contesta 401 o redirige al login
            return perfil(new ByteArrayInputStream(r.body()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception e) {
            LOG.log(Level.WARNING, "ORBITA: DX no ha contestado a la validación de la sesión ({0})", e.toString());
            return null;
        }
    }

    /**
     * uid del perfil XML de DX: el atributo "uid" o, si no lo tiene, el valor del primer RDN de su DN
     * (uid=lucia.martin,ou=users,dc=... → lucia.martin). El perfil también trae atributos sensibles: solo se lee esto.
     */
    static String uid(InputStream xml) throws Exception {
        Perfil p = perfil(xml);
        return p == null ? null : p.uid();
    }

    /** uid e idioma preferido (atributo preferredLanguage) del perfil XML de DX. */
    static Perfil perfil(InputStream xml) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);
        f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        f.setExpandEntityReferences(false);
        Document d = f.newDocumentBuilder().parse(xml);
        NodeList perfiles = d.getElementsByTagNameNS(UM, "profile");
        if (perfiles.getLength() == 0) return null;          // p. ej. la página de login en HTML
        Element perfil = (Element) perfiles.item(0);
        String uid = null, idioma = "";
        NodeList atributos = perfil.getElementsByTagNameNS(UM, "attribute");
        for (int i = 0; i < atributos.getLength(); i++) {
            Element a = (Element) atributos.item(i);
            NodeList v = a.getElementsByTagNameNS(UM, "attributeValue");
            String valor = v.getLength() > 0 ? v.item(0).getTextContent().trim() : "";
            if ("uid".equals(a.getAttribute("name")) && !valor.isEmpty()) uid = valor;
            if ("preferredLanguage".equals(a.getAttribute("name"))) idioma = valor;
        }
        if (uid == null) {
            String dn = perfil.getAttribute("identifier");
            int igual = dn.indexOf('='), coma = dn.indexOf(',');
            if (igual > 0) uid = (coma > igual ? dn.substring(igual + 1, coma) : dn.substring(igual + 1)).trim();
        }
        return uid == null ? null : new Perfil(uid, idioma);
    }

    private static HttpClient cliente() throws Exception {
        if (cliente == null) {
            synchronized (SesionDx.class) {
                if (cliente == null) {
                    cliente = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL)
                            .connectTimeout(Duration.ofSeconds(5)).sslContext(contextoTls()).build();
                }
            }
        }
        return cliente;
    }

    /** TLS hacia DX: CA públicas de la JVM, más la CA de ORBITA_DX_CA si se da (certificado autofirmado del lab). */
    private static SSLContext contextoTls() throws Exception {
        SSLContext ssl = SSLContext.getInstance("TLS");
        if (Config.dxInseguro()) {
            LOG.warning("ORBITA: ORBITA_DX_INSECURE=true, no se verifica el certificado de DX (solo laboratorio)");
            ssl.init(null, new TrustManager[] {new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            }}, new SecureRandom());
            return ssl;
        }
        KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
        ks.load(null, null);
        TrustManagerFactory jvm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        jvm.init((KeyStore) null);
        int n = 0;
        for (TrustManager tm : jvm.getTrustManagers()) {
            if (tm instanceof X509TrustManager x) for (X509Certificate c : x.getAcceptedIssuers()) ks.setCertificateEntry("jvm-" + n++, c);
        }
        if (Config.dxCa() != null) {
            try (InputStream in = Files.newInputStream(Paths.get(Config.dxCa()))) {
                for (Certificate c : CertificateFactory.getInstance("X.509").generateCertificates(in)) ks.setCertificateEntry("dx-" + n++, c);
            }
        }
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(ks);
        ssl.init(null, tmf.getTrustManagers(), new SecureRandom());
        return ssl;
    }

    private static String hash(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
