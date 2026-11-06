package com.europesip.orbita.rest;

import java.util.logging.Level;
import java.util.logging.Logger;

import com.europesip.orbita.core.Db;

import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import jakarta.servlet.annotation.WebListener;

/**
 * Al arrancar orbita-api: aplica las migraciones de la base de datos (Flyway) y, en modo demo, carga los datos.
 * Se reintenta en segundo plano mientras la base de datos no responda (p. ej. al instalar todo a la vez); hasta
 * entonces /v1/salud contesta 503 y Kubernetes no envía tráfico al pod.
 */
@WebListener
public class Arranque implements ServletContextListener {

    private static final Logger LOG = Logger.getLogger(Arranque.class.getName());
    private static volatile boolean listo;
    private Thread hilo;

    static boolean listo() { return listo; }

    @Override
    public void contextInitialized(ServletContextEvent ev) {
        hilo = new Thread(() -> {
            for (int intento = 1; !listo && !Thread.currentThread().isInterrupted(); intento++) {
                try {
                    Db.preparar();
                    listo = true;
                    LOG.info("ORBITA: orbita-api lista");
                } catch (Exception e) {
                    LOG.log(Level.WARNING, "ORBITA: la base de datos no está lista (intento " + intento + "), reintento en 10 s: " + e);
                    try {
                        Thread.sleep(10_000);
                    } catch (InterruptedException ie) {
                        return;
                    }
                }
            }
        }, "orbita-arranque");
        hilo.setDaemon(true);
        hilo.start();
    }

    @Override
    public void contextDestroyed(ServletContextEvent ev) {
        if (hilo != null) hilo.interrupt();
    }
}
