package com.europesip.orbita.core;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.logging.Logger;

import javax.naming.InitialContext;
import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;

/**
 * Base de datos de ÓRBITA (PostgreSQL, fuente de datos jdbc/orbita de server.xml).
 *
 *  - El esquema lo crea y lo actualiza Flyway con las migraciones de db/migration (V1__esquema.sql, V2__...). Nunca se
 *    borran tablas para cambiar el esquema.
 *  - Los datos de demostración se cargan si la variable ORBITA_DEMO_SEED=true y la plantilla está vacía, y se pueden
 *    restaurar desde la aplicación (RRHH): se vacían las tablas y se vuelven a cargar.
 */
public final class Db {

    private static final Logger LOG = Logger.getLogger(Db.class.getName());
    private static final String[] TABLAS = {"AVISO", "COMENTARIO", "LINEA_GASTO", "NOTA_GASTO", "VIAJE", "FICHAJE",
        "CORRECCION", "AUSENCIA", "FESTIVO", "EMPLEADO"};

    private static volatile DataSource ds;

    private Db() {}

    public static DataSource fuente() throws Exception {
        if (ds == null) ds = (DataSource) new InitialContext().lookup(Config.JNDI);
        return ds;
    }

    static Connection conexion() throws Exception {
        return fuente().getConnection();
    }

    /** Aplica las migraciones pendientes y, en modo demo, carga los datos si no hay plantilla. Idempotente. */
    public static void preparar() throws Exception {
        MigrateResult r = Flyway.configure(Db.class.getClassLoader())
                .dataSource(fuente())
                // En Open Liberty (y WebSphere) Flyway solo encuentra la carpeta si contiene un fichero flyway.location
                .locations("classpath:db/migration")
                .callbackLocations("classpath:db/migration")
                .load()
                .migrate();
        LOG.info("ORBITA: esquema en la versión " + (r.targetSchemaVersion != null ? r.targetSchemaVersion : r.initialSchemaVersion)
                + " (" + r.migrationsExecuted + " migraciones aplicadas ahora)");
        if (!Config.demo()) return;
        try (Connection c = conexion()) {
            if (vacia(c)) {
                enTransaccion(c, () -> Demo.cargar(c));
                LOG.info("ORBITA: datos de demostración cargados");
            }
        }
    }

    /** true cuando la base de datos responde y tiene el esquema (para las sondas de Kubernetes y de DX IQ). */
    public static boolean lista() {
        try (Connection c = conexion(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM EMPLEADO")) {
            return rs.next();
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean vacia(Connection c) throws Exception {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM EMPLEADO")) {
            return rs.next() && rs.getInt(1) == 0;
        }
    }

    /** Vacía todas las tablas y vuelve a cargar los datos de demostración (para repetir la demo desde cero). */
    static synchronized void restaurar(Connection c) throws Exception {
        enTransaccion(c, () -> {
            try (Statement st = c.createStatement()) {
                st.executeUpdate("TRUNCATE TABLE " + String.join(", ", TABLAS) + " RESTART IDENTITY");
            }
            Demo.cargar(c);
        });
    }

    private interface Trabajo {
        void hacer() throws Exception;
    }

    private static void enTransaccion(Connection c, Trabajo t) throws Exception {
        boolean auto = c.getAutoCommit();
        c.setAutoCommit(false);
        try {
            t.hacer();
            c.commit();
        } catch (Exception e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(auto);
        }
    }
}
