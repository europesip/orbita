package com.europesip.orbita.core.extension;

import java.util.function.Function;

/**
 * Punto de extensión del servidor MCP: otra forma de saber en nombre de qué usuario actúa una llamada, además de la
 * sesión de HCL DX del usuario (la que reenvía el Integrator de DX IQ).
 *
 * <p>Una extensión es un JAR aparte (no forma parte de ÓRBITA) con una clase que implementa esta interfaz y la declara en
 * {@code META-INF/services/com.europesip.orbita.core.extension.ProveedorIdentidadMcp}. El servidor MCP carga los JAR de
 * la carpeta de extensiones ({@code ORBITA_EXTENSIONS_DIR}, por defecto {@code /config/extensions}; el chart los copia ahí
 * desde las imágenes de {@code extensions}) y pregunta a cada proveedor, en orden, cuando la llamada no trae sesión de DX.
 *
 * <p>Extension point of the MCP server: another way to know on whose behalf a call acts, besides the user's HCL DX
 * session. Package it as a separate JAR with a {@code META-INF/services} entry; see docs/mcp.md.
 */
public interface ProveedorIdentidadMcp {

    /** Nombre corto del proveedor, para el registro de auditoría (por ejemplo {@code teams}). */
    String nombre();

    /**
     * El usuario de la llamada, con el mismo identificador que en HCL DX (uid).
     *
     * @param cabecera lee una cabecera HTTP de la llamada (null si no viene)
     * @param origen   dirección IP de quien llama
     * @return el uid, o {@code null} si la llamada no es para este proveedor (no trae su credencial)
     * @throws SecurityException si la llamada trae la credencial de este proveedor pero no es válida (caducada, firma
     *                           incorrecta, licencia...): la llamada se rechaza y no se pregunta a los demás proveedores
     */
    String usuario(Function<String, String> cabecera, String origen);
}
