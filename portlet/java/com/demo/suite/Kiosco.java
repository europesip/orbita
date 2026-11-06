package com.demo.suite;

import static com.demo.suite.Json.obj;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Map;

/**
 * Quiosco de fichaje: una tablet en la entrada en la que cada persona ficha con su PIN o su tarjeta (QR) sin iniciar
 * sesión en el Portal. El quiosco se identifica con una clave de dispositivo; en un cliente real cada tablet tendría la
 * suya (registro de dispositivos) y el PIN se bloquearía tras varios intentos.
 */
final class Kiosco {

    static final String CLAVE = "quiosco-demo";

    private Kiosco() {}

    static Object ejecutar(Connection c, String op, Map<String, String> p) throws SQLException {
        if (!CLAVE.equals(p.get("clave"))) throw new Api.Aviso("Este dispositivo no está autorizado como quiosco.");
        Api api = new Api(c, identificar(c, p.get("pin"), p.get("tarjeta")));
        switch (op) {
            case "kiosco.identificar": {
                Map<String, Object> j = api.yo().json();
                j.put("fichaje", api.fichajeEstado());
                return j;
            }
            case "kiosco.marcar":
                return obj("persona", api.yo().json(), "fichaje", api.marcar(p.get("tipo"), "OFICINA", "KIOSCO"));
            default:
                throw new Api.Aviso("Operación desconocida: " + op);
        }
    }

    private static String identificar(Connection c, String pin, String tarjeta) throws SQLException {
        boolean porPin = pin != null && !pin.trim().isEmpty();
        if (!porPin && (tarjeta == null || tarjeta.trim().isEmpty())) throw new Api.Aviso("Teclea tu PIN o acerca tu tarjeta.");
        try (PreparedStatement ps = c.prepareStatement("SELECT USUARIO FROM EMPLEADO WHERE " + (porPin ? "PIN" : "TARJETA") + " = ?")) {
            ps.setString(1, porPin ? pin.trim() : tarjeta.trim());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new Api.Aviso(porPin ? "PIN incorrecto." : "Tarjeta no reconocida.");
                return rs.getString(1);
            }
        }
    }
}
