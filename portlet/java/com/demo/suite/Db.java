package com.demo.suite;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Locale;

import javax.naming.InitialContext;
import javax.sql.DataSource;

/**
 * Acceso a la base de datos de la suite: fuente de datos jdbc/suiteIntranet (Derby en el Portal 8.5, PostgreSQL en
 * HCL DX Compose). La primera vez crea las tablas y carga los datos de demostración (Demo).
 * El esquema es SQL estándar; con PostgreSQL solo cambian dos tipos (DOUBLE → DOUBLE PRECISION, BLOB → BYTEA) y los
 * nombres sin comillas se guardan en minúsculas (de ahí nombre() en las consultas al catálogo).
 */
final class Db {

    static final String JNDI = "jdbc/suiteIntranet";

    private static volatile DataSource ds;
    private static volatile boolean listo;

    private Db() {}

    static Connection conexion() throws Exception {
        if (ds == null) ds = (DataSource) new InitialContext().lookup(JNDI);
        Connection c = ds.getConnection();
        if (!listo) iniciar(c);
        return c;
    }

    private static synchronized void iniciar(Connection c) throws Exception {
        if (listo) return;
        if (!existe(c, "EMPLEADO")) crear(c);
        // Base de una versión anterior de la suite (sin las últimas tablas): es de demo, se regenera entera
        else if (!existe(c, "AVISO") || !columna(c, "FICHAJE", "INCIDENCIA")) reiniciar(c);
        listo = true;
    }

    /** Nombre tal como lo guarda el catálogo de la base de datos (PostgreSQL: minúsculas; Derby: mayúsculas). */
    private static String nombre(Connection c, String n) throws Exception {
        return c.getMetaData().storesLowerCaseIdentifiers() ? n.toLowerCase(Locale.ROOT) : n;
    }

    private static boolean postgres(Connection c) throws Exception {
        return c.getMetaData().getDatabaseProductName().toLowerCase(Locale.ROOT).contains("postgres");
    }

    private static boolean columna(Connection c, String tabla, String col) throws Exception {
        try (ResultSet rs = c.getMetaData().getColumns(null, null, nombre(c, tabla), nombre(c, col))) {
            return rs.next();
        }
    }

    private static boolean existe(Connection c, String tabla) throws Exception {
        try (ResultSet rs = c.getMetaData().getTables(null, null, nombre(c, tabla), new String[] {"TABLE"})) {
            return rs.next();
        }
    }

    /** Borra todo y vuelve a cargar los datos de demostración (para repetir la demo desde cero). */
    static synchronized void reiniciar(Connection c) throws Exception {
        try (Statement st = c.createStatement()) {
            for (String t : new String[] {"AVISO", "COMENTARIO", "LINEA_GASTO", "NOTA_GASTO", "VIAJE", "FICHAJE", "CORRECCION", "AUSENCIA", "FESTIVO", "EMPLEADO"}) {
                if (existe(c, t)) st.executeUpdate("DROP TABLE " + t);
            }
        }
        crear(c);
    }

    /** Crea las tablas y carga los datos de demostración en una sola transacción. */
    static void crear(Connection c) throws Exception {
        boolean auto = c.getAutoCommit();
        c.setAutoCommit(false);
        boolean pg = postgres(c);
        try (Statement st = c.createStatement()) {
            for (String ddl : ESQUEMA) {
                if (pg) ddl = ddl.replaceAll("\\bDOUBLE\\b", "DOUBLE PRECISION").replace("BLOB(8M)", "BYTEA");
                st.executeUpdate(ddl);
            }
            Demo.cargar(c);
            c.commit();
        } catch (Exception e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(auto);
        }
    }

    private static final String[] ESQUEMA = {
        "CREATE TABLE EMPLEADO (USUARIO VARCHAR(64) PRIMARY KEY, NOMBRE VARCHAR(120) NOT NULL, PUESTO VARCHAR(120),"
            + " DEPARTAMENTO VARCHAR(80), RESPONSABLE VARCHAR(64), ROL VARCHAR(16) NOT NULL,"
            + " DIAS_VACACIONES INT NOT NULL, DIAS_PROPIOS INT NOT NULL, PIN VARCHAR(8), TARJETA VARCHAR(40))",
        "CREATE TABLE FESTIVO (FECHA DATE PRIMARY KEY, NOMBRE VARCHAR(80) NOT NULL)",
        // Registro de jornada: solo se añaden marcas (las correcciones aprobadas entran con ORIGEN = CORRECCION)
        "CREATE TABLE FICHAJE (ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, USUARIO VARCHAR(64) NOT NULL,"
            + " TIPO VARCHAR(10) NOT NULL, MOMENTO TIMESTAMP NOT NULL, MODALIDAD VARCHAR(12) NOT NULL,"
            + " ORIGEN VARCHAR(12) NOT NULL, CREADO TIMESTAMP NOT NULL,"
            // Motivo de la pausa (desayuno, comida, médico…) y ubicación del dispositivo al fichar
            + " INCIDENCIA VARCHAR(12), LAT DOUBLE, LON DOUBLE, PRECISION_M INT)",
        "CREATE INDEX FICHAJE_USUARIO ON FICHAJE (USUARIO, MOMENTO)",
        "CREATE TABLE CORRECCION (ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, USUARIO VARCHAR(64) NOT NULL,"
            + " FECHA DATE NOT NULL, TIPO VARCHAR(10) NOT NULL, HORA TIME NOT NULL, MOTIVO VARCHAR(500),"
            + " ESTADO VARCHAR(12) NOT NULL, APROBADOR VARCHAR(64), COMENTARIO VARCHAR(500),"
            + " CREADO TIMESTAMP NOT NULL, RESUELTO TIMESTAMP)",
        "CREATE TABLE AUSENCIA (ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, USUARIO VARCHAR(64) NOT NULL,"
            + " TIPO VARCHAR(20) NOT NULL, DESDE DATE NOT NULL, HASTA DATE NOT NULL, DIAS INT NOT NULL,"
            + " COMENTARIO VARCHAR(500), ESTADO VARCHAR(12) NOT NULL, APROBADOR VARCHAR(64),"
            + " COMENTARIO_RESP VARCHAR(500), CREADO TIMESTAMP NOT NULL, RESUELTO TIMESTAMP)",
        "CREATE INDEX AUSENCIA_USUARIO ON AUSENCIA (USUARIO, DESDE)",
        // Gastos y viajes: importes en céntimos (IVA incluido en IMPORTE)
        "CREATE TABLE VIAJE (ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, USUARIO VARCHAR(64) NOT NULL,"
            + " DESTINO VARCHAR(120) NOT NULL, MOTIVO VARCHAR(500), DESDE DATE NOT NULL, HASTA DATE NOT NULL,"
            + " ESTIMADO INT NOT NULL, ESTADO VARCHAR(12) NOT NULL, APROBADOR VARCHAR(64), COMENTARIO_RESP VARCHAR(500),"
            + " CREADO TIMESTAMP NOT NULL, RESUELTO TIMESTAMP)",
        "CREATE TABLE NOTA_GASTO (ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, USUARIO VARCHAR(64) NOT NULL,"
            + " TITULO VARCHAR(160) NOT NULL, VIAJE INT, ESTADO VARCHAR(12) NOT NULL, APROBADOR VARCHAR(64),"
            + " COMENTARIO_RESP VARCHAR(500), PAGADOR VARCHAR(64), CREADO TIMESTAMP NOT NULL, ENVIADO TIMESTAMP,"
            + " RESUELTO TIMESTAMP, PAGADO TIMESTAMP)",
        "CREATE TABLE LINEA_GASTO (ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, NOTA INT NOT NULL,"
            + " FECHA DATE NOT NULL, CATEGORIA VARCHAR(16) NOT NULL, DESCRIPCION VARCHAR(200), IMPORTE INT NOT NULL,"
            + " IVA INT NOT NULL, KM INT, JUSTIFICACION VARCHAR(500), TICKET_NOMBRE VARCHAR(120), TICKET_TIPO VARCHAR(60),"
            + " TICKET BLOB(8M))",
        "CREATE INDEX LINEA_NOTA ON LINEA_GASTO (NOTA)",
        // Conversación de cada solicitud (CLASE: AUSENCIA, CORRECCION, NOTA, VIAJE) y avisos para cada persona
        "CREATE TABLE COMENTARIO (ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, CLASE VARCHAR(12) NOT NULL, OBJETO INT NOT NULL,"
            + " USUARIO VARCHAR(64) NOT NULL, TEXTO VARCHAR(1000) NOT NULL, CREADO TIMESTAMP NOT NULL)",
        "CREATE INDEX COMENTARIO_OBJETO ON COMENTARIO (CLASE, OBJETO)",
        "CREATE TABLE AVISO (ID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, USUARIO VARCHAR(64) NOT NULL, APP VARCHAR(16) NOT NULL,"
            + " CLASE VARCHAR(12), OBJETO INT, TEXTO VARCHAR(300) NOT NULL, LEIDO SMALLINT NOT NULL, CREADO TIMESTAMP NOT NULL)",
        "CREATE INDEX AVISO_USUARIO ON AVISO (USUARIO, CREADO)",
    };
}
