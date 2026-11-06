package com.europesip.orbita.rest;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonValue;

/** Tabla de rutas de rutas.json: método + ruta → operación de la lógica, con los parámetros de la ruta. */
final class Rutas {

    record Ruta(String op, String metodo, String[] partes, boolean publica) {}

    record Encontrada(Ruta ruta, Map<String, String> parametros) {}

    private static final List<Ruta> TODAS = cargar();

    private Rutas() {}

    private static List<Ruta> cargar() {
        try (InputStream in = Rutas.class.getResourceAsStream("/rutas.json"); JsonReader r = Json.createReader(in)) {
            List<Ruta> l = new ArrayList<>();
            for (JsonValue v : r.readObject().getJsonArray("rutas")) {
                JsonObject o = v.asJsonObject();
                l.add(new Ruta(o.getString("op"), o.getString("metodo"), o.getString("ruta").split("/"), o.getBoolean("publica", false)));
            }
            return l;
        } catch (Exception e) {
            throw new IllegalStateException("No se puede leer rutas.json", e);
        }
    }

    /** La ruta que corresponde a un método y una ruta pedida ("fichaje/meses/2026/11"), o null. */
    static Encontrada buscar(String metodo, String ruta) {
        String[] pedida = ruta.replaceAll("^/+|/+$", "").split("/");
        for (Ruta r : TODAS) {
            if (!r.metodo().equals(metodo) || r.partes().length != pedida.length) continue;
            Map<String, String> p = new LinkedHashMap<>();
            boolean coincide = true;
            for (int i = 0; i < pedida.length && coincide; i++) {
                String parte = r.partes()[i];
                if (parte.startsWith("{") && parte.endsWith("}")) p.put(parte.substring(1, parte.length() - 1), pedida[i]);
                else coincide = parte.equals(pedida[i]);
            }
            if (coincide) return new Encontrada(r, p);
        }
        return null;
    }

    /** true si la ruta existe con otro método (para contestar 405 en vez de 404). */
    static boolean existeConOtroMetodo(String ruta) {
        for (String m : new String[] {"GET", "POST", "PUT", "DELETE"}) if (buscar(m, ruta) != null) return true;
        return false;
    }
}
