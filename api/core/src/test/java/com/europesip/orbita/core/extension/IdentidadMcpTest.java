// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
package com.europesip.orbita.core.extension;

import static org.junit.jupiter.api.Assertions.*;

import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import org.junit.jupiter.api.Test;

class IdentidadMcpTest {

    /** Proveedor de prueba: el usuario va en la cabecera X-Test-User; "malo" es una credencial no válida. */
    public static class ProveedorPrueba implements ProveedorIdentidadMcp {
        @Override public String nombre() { return "prueba"; }
        @Override public String usuario(Function<String, String> cabecera, String origen) {
            String u = cabecera.apply("X-Test-User");
            if ("malo".equals(u)) throw new SecurityException("firma incorrecta");
            return u;
        }
    }

    private static Function<String, String> cabeceras(Map<String, String> m) { return m::get; }

    @Test
    void laSesionDeDxVaPrimero() {
        IdentidadMcp i = new IdentidadMcp(List.of(new ProveedorPrueba()));
        var r = i.resolver("andres", cabeceras(Map.of("X-Test-User", "patricia")), "10.0.0.1", "dev");
        assertEquals("andres", r.usuario());
        assertEquals("dx", r.fuente());
    }

    @Test
    void sinSesionPreguntaALosProveedores() {
        IdentidadMcp i = new IdentidadMcp(List.of(new ProveedorPrueba()));
        var r = i.resolver(null, cabeceras(Map.of("X-Test-User", "patricia")), "10.0.0.1", "dev");
        assertEquals("patricia", r.usuario());
        assertEquals("prueba", r.fuente());
        assertNull(r.rechazo());
    }

    @Test
    void unaCredencialNoValidaSeRechazaSinPasarAlUsuarioDeDesarrollo() {
        IdentidadMcp i = new IdentidadMcp(List.of(new ProveedorPrueba()));
        var r = i.resolver(null, cabeceras(Map.of("X-Test-User", "malo")), "10.0.0.1", "dev");
        assertNull(r.usuario());
        assertEquals("prueba", r.fuente());
        assertEquals("firma incorrecta", r.rechazo());
    }

    @Test
    void sinNadaUsaElUsuarioDeDesarrolloSiEstaPuesto() {
        IdentidadMcp i = new IdentidadMcp(List.of(new ProveedorPrueba()));
        assertEquals("desarrollo", i.resolver(null, cabeceras(Map.of()), "x", "dev").fuente());
        assertNull(i.resolver(null, cabeceras(Map.of()), "x", null).usuario());
    }

    @Test
    void cargaLosProveedoresDeLosJarDeLaCarpeta() throws Exception {
        Path dir = Files.createTempDirectory("orbita-ext");
        try (JarOutputStream jar = new JarOutputStream(new FileOutputStream(dir.resolve("prueba.jar").toFile()))) {
            jar.putNextEntry(new JarEntry("META-INF/services/" + ProveedorIdentidadMcp.class.getName()));
            jar.write((ProveedorPrueba.class.getName() + "\n").getBytes(StandardCharsets.UTF_8));
            jar.closeEntry();
        }
        IdentidadMcp i = IdentidadMcp.cargar(dir.toString(), getClass().getClassLoader());
        assertEquals(List.of("prueba"), i.proveedores().stream().map(ProveedorIdentidadMcp::nombre).toList());
        assertTrue(IdentidadMcp.cargar(dir.resolve("no-existe").toString(), getClass().getClassLoader()).proveedores().isEmpty());
    }
}
