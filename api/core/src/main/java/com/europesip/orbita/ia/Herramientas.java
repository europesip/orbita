package com.europesip.orbita.ia;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;

import com.europesip.orbita.core.Config;

import com.europesip.orbita.ia.Herramienta.Esquema;
import com.europesip.orbita.ia.Herramienta.Llamada;
import com.europesip.orbita.ia.Herramienta.Resultado;

/**
 * Catálogo de herramientas (tools) del MCP de ÓRBITA. Todas actúan como el usuario de DX que pregunta, con sus permisos.
 *
 * AÑADIR UNA HERRAMIENTA: una entrada más en TODAS.
 *  - Nombre en snake_case, descripción pensada para el modelo (cuándo usarla y qué devuelve).
 *  - Esquema.nuevo() y sus parámetros: nunca un parámetro de usuario (la identidad es la sesión de DX).
 *  - Las que modifican datos: soloLectura=false, .confirmar() en el esquema y pedirConfirmacion() si no hay confirmar=true.
 *  - Para ejecutar: l.api("<op>", "clave", valor, ...) con las operaciones de la lógica (api/rutas.json).
 *
 * Fuera a propósito: pagar notas, restaurar la demo, borrar notas o líneas y exportaciones CSV (acciones masivas o
 * irreversibles que no deberían quedar a una sola frase de la IA).
 *
 * QUÉ HERRAMIENTAS SE PUBLICAN (activas()): todas por defecto. Cada definición va en el prompt de cada llamada al
 * modelo, así que se pueden limitar con variables de entorno (valores mcp.tools.* del chart):
 *   ORBITA_MCP_TOOLS           solo estas (nombres o áreas, separados por comas); vacío: todas
 *   ORBITA_MCP_TOOLS_DISABLED  quitar estas (nombres o áreas)
 *   ORBITA_MCP_READ_ONLY=true  solo las de consulta
 * Áreas: general, fichaje, vacaciones, gastos, aprobaciones (AREAS).
 */
public final class Herramientas {

    private Herramientas() {}

    private static final String[] TIPOS_AUSENCIA = {"VACACIONES", "ASUNTOS_PROPIOS", "PERMISO", "BAJA"};
    private static final String[] CLASES = {"AUSENCIA", "CORRECCION", "NOTA", "VIAJE"};
    private static final String[] MARCAS = {"ENTRADA", "PAUSA", "REANUDAR", "SALIDA"};
    private static final String[] CATEGORIAS = {"COMIDA", "HOTEL", "TRANSPORTE", "KILOMETRAJE", "PARKING", "OTROS"};

    public static final List<Herramienta> TODAS = Arrays.asList(

        // ------------------------------------------------------------------------------------------- General
        new Herramienta("quien_soy", "Mi ficha de empleado",
            "Devuelve la ficha del usuario que pregunta en ÓRBITA: nombre, puesto, departamento, rol (EMPLEADO, "
                + "RESPONSABLE, RRHH, ADMINISTRACION), su responsable y si tiene equipo a su cargo.",
            Esquema.nuevo(), true,
            l -> l.api("yo")),

        new Herramienta("resumen_dia", "Resumen del día",
            "El panel de 'Mi intranet' en una llamada: si ha fichado hoy, horas de la semana, saldo de vacaciones, gastos "
                + "del año, solicitudes por aprobar, quién falta en los próximos 14 días y últimos avisos. Úsala para "
                + "'¿qué tengo hoy?', '¿cómo voy?' o 'resúmeme mi situación'.",
            Esquema.nuevo(), true,
            l -> l.api("inicio.resumen")),

        new Herramienta("avisos", "Mis avisos",
            "Avisos de la campana del usuario (solicitudes aprobadas o rechazadas, comentarios, pagos...), con los no leídos.",
            Esquema.nuevo(), true,
            l -> l.api("avisos.lista")),

        new Herramienta("avisos_marcar_leidos", "Marcar avisos como leídos",
            "Marca como leídos todos los avisos del usuario (o uno, con su id).",
            Esquema.nuevo().entero("id", "id de un aviso concreto (sin él: todos)", false), false,
            l -> l.api("avisos.leer", "id", l.texto("id"))),

        // ------------------------------------------------------------------------------------------- Fichaje
        new Herramienta("fichaje_hoy", "Fichaje de hoy",
            "Indica si el usuario ha fichado hoy, su estado (FUERA, TRABAJANDO, PAUSA), desde qué hora, la modalidad "
                + "(oficina o teletrabajo) y cuánto lleva trabajado. Úsala para '¿he fichado?' o '¿cuántas horas llevo hoy?'.",
            Esquema.nuevo(), true,
            l -> l.api("fichaje.estado")),

        new Herramienta("fichaje_mes", "Registro de jornada del mes",
            "Horas trabajadas cada día de un mes, la jornada teórica, el saldo, los días sin cerrar (sin fichaje de salida) "
                + "y las incidencias. Un responsable o RRHH puede pedir el de una persona de su equipo con 'empleado'.",
            Esquema.nuevo()
                .entero("anio", "Año (por defecto, el actual)", false)
                .entero("mes", "Mes, 1-12 (por defecto, el actual)", false)
                .texto("empleado", "uid de una persona a su cargo (solo responsables y RRHH; por defecto, el propio usuario)", false),
            true,
            l -> l.api("fichaje.mes", "anio", anio(l), "mes", mes(l), "usuario", l.texto("empleado"))),

        new Herramienta("equipo_ahora", "Mi equipo ahora",
            "Para responsables y RRHH: quién de su equipo está trabajando, en pausa, fuera o ausente ahora mismo, y en qué "
                + "modalidad.",
            Esquema.nuevo(), true,
            l -> l.api("fichaje.equipo")),

        new Herramienta("fichar", "Fichar",
            "Registra un fichaje del usuario ahora: ENTRADA, PAUSA (con su motivo), REANUDAR o SALIDA, en OFICINA o "
                + "TELETRABAJO. Solo vale el que corresponde a su estado actual (consúltalo con fichaje_hoy). La primera "
                + "llamada no cambia nada: devuelve un resumen; repítela con confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo()
                .opciones("tipo", "Qué fichaje", true, MARCAS)
                .opciones("modalidad", "Dónde trabaja (por defecto, OFICINA)", false, "OFICINA", "TELETRABAJO")
                .opciones("motivo_pausa", "Solo para PAUSA: motivo", false, "DESAYUNO", "COMIDA", "MEDICO", "VISITA", "GESTION", "OTRA")
                .confirmar(),
            false,
            l -> confirmado(l, String.format("Fichar %s%s%s ahora.", l.texto("tipo"),
                    l.texto("modalidad") == null ? "" : " en " + l.texto("modalidad").toLowerCase(),
                    l.texto("motivo_pausa") == null ? "" : " (" + l.texto("motivo_pausa").toLowerCase() + ")"),
                () -> l.api("fichaje.marcar", "tipo", l.texto("tipo"), "modalidad", l.texto("modalidad"), "incidencia", l.texto("motivo_pausa")))),

        new Herramienta("fichaje_corregir", "Pedir una corrección de fichaje",
            "Pide a su responsable que corrija un fichaje olvidado o equivocado de un día pasado o de hoy: qué marca "
                + "(ENTRADA, PAUSA, REANUDAR, SALIDA), la hora correcta y el motivo. Primero devuelve un resumen; repítela "
                + "con confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo()
                .fecha("fecha", "Día del fichaje", true)
                .opciones("tipo", "Qué marca falta o es incorrecta", true, MARCAS)
                .texto("hora", "Hora correcta, hh:mm", true)
                .texto("motivo", "Por qué hay que corregirlo", true)
                .confirmar(),
            false,
            l -> confirmado(l, String.format("Pedir corrección: %s del %s a las %s («%s»).", l.texto("tipo"), l.texto("fecha"),
                    l.texto("hora"), l.texto("motivo")),
                () -> l.api("fichaje.correccion", "fecha", l.texto("fecha"), "tipo", l.texto("tipo"), "hora", l.texto("hora"),
                        "motivo", l.texto("motivo")))),

        // ------------------------------------------------------------------------------------------- Vacaciones y ausencias
        new Herramienta("vacaciones_saldo", "Saldo de vacaciones",
            "Devuelve los días de vacaciones y de asuntos propios del año actual del usuario que pregunta: totales, disfrutados, "
                + "pendientes de aprobar y disponibles, y sus próximas ausencias. Úsala para preguntas como "
                + "'¿cuántas vacaciones me quedan?'.",
            Esquema.nuevo(), true,
            l -> l.api("vac.resumen")),

        new Herramienta("vacaciones_solicitudes", "Mis solicitudes de ausencia",
            "Las solicitudes de ausencia del usuario en un año, con su id, fechas, días, tipo y estado (PENDIENTE, "
                + "APROBADA, RECHAZADA, CANCELADA).",
            Esquema.nuevo().entero("anio", "Año (por defecto, el actual)", false), true,
            l -> l.api("vac.anio", "anio", anio(l))),

        new Herramienta("ausencias_equipo", "Ausencias del equipo",
            "Calendario de un mes: quién de su equipo (o de toda la plantilla, para RRHH) está de vacaciones, asuntos "
                + "propios, permiso o baja, y los festivos. Úsala para '¿quién falta la semana que viene?'.",
            Esquema.nuevo()
                .entero("anio", "Año (por defecto, el actual)", false)
                .entero("mes", "Mes, 1-12 (por defecto, el actual)", false),
            true,
            l -> l.api("vac.calendario", "anio", anio(l), "mes", mes(l))),

        new Herramienta("vacaciones_solicitar", "Solicitar vacaciones o ausencia",
            "Crea una solicitud de ausencia (vacaciones, asuntos propios, permiso o baja) del usuario que pregunta entre dos fechas, que queda "
                + "pendiente de aprobar por su responsable. Se cuentan solo los días laborables. La primera llamada no cambia "
                + "nada: devuelve un resumen; repítela con confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo()
                .opciones("tipo", "Tipo de ausencia", true, TIPOS_AUSENCIA)
                .fecha("desde", "Primer día de la ausencia", true)
                .fecha("hasta", "Último día de la ausencia (inclusive)", true)
                .texto("comentario", "Comentario para el responsable", false)
                .confirmar(),
            false,
            l -> confirmado(l, String.format("Solicitud de %s del %s al %s%s.", lower(l.texto("tipo")), l.texto("desde"), l.texto("hasta"),
                    l.texto("comentario") == null ? "" : " («" + l.texto("comentario") + "»)"),
                () -> l.api("vac.solicitar", "tipo", l.texto("tipo"), "desde", l.texto("desde"), "hasta", l.texto("hasta"),
                        "comentario", l.texto("comentario")))),

        new Herramienta("vacaciones_cancelar", "Cancelar una solicitud de ausencia",
            "Cancela una solicitud de ausencia del usuario que aún no ha empezado. El id sale de vacaciones_solicitudes. "
                + "Primero devuelve un resumen; repítela con confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo().entero("id", "id de la solicitud", true).confirmar(), false,
            l -> confirmado(l, "Cancelar la solicitud de ausencia " + l.texto("id") + ".",
                () -> l.api("vac.cancelar", "id", l.texto("id")))),

        // ------------------------------------------------------------------------------------------- Gastos y viajes
        new Herramienta("gastos_resumen", "Mis gastos",
            "Gastos del año del usuario por categoría, sus notas de gasto (id, título, estado: BORRADOR, ENVIADA, APROBADA, "
                + "RECHAZADA, PAGADA), lo pendiente de cobro y sus viajes.",
            Esquema.nuevo(), true,
            l -> l.api("gastos.resumen")),

        new Herramienta("nota_gasto", "Detalle de una nota de gasto",
            "Una nota de gasto con sus líneas (fecha, categoría, descripción, importe, IVA, si supera la política), el "
                + "total y su estado. El id sale de gastos_resumen o de aprobaciones_pendientes.",
            Esquema.nuevo().entero("id", "id de la nota", true), true,
            l -> l.api("gastos.nota", "id", l.texto("id"))),

        new Herramienta("nota_gasto_crear", "Crear una nota de gasto",
            "Crea una nota de gasto vacía (en borrador) con un título; después se le añaden gastos con gasto_anadir. "
                + "Primero devuelve un resumen; repítela con confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo().texto("titulo", "Título, p. ej. 'Visita a clientes en Valencia'", true).confirmar(), false,
            l -> confirmado(l, "Crear la nota de gasto «" + l.texto("titulo") + "».",
                () -> l.api("gastos.nuevaNota", "titulo", l.texto("titulo")))),

        new Herramienta("gasto_anadir", "Añadir un gasto a una nota",
            "Añade un gasto a una nota en borrador: fecha, categoría, descripción e importe total en euros con su IVA (o los "
                + "kilómetros, en KILOMETRAJE: 0,26 €/km). Si supera la política de la categoría (comida 30 €, hotel 120 €/noche, "
                + "otros 50 €) necesita justificación. Primero devuelve un resumen; repítela con confirmar=true.",
            Esquema.nuevo()
                .entero("nota", "id de la nota en borrador", true)
                .fecha("fecha", "Día del gasto (no futuro)", true)
                .opciones("categoria", "Categoría", true, CATEGORIAS)
                .texto("descripcion", "Descripción, p. ej. 'Taxi al aeropuerto'", true)
                .texto("importe", "Importe total en euros, IVA incluido (p. ej. 42,80); no en KILOMETRAJE", false)
                .texto("iva", "IVA incluido en el importe, en euros (por defecto 0)", false)
                .entero("km", "Kilómetros (solo KILOMETRAJE)", false)
                .texto("justificacion", "Motivo, si el gasto supera la política", false)
                .confirmar(),
            false,
            l -> confirmado(l, String.format("Añadir a la nota %s: %s del %s, «%s», %s.", l.texto("nota"), lower(l.texto("categoria")),
                    l.texto("fecha"), l.texto("descripcion"), l.texto("km") != null ? l.texto("km") + " km" : l.texto("importe") + " €"),
                () -> l.api("gastos.guardarLinea", "nota", l.texto("nota"), "fecha", l.texto("fecha"), "categoria", l.texto("categoria"),
                        "descripcion", l.texto("descripcion"), "importe", l.texto("importe"), "iva", l.texto("iva"),
                        "km", l.texto("km"), "justificacion", l.texto("justificacion")))),

        new Herramienta("nota_gasto_enviar", "Enviar una nota de gasto",
            "Envía una nota en borrador a su responsable para que la apruebe (después, Administración la paga). "
                + "Primero devuelve un resumen; repítela con confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo().entero("id", "id de la nota", true).confirmar(), false,
            l -> confirmado(l, "Enviar a aprobación la nota de gasto " + l.texto("id") + ".",
                () -> l.api("gastos.enviar", "id", l.texto("id")))),

        new Herramienta("viaje_solicitar", "Solicitar un viaje",
            "Pide la aprobación de un viaje de trabajo: destino, motivo, fechas de ida y vuelta (futuras) e importe "
                + "estimado en euros. Queda pendiente de su responsable. Primero devuelve un resumen; repítela con "
                + "confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo()
                .texto("destino", "Destino", true)
                .texto("motivo", "Motivo del viaje", true)
                .fecha("desde", "Día de ida", true)
                .fecha("hasta", "Día de vuelta", true)
                .texto("estimado", "Coste estimado en euros (p. ej. 350 o 350,50)", true)
                .confirmar(),
            false,
            l -> confirmado(l, String.format("Pedir un viaje a %s del %s al %s, unos %s € («%s»).", l.texto("destino"), l.texto("desde"),
                    l.texto("hasta"), l.texto("estimado"), l.texto("motivo")),
                () -> l.api("viaje.solicitar", "destino", l.texto("destino"), "motivo", l.texto("motivo"), "desde", l.texto("desde"),
                        "hasta", l.texto("hasta"), "estimado", l.texto("estimado")))),

        new Herramienta("viaje_cancelar", "Cancelar un viaje",
            "Cancela una solicitud de viaje del usuario (el id sale de gastos_resumen). Primero devuelve un resumen; "
                + "repítela con confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo().entero("id", "id del viaje", true).confirmar(), false,
            l -> confirmado(l, "Cancelar el viaje " + l.texto("id") + ".", () -> l.api("viaje.cancelar", "id", l.texto("id")))),

        new Herramienta("pagos_pendientes", "Notas pendientes de pago",
            "Para Administración: notas de gasto aprobadas pendientes de pago y las pagadas este mes, con importes y "
                + "personas. (El pago se hace en la aplicación, no desde el asistente.)",
            Esquema.nuevo(), true,
            l -> l.api("gastos.pagos")),

        // ------------------------------------------------------------------------------------------- Aprobaciones
        new Herramienta("aprobaciones_pendientes", "Solicitudes por aprobar",
            "Para responsables y RRHH: las solicitudes de su equipo pendientes de aprobar (ausencias, correcciones de "
                + "fichaje, notas de gasto y viajes), con su clase, id, persona, fechas, importes y avisos (p. ej. solapes).",
            Esquema.nuevo(), true,
            l -> l.api("apr.pendientes")),

        new Herramienta("solicitud_resolver", "Aprobar o rechazar una solicitud",
            "Aprueba o rechaza una solicitud de su equipo: clase (AUSENCIA, CORRECCION, NOTA, VIAJE) e id, de "
                + "aprobaciones_pendientes. Rechazar exige un comentario con el motivo. Primero devuelve un resumen; "
                + "repítela con confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo()
                .opciones("clase", "Tipo de solicitud", true, CLASES)
                .entero("id", "id de la solicitud", true)
                .opciones("decision", "Qué hacer", true, "APROBAR", "RECHAZAR")
                .texto("comentario", "Comentario para la persona (obligatorio al rechazar)", false)
                .confirmar(),
            false,
            l -> confirmado(l, String.format("%s la solicitud %s %s%s.", "APROBAR".equals(l.texto("decision")) ? "Aprobar" : "Rechazar",
                    lower(l.texto("clase")), l.texto("id"), l.texto("comentario") == null ? "" : " («" + l.texto("comentario") + "»)"),
                () -> l.api("apr.resolver", "clase", l.texto("clase"), "id", l.texto("id"), "decision", l.texto("decision"),
                        "comentario", l.texto("comentario")))),

        new Herramienta("solicitud_comentarios", "Conversación de una solicitud",
            "Los comentarios de una solicitud (ausencia, corrección, nota de gasto o viaje) entre la persona y su responsable.",
            Esquema.nuevo().opciones("clase", "Tipo de solicitud", true, CLASES).entero("id", "id de la solicitud", true), true,
            l -> l.api("com.lista", "clase", l.texto("clase"), "objeto", l.texto("id"))),

        new Herramienta("solicitud_comentar", "Comentar una solicitud",
            "Escribe un comentario en una solicitud (para preguntar o aclarar sin aprobar ni rechazar); la otra persona "
                + "recibe un aviso. Primero devuelve un resumen; repítela con confirmar=true cuando el usuario lo confirme.",
            Esquema.nuevo()
                .opciones("clase", "Tipo de solicitud", true, CLASES)
                .entero("id", "id de la solicitud", true)
                .texto("texto", "Comentario", true)
                .confirmar(),
            false,
            l -> confirmado(l, String.format("Comentar en %s %s: «%s».", lower(l.texto("clase")), l.texto("id"), l.texto("texto")),
                () -> l.api("com.enviar", "clase", l.texto("clase"), "objeto", l.texto("id"), "texto", l.texto("texto"))))
    );

    /** Área de cada herramienta (para activar o desactivar grupos enteros). */
    static final Map<String, List<String>> AREAS = new LinkedHashMap<>();
    static {
        AREAS.put("general", List.of("quien_soy", "resumen_dia", "avisos", "avisos_marcar_leidos"));
        AREAS.put("fichaje", List.of("fichaje_hoy", "fichaje_mes", "equipo_ahora", "fichar", "fichaje_corregir"));
        AREAS.put("vacaciones", List.of("vacaciones_saldo", "vacaciones_solicitudes", "ausencias_equipo", "vacaciones_solicitar",
                "vacaciones_cancelar"));
        AREAS.put("gastos", List.of("gastos_resumen", "nota_gasto", "nota_gasto_crear", "gasto_anadir", "nota_gasto_enviar",
                "viaje_solicitar", "viaje_cancelar", "pagos_pendientes"));
        AREAS.put("aprobaciones", List.of("aprobaciones_pendientes", "solicitud_resolver", "solicitud_comentarios", "solicitud_comentar"));
    }

    private static final Logger LOG = Logger.getLogger(Herramientas.class.getName());
    private static volatile List<Herramienta> activas;

    /** Las herramientas que se publican, según ORBITA_MCP_TOOLS, ORBITA_MCP_TOOLS_DISABLED y ORBITA_MCP_READ_ONLY. */
    public static List<Herramienta> activas() {
        if (activas == null) {
            activas = filtrar(Config.herramientasMcp(), Config.herramientasMcpQuitadas(), Config.mcpSoloLectura());
            List<String> n = new ArrayList<>();
            for (Herramienta h : activas) n.add(h.nombre);
            LOG.info("ORBITA MCP: " + activas.size() + " de " + TODAS.size() + " herramientas activas: " + String.join(", ", n));
        }
        return activas;
    }

    static List<Herramienta> filtrar(String solo, String quitar, boolean soloLectura) {
        Set<String> si = nombres(solo), no = nombres(quitar);
        boolean todas = solo == null || solo.isBlank();   // una lista con solo erratas no publica nada (no todas)
        List<Herramienta> l = new ArrayList<>();
        for (Herramienta h : TODAS) {
            if (!todas && !si.contains(h.nombre)) continue;
            if (no.contains(h.nombre)) continue;
            if (soloLectura && !h.soloLectura()) continue;
            l.add(h);
        }
        return List.copyOf(l);
    }

    /** "fichaje, nota_gasto" → los nombres de las herramientas (un área son todas las suyas). */
    private static Set<String> nombres(String lista) {
        Set<String> s = new LinkedHashSet<>();
        if (lista == null) return s;
        for (String x : lista.split("[,\\s]+")) {
            String k = x.trim().toLowerCase(Locale.ROOT);
            if (k.isEmpty()) continue;
            if (AREAS.containsKey(k)) s.addAll(AREAS.get(k));
            else if (TODAS.stream().anyMatch(h -> h.nombre.equals(k))) s.add(k);
            else LOG.warning("ORBITA MCP: herramienta o área desconocida en la configuración: " + k);
        }
        return s;
    }

    public static Herramienta buscar(String nombre) {
        for (Herramienta h : activas()) if (h.nombre.equals(nombre)) return h;
        return null;
    }

    // --- Ayudas --------------------------------------------------------------------------------------------------

    private interface Accion {
        Resultado hacer();
    }

    /** Para las que modifican datos: sin confirmar=true solo devuelve el resumen; con él, hace la acción. */
    private static Resultado confirmado(Llamada l, String resumen, Accion accion) {
        return l.confirmado() ? accion.hacer() : l.pedirConfirmacion(resumen);
    }

    private static String anio(Llamada l) {
        return l.texto("anio") != null ? l.texto("anio") : String.valueOf(LocalDate.now().getYear());
    }

    private static String mes(Llamada l) {
        return l.texto("mes") != null ? l.texto("mes") : String.valueOf(LocalDate.now().getMonthValue());
    }

    private static String lower(String s) {
        return s == null ? "" : s.toLowerCase().replace('_', ' ');
    }
}
