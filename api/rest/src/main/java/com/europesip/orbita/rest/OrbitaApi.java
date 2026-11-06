package com.europesip.orbita.rest;

import jakarta.ws.rs.ApplicationPath;
import jakarta.ws.rs.core.Application;

/**
 * API REST de ÓRBITA: https://&lt;host de DX&gt;/orbita-api/v1/... (contexto /orbita-api en server.xml).
 * Las rutas están en rutas.json (api/rutas.json), compartido con la interfaz.
 */
@ApplicationPath("v1")
public class OrbitaApi extends Application {
}
