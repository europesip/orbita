package com.demo.orbita.mcp;

import java.util.Arrays;
import java.util.List;

import com.demo.orbita.mcp.Herramienta.Esquema;

/**
 * Catálogo de herramientas (tools) del MCP de ÓRBITA.
 *
 * AÑADIR UNA HERRAMIENTA: crea una entrada en TODAS siguiendo los dos ejemplos de abajo (consulta y modificación).
 *  - Nombre en snake_case, descripción pensada para el modelo (cuándo usarla y qué devuelve).
 *  - Esquema.conUsuario() siempre: 'usuario' es obligatorio y la operación se ejecuta con SUS permisos.
 *  - Las que modifican datos: soloLectura=false, .confirmar() en el esquema y pedirConfirmacion() si no hay confirmar=true.
 *  - Para ejecutar: l.api("<op>", "clave", valor, ...) con las operaciones de la API de la suite (Api.java, Gastos.java).
 *
 * PENDIENTES (catálogo acordado, ver mcp/README.md):
 *   vacaciones_solicitudes   vac.anio (anio)                     solicitudes del año y su estado
 *   vacaciones_cancelar      vac.cancelar (id)                   [modifica] cancela una solicitud pendiente
 *   ausencias_equipo         vac.calendario (anio, mes)          quién falta en su equipo
 *   fichaje_hoy              fichaje.estado                      si ha fichado hoy y horas
 *   fichaje_mes              fichaje.mes (anio, mes)             horas, saldo e incidencias del mes
 *   gastos_resumen           gastos.resumen                      gastos del año, notas y pendiente de cobro
 *   gastos_nota              gastos.nota (id)                    detalle de una nota de gasto
 *   viaje_solicitar          viaje.solicitar (destino, motivo, desde, hasta, estimado)   [modifica]
 *   aprobaciones_pendientes  apr.pendientes                      lo que tiene que aprobar
 *   aprobar / rechazar       apr.resolver (clase=AUSENCIA|CORRECCION|NOTA|VIAJE, id, decision=APROBAR|RECHAZAR, comentario)   [modifica]
 *   resumen_dia              inicio.resumen                      panel de Mi intranet
 *   avisos                   avisos.lista                        avisos de la campana
 */
final class Herramientas {

    private Herramientas() {}

    static final List<Herramienta> TODAS = Arrays.asList(

        // Ejemplo de CONSULTA
        new Herramienta("vacaciones_saldo", "Saldo de vacaciones",
            "Devuelve los días de vacaciones y de asuntos propios del año actual de un empleado: totales, disfrutados, "
                + "pendientes de aprobar y disponibles, y sus próximas ausencias. Úsala para preguntas como "
                + "'¿cuántas vacaciones me quedan?'.",
            Esquema.conUsuario(), true,
            l -> l.api("vac.resumen")),

        // Ejemplo de MODIFICACIÓN (con confirmación previa)
        new Herramienta("vacaciones_solicitar", "Solicitar vacaciones o ausencia",
            "Crea una solicitud de ausencia (vacaciones, asuntos propios, permiso o baja) entre dos fechas, que queda "
                + "pendiente de aprobar por su responsable. Se cuentan solo los días laborables. La primera llamada no cambia "
                + "nada: devuelve un resumen; repítela con confirmar=true cuando el usuario lo confirme.",
            Esquema.conUsuario()
                .opciones("tipo", "Tipo de ausencia", true, "VACACIONES", "ASUNTOS_PROPIOS", "PERMISO", "BAJA")
                .fecha("desde", "Primer día de la ausencia", true)
                .fecha("hasta", "Último día de la ausencia (inclusive)", true)
                .texto("comentario", "Comentario para el responsable", false)
                .confirmar(),
            false,
            l -> {
                String tipo = l.texto("tipo"), desde = l.texto("desde"), hasta = l.texto("hasta");
                if (tipo == null || desde == null || hasta == null) return Herramienta.Resultado.error("Faltan tipo, desde o hasta.");
                if (!l.confirmado()) {
                    return l.pedirConfirmacion(String.format("Solicitud de %s para %s del %s al %s%s.", tipo.toLowerCase().replace('_', ' '),
                        l.usuario, desde, hasta, l.texto("comentario") == null ? "" : " («" + l.texto("comentario") + "»)"));
                }
                return l.api("vac.solicitar", "tipo", tipo, "desde", desde, "hasta", hasta, "comentario", l.texto("comentario"));
            })
    );

    static Herramienta buscar(String nombre) {
        for (Herramienta h : TODAS) if (h.nombre.equals(nombre)) return h;
        return null;
    }
}
