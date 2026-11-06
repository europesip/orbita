package com.europesip.orbita.core;

import java.util.Locale;

/**
 * Configuración de ÓRBITA: variables de entorno del contenedor (las pone el chart de Helm, ver chart/hcl-dx-orbita).
 */
public final class Config {

    private Config() {}

    static String env(String nombre, String porDefecto) {
        String v = System.getenv(nombre);
        return v == null || v.trim().isEmpty() ? porDefecto : v.trim();
    }

    static boolean si(String nombre, boolean porDefecto) {
        String v = env(nombre, null);
        return v == null ? porDefecto : "true".equals(v.toLowerCase(Locale.ROOT));
    }

    // --- HCL DX: quién es el usuario (SesionDx) -------------------------------------------------------------------
    /** URL base de DX para validar la sesión, p. ej. https://dx.example.com (la misma que usa el navegador). */
    public static String dxUrl() { return env("ORBITA_DX_URL", null); }
    /** Fichero PEM con la CA del certificado de DX (autofirmado o de una CA privada); vacío: CA públicas. */
    static String dxCa() { return env("ORBITA_DX_CA", null); }
    /** Solo laboratorio: no verificar el certificado de DX. */
    static boolean dxInseguro() { return si("ORBITA_DX_INSECURE", false); }
    /** Cookie de sesión de DX que se reenvía a DX para saber quién es el usuario. */
    public static String cookieSesion() { return env("ORBITA_SESSION_COOKIE", "LtpaToken2"); }
    /** Segundos que se recuerda una sesión ya validada (evita una llamada a DX en cada petición). */
    static int cacheSesionSegundos() { return Integer.parseInt(env("ORBITA_SESSION_CACHE_SECONDS", "60")); }

    // --- Datos ----------------------------------------------------------------------------------------------------
    /** JNDI de la fuente de datos (server.xml). */
    public static final String JNDI = "jdbc/orbita";
    /** Cargar los datos de demostración si la base de datos está vacía. */
    public static boolean demo() { return si("ORBITA_DEMO_SEED", false); }
    /** Personas de la demo (JSON): qué usuario de DX hace cada papel. Ver Personas. */
    static String personasDemo() { return env("ORBITA_DEMO_PEOPLE", null); }

    // --- Quiosco y páginas ----------------------------------------------------------------------------------------
    /** Clave del dispositivo quiosco; sin ella el quiosco no funciona. */
    public static String claveQuiosco() { return env("ORBITA_KIOSK_KEY", null); }
    /** Dónde están las páginas de DX con las aplicaciones (los enlaces entre aplicaciones). */
    public static String paginas() { return env("ORBITA_PAGES_BASE", "/wps/myportal/Home/"); }
    public static String paginaQuiosco() { return env("ORBITA_KIOSK_PAGE", "/wps/myportal/Home/quiosco"); }

    // --- Cabecera y pie de las aplicaciones ------------------------------------------------------------------------
    /**
     * Qué muestran la cabecera y el pie de cada aplicación (ORBITA_HEADER_* y ORBITA_FOOTER, valores ui.* del chart).
     * Todo visible por defecto; con un tema de DX que ya muestra el usuario, se puede ocultar en la aplicación.
     */
    public static boolean cabecera(String parte) {
        return si("ORBITA_HEADER_" + parte.toUpperCase(Locale.ROOT), true);
    }
    public static boolean pie() { return si("ORBITA_FOOTER", true); }

    // --- MCP ------------------------------------------------------------------------------------------------------
    /** Token Bearer opcional que debe enviar el cliente MCP (además de la sesión de DX del usuario). */
    public static String tokenMcp() { return env("ORBITA_MCP_TOKEN", null); }
    /** Herramientas del MCP que se publican (nombres o áreas, separados por comas); vacío: todas. */
    public static String herramientasMcp() { return env("ORBITA_MCP_TOOLS", null); }
    /** Herramientas del MCP que NO se publican (nombres o áreas). */
    public static String herramientasMcpQuitadas() { return env("ORBITA_MCP_TOOLS_DISABLED", null); }
    /** Publicar solo las herramientas de consulta. */
    public static boolean mcpSoloLectura() { return si("ORBITA_MCP_READ_ONLY", false); }
    /** Solo desarrollo: usuario con el que actúa el MCP cuando la llamada no trae sesión de DX. */
    public static String usuarioMcpDesarrollo() { return env("ORBITA_MCP_DEV_USER", null); }
}
