// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
package com.europesip.orbita.core.extension;

import java.io.File;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.ServiceLoader;
import java.util.function.Function;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Quién es el usuario de una llamada al servidor MCP. Orden: 1) la sesión de HCL DX (cookie); 2) los proveedores de las
 * extensiones ({@link ProveedorIdentidadMcp}); 3) el usuario de desarrollo ({@code ORBITA_MCP_DEV_USER}), si está puesto.
 */
public final class IdentidadMcp {

    private static final Logger LOG = Logger.getLogger(IdentidadMcp.class.getName());

    /** Resultado: el uid (null si nadie lo sabe), de dónde sale ({@code dx}, el nombre del proveedor, {@code desarrollo}) y, si se rechaza, por qué. */
    public record Identidad(String usuario, String fuente, String rechazo) {
        public static Identidad nadie() { return new Identidad(null, null, null); }
    }

    private final List<ProveedorIdentidadMcp> proveedores;

    public IdentidadMcp(List<ProveedorIdentidadMcp> proveedores) {
        this.proveedores = List.copyOf(proveedores);
    }

    public List<ProveedorIdentidadMcp> proveedores() { return proveedores; }

    /**
     * @param usuarioDx  el uid que da la sesión de DX de la llamada (null si no hay)
     * @param cabecera   cabeceras de la llamada
     * @param origen     IP de quien llama
     * @param usuarioDev usuario de desarrollo (null si no está puesto)
     */
    public Identidad resolver(String usuarioDx, Function<String, String> cabecera, String origen, String usuarioDev) {
        if (usuarioDx != null) return new Identidad(usuarioDx, "dx", null);
        for (ProveedorIdentidadMcp p : proveedores) {
            String uid;
            try {
                uid = p.usuario(cabecera, origen);
            } catch (SecurityException e) {
                return new Identidad(null, p.nombre(), e.getMessage() == null ? "credencial no válida" : e.getMessage());
            } catch (RuntimeException e) {
                LOG.log(Level.WARNING, "ORBITA MCP: error en el proveedor de identidad " + p.nombre(), e);
                return new Identidad(null, p.nombre(), "error del proveedor de identidad");
            }
            if (uid != null && !uid.isBlank()) return new Identidad(uid.trim(), p.nombre(), null);
        }
        if (usuarioDev != null) return new Identidad(usuarioDev, "desarrollo", null);
        return Identidad.nadie();
    }

    /**
     * Carga los proveedores de los JAR de {@code carpeta} (si existe), con un cargador de clases cuyo padre es
     * {@code padre} (así ven las clases de ÓRBITA, empezando por {@link ProveedorIdentidadMcp}).
     */
    public static IdentidadMcp cargar(String carpeta, ClassLoader padre) {
        List<URL> jars = new ArrayList<>();
        File dir = carpeta == null ? null : new File(carpeta);
        File[] ficheros = dir != null && dir.isDirectory() ? dir.listFiles((d, n) -> n.endsWith(".jar")) : null;
        if (ficheros != null) {
            Arrays.sort(ficheros);
            for (File f : ficheros) {
                try { jars.add(f.toURI().toURL()); } catch (Exception e) { LOG.warning("ORBITA MCP: JAR no válido " + f); }
            }
        }
        ClassLoader cl = jars.isEmpty() ? padre : new URLClassLoader(jars.toArray(new URL[0]), padre);
        List<ProveedorIdentidadMcp> lista = new ArrayList<>();
        for (ProveedorIdentidadMcp p : ServiceLoader.load(ProveedorIdentidadMcp.class, cl)) lista.add(p);
        if (!jars.isEmpty() || !lista.isEmpty())
            LOG.info("ORBITA MCP: extensiones " + jars.size() + " JAR, proveedores de identidad "
                    + (lista.isEmpty() ? "ninguno" : lista.stream().map(ProveedorIdentidadMcp::nombre).toList()));
        return new IdentidadMcp(Collections.unmodifiableList(lista));
    }
}
