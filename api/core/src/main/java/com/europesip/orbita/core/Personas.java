package com.europesip.orbita.core;

import java.io.StringReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonValue;

/**
 * Las personas de la demo. La historia de la demo (quién pide vacaciones, quién olvida fichar, quién aprueba...) se
 * escribe por PAPELES, no por usuarios: cada papel lo hace un usuario de DX, configurable con ORBITA_DEMO_PEOPLE para
 * usar los usuarios que ya tiene el directorio (los del OpenLDAP de los labs, por ejemplo) sin dar de alta otros.
 *
 * ORBITA_DEMO_PEOPLE es un JSON {"papel": {"uid": "...", "nombre": "...", "puesto": "..."}}; lo que no se da se toma
 * del reparto por defecto de abajo (una empresa ficticia). Un papel sin usuario de DX que lo haga puede quedarse con
 * su uid ficticio: aparece en los datos, pero nadie entra con él.
 */
final class Personas {

    /** Un papel de la demo y quién lo hace. */
    record Persona(String papel, String uid, String nombre, String puesto, String departamento, String papelResponsable,
            String rol, String pin) {
        /** Primer nombre, para los textos ("Javier, ¿el parking...?"). */
        String nombrePila() {
            int sp = nombre.indexOf(' ');
            return sp > 0 ? nombre.substring(0, sp) : nombre;
        }
    }

    // papel, uid, nombre, puesto, departamento, papel del responsable, rol, PIN del quiosco
    private static final String[][] REPARTO = {
        {"rrhh", "wpsadmin", "Ana Torres", "Directora de Personas", "Personas", null, "RRHH", "1000"},
        {"ventas-responsable", "carlos.ruiz", "Carlos Ruiz", "Responsable de Ventas", "Ventas", "rrhh", "RESPONSABLE", "2001"},
        {"ventas-1", "lucia.martin", "Lucía Martín", "Comercial", "Ventas", "ventas-responsable", "EMPLEADO", "1111"},
        {"ventas-2", "javier.gomez", "Javier Gómez", "Comercial", "Ventas", "ventas-responsable", "EMPLEADO", "2222"},
        {"tecnologia-responsable", "marta.sanchez", "Marta Sánchez", "Responsable de Tecnología", "Tecnología", "rrhh", "RESPONSABLE", "3001"},
        {"tecnologia-1", "david.lopez", "David López", "Desarrollador", "Tecnología", "tecnologia-responsable", "EMPLEADO", "3333"},
        {"tecnologia-2", "elena.navarro", "Elena Navarro", "Diseñadora", "Tecnología", "tecnologia-responsable", "EMPLEADO", "4444"},
        {"tecnologia-3", "pablo.diaz", "Pablo Díaz", "Técnico de soporte", "Tecnología", "tecnologia-responsable", "EMPLEADO", "5555"},
        {"administracion", "rosa.molina", "Rosa Molina", "Responsable de Administración", "Administración", "rrhh", "ADMINISTRACION", "6001"},
    };

    private static volatile Map<String, Persona> todas;

    private Personas() {}

    /** Todas, en el orden del reparto. */
    static List<Persona> todas() {
        return new ArrayList<>(mapa().values());
    }

    static Persona de(String papel) {
        Persona p = mapa().get(papel);
        if (p == null) throw new IllegalArgumentException("Papel de la demo desconocido: " + papel);
        return p;
    }

    /** uid de quien hace el papel. */
    static String u(String papel) { return de(papel).uid(); }

    static String responsable(String uid) {
        for (Persona p : mapa().values()) {
            if (p.uid().equals(uid)) return p.papelResponsable() == null ? null : u(p.papelResponsable());
        }
        return null;
    }

    private static Map<String, Persona> mapa() {
        if (todas == null) todas = cargar(Config.personasDemo());
        return todas;
    }

    static Map<String, Persona> cargar(String json) {
        JsonObject cfg = JsonValue.EMPTY_JSON_OBJECT;
        if (json != null && !json.isBlank()) {
            try (JsonReader r = Json.createReader(new StringReader(json))) {
                cfg = r.readObject();
            }
        }
        for (String papel : cfg.keySet()) {
            boolean existe = false;
            for (String[] x : REPARTO) existe |= x[0].equals(papel);
            if (!existe) throw new IllegalArgumentException("ORBITA_DEMO_PEOPLE: papel desconocido '" + papel + "'");
        }
        Map<String, Persona> m = new LinkedHashMap<>();
        for (String[] x : REPARTO) {
            JsonObject o = cfg.containsKey(x[0]) ? cfg.getJsonObject(x[0]) : JsonValue.EMPTY_JSON_OBJECT;
            String uid = o.getString("uid", x[1]);
            if (!uid.matches("[A-Za-z0-9._@-]{1,64}")) throw new IllegalArgumentException("ORBITA_DEMO_PEOPLE: uid no válido '" + uid + "'");
            m.put(x[0], new Persona(x[0], uid, o.getString("nombre", x[2]), o.getString("puesto", x[3]), x[4], x[5], x[6], x[7]));
        }
        for (Persona p : m.values()) {
            for (Persona q : m.values()) {
                if (p != q && p.uid().equals(q.uid())) {
                    throw new IllegalArgumentException("ORBITA_DEMO_PEOPLE: el usuario " + p.uid() + " hace dos papeles");
                }
            }
        }
        return Collections.unmodifiableMap(m);
    }
}
