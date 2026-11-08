package com.europesip.orbita.core;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Los mensajes que la lógica devuelve al usuario (errores de negocio y confirmaciones) están escritos en español; la
 * API REST los traduce al idioma de la interfaz (cabecera X-Orbita-Lang) con esta tabla. Los mensajes con datos usan
 * patrones; un mensaje que no está en la tabla se devuelve tal cual (en español).
 */
public final class Mensajes {

    private static final Map<String, String> EN = new LinkedHashMap<>();
    private static final Map<Pattern, String> EN_PATRONES = new LinkedHashMap<>();

    private Mensajes() {}

    private static void en(String es, String en) { EN.put(es, en); }
    private static void patron(String regex, String en) { EN_PATRONES.put(Pattern.compile(regex), en); }

    /** El mensaje en el idioma pedido (es | en). */
    public static String traducir(String texto, String idioma) {
        if (texto == null || !"en".equals(idioma)) return texto;
        String t = EN.get(texto);
        if (t != null) return t;
        for (Map.Entry<Pattern, String> p : EN_PATRONES.entrySet()) {
            Matcher m = p.getKey().matcher(texto);
            if (m.matches()) {
                String r = p.getValue();
                for (int i = 1; i <= m.groupCount(); i++) r = r.replace("$" + i, traducirTrozo(m.group(i)));
                return r;
            }
        }
        return texto;
    }

    /** Trozos que se repiten dentro de los mensajes con datos. */
    private static String traducirTrozo(String s) {
        return switch (s) {
            case "día" -> "day";
            case "días" -> "days";
            case "nota de gasto" -> "expense report";
            case "solicitud" -> "request";
            case "solicitud de viaje" -> "travel request";
            case "Aprobada" -> "approved";
            case "Rechazada" -> "rejected";
            default -> s;
        };
    }

    static {
        // Errores de negocio (Api.Aviso)
        en("Añade al menos un gasto antes de enviar la nota.", "Add at least one expense before sending the report.");
        en("Decisión no válida.", "Invalid decision.");
        en("Describe el gasto (por ejemplo, «Taxi al aeropuerto»).", "Describe the expense (for example, \"Taxi to the airport\").");
        en("El IVA tiene que ser menor que el importe total.", "The VAT must be lower than the total amount.");
        en("El ticket ocupa demasiado (máximo 6 MB).", "The receipt is too large (6 MB maximum).");
        en("El viaje tiene que ser en fechas futuras.", "The trip must be on future dates.");
        en("Elige el tipo de ausencia.", "Choose the type of absence.");
        en("Elige la categoría del gasto.", "Choose the expense category.");
        en("En esas fechas no hay ningún día laborable.", "There are no working days on those dates.");
        en("Esa línea no es de esta nota.", "That line does not belong to this report.");
        en("Esa línea no tiene ticket.", "That line has no receipt.");
        en("Esa línea ya no existe.", "That line no longer exists.");
        en("Esa nota de gasto no es tuya.", "That expense report is not yours.");
        en("Esa solicitud no es de tu equipo.", "That request is not from your team.");
        en("Escribe el comentario.", "Write the comment.");
        en("Ese fichaje no corresponde a tu estado actual. Recarga la página.", "That clocking does not match your current status. Reload the page.");
        en("Ese viaje no es tuyo.", "That trip is not yours.");
        en("Esta instalación no tiene datos de demostración.", "This installation has no demo data.");
        en("Este dispositivo no está autorizado como quiosco.", "This device is not authorised as a kiosk.");
        en("Explica el motivo de la corrección.", "Explain the reason for the correction.");
        en("Explica el motivo del rechazo.", "Explain the reason for the rejection.");
        en("Explica el motivo del viaje.", "Explain the purpose of the trip.");
        en("Fecha no válida.", "Invalid date.");
        en("Indica el destino del viaje.", "Enter the destination of the trip.");
        en("Indica el importe del gasto.", "Enter the amount of the expense.");
        en("Indica el importe estimado del viaje.", "Enter the estimated cost of the trip.");
        en("Indica la hora correcta (hh:mm).", "Enter the correct time (hh:mm).");
        en("Indica los kilómetros recorridos.", "Enter the kilometres travelled.");
        en("Indica qué marca falta o es incorrecta.", "Indicate which clocking is missing or wrong.");
        en("Inicia sesión en DX para usar la aplicación.", "Sign in to DX to use the application.");
        en("Kilómetros no válidos.", "Invalid kilometres.");
        en("La fecha de fin es anterior a la de inicio.", "The end date is before the start date.");
        en("La fecha de vuelta es anterior a la de ida.", "The return date is before the departure date.");
        en("La fecha del gasto no puede ser futura.", "The expense date cannot be in the future.");
        en("La nota de gasto ya no existe.", "The expense report no longer exists.");
        en("La nota necesita un título.", "The report needs a title.");
        en("La nota ya está enviada y no se puede modificar.", "The report has already been sent and cannot be changed.");
        en("La solicitud ya estaba resuelta.", "The request had already been resolved.");
        en("La solicitud ya no existe.", "The request no longer exists.");
        en("No existe esa solicitud.", "That request does not exist.");
        en("No se pueden pedir ausencias en fechas pasadas.", "You cannot request absences on past dates.");
        en("No tienes acceso a esa conversación.", "You do not have access to that conversation.");
        en("No tienes permiso para ver el registro de esa persona.", "You are not allowed to see that person's time records.");
        en("No tienes permiso para ver esa nota de gasto.", "You are not allowed to see that expense report.");
        en("No tienes permiso para ver ese ticket.", "You are not allowed to see that receipt.");
        en("No tienes personas a tu cargo.", "You have nobody reporting to you.");
        en("Operación no permitida sin iniciar sesión.", "Operation not allowed without signing in.");
        en("Pide por separado los días de cada año.", "Request the days of each year separately.");
        en("Pon un título a la nota (por ejemplo, «Visita a clientes en Valencia»).", "Give the report a title (for example, \"Customer visits in Valencia\").");
        en("Selecciona las notas que quieres marcar como pagadas.", "Select the reports you want to mark as paid.");
        en("Solo Administración puede exportar a contabilidad.", "Only Accounting can export to the accounting system.");
        en("Solo Administración puede gestionar los pagos.", "Only Accounting can manage payments.");
        en("Solo RRHH puede exportar el registro de toda la plantilla.", "Only HR can export the time records of all the staff.");
        en("Solo RRHH puede restaurar los datos de demostración.", "Only HR can restore the demo data.");
        en("Solo se pueden asociar viajes aprobados.", "Only approved trips can be linked.");
        en("Solo se pueden cancelar solicitudes pendientes o ausencias que aún no han empezado.", "Only pending requests or absences that have not started yet can be cancelled.");
        en("Solo se pueden cancelar viajes pendientes o que aún no han empezado.", "Only pending trips or trips that have not started yet can be cancelled.");
        en("Solo se pueden corregir días pasados o de hoy.", "Only past days or today can be corrected.");
        en("Teclea tu PIN o acerca tu tarjeta.", "Type your PIN or hold your card up to the camera.");
        en("Tipo de fichaje no válido.", "Invalid clocking type.");
        en("Tipo de solicitud desconocido.", "Unknown request type.");
        en("Ya tienes una ausencia pedida o aprobada en esas fechas.", "You already have an absence requested or approved on those dates.");
        en("PIN incorrecto.", "Wrong PIN.");
        en("Tarjeta no reconocida.", "Card not recognised.");
        en("Error interno del servidor.", "Internal server error.");
        // API y asistente
        en("ÓRBITA se está iniciando: inténtalo en unos segundos.", "ÓRBITA is starting: try again in a few seconds.");
        en("No hay sesión de DX: vuelve a iniciar sesión en el portal.", "There is no DX session: sign in to the portal again.");
        en("El cuerpo de la petición no es un objeto JSON.", "The request body is not a JSON object.");
        en("El asistente de ÓRBITA no está configurado (assistant.* en el chart).", "The ÓRBITA assistant is not configured (assistant.* in the chart).");
        en("La conversación debe terminar con una pregunta del usuario.", "The conversation must end with a question from the user.");
        en("Petición interrumpida.", "Request interrupted.");
        en("No se puede conectar con el modelo de IA.", "Cannot connect to the AI model.");
        patron("El modelo de IA no ha respondido correctamente \\((\\d+)\\)\\.", "The AI model did not answer correctly ($1).");
        patron("No existe (GET|POST|PUT|DELETE) (.+)", "There is no $1 $2");
        // Confirmaciones ("mensaje")
        en("Borrador eliminado.", "Draft deleted.");
        en("Datos de demostración restaurados.", "Demo data restored.");
        en("Solicitud cancelada.", "Request cancelled.");
        en("Viaje cancelado.", "Trip cancelled.");
        en("Corrección registrada.", "Correction recorded.");
        en("Nota registrada: pasa directamente a pago.", "Report recorded: it goes straight to payment.");
        en("Viaje registrado.", "Trip recorded.");
        en("1 nota marcada como pagada.", "1 report marked as paid.");
        // Con datos
        patron("Falta el dato (.+)\\.", "The value $1 is missing.");
        patron("Importe no válido: (.+)", "Invalid amount: $1");
        patron("Operación desconocida: (.+)", "Unknown operation: $1");
        patron("Justifica los gastos que superan la política antes de enviar: (.+)\\.", "Justify the expenses over the policy before sending: $1.");
        patron("Pides (\\d+) días y te quedan (\\d+) disponibles en (\\d+)\\.", "You are asking for $1 days and you have $2 left in $3.");
        patron("Tu usuario de DX \\((.+)\\) no tiene ficha de empleado en ÓRBITA\\.", "Your DX user ($1) has no employee record in ÓRBITA.");
        patron("Ausencia registrada \\((\\d+) (día|días)\\)\\.", "Absence recorded ($1 $2).");
        patron("Solicitud de (\\d+) (día|días) enviada a (.+)\\.", "Request for $1 $2 sent to $3.");
        patron("Corrección enviada a (.+)\\.", "Correction sent to $1.");
        patron("Nota de (.+) € enviada a (.+)\\.", "Report of €$1 sent to $2.");
        patron("Solicitud de viaje a (.+) enviada a (.+)\\.", "Travel request to $1 sent to $2.");
        patron("(Aprobada|Rechazada) la (nota de gasto|solicitud de viaje) de (.+)\\.", "$3's $2 has been $1.");
        patron("(Aprobada|Rechazada) la solicitud de (.+)\\.", "$2's request has been $1.");
        patron("(\\d+) notas marcadas como pagadas\\.", "$1 reports marked as paid.");
    }

    // Comunicación con RRHH (Comunicacion)
    static {
        en("Solo RRHH puede publicar comunicados.", "Only HR can publish notices.");
        en("Solo RRHH puede ver quién ha leído un comunicado.", "Only HR can see who has read a notice.");
        en("Solo RRHH puede enviar recordatorios.", "Only HR can send reminders.");
        en("Solo RRHH puede archivar comunicados.", "Only HR can archive notices.");
        en("Solo RRHH puede cambiar el estado de una consulta.", "Only HR can change the status of a question.");
        en("Solo RRHH puede editar las preguntas frecuentes.", "Only HR can edit the FAQ.");
        en("Solo RRHH puede crear encuestas.", "Only HR can create surveys.");
        en("Solo RRHH puede cerrar encuestas.", "Only HR can close surveys.");
        en("Ese departamento no existe.", "That department does not exist.");
        en("Destinatarios no válidos.", "Invalid recipients.");
        en("El comunicado ya no existe.", "The notice no longer exists.");
        en("Ese comunicado no va dirigido a ti.", "That notice is not addressed to you.");
        en("Este comunicado no necesita confirmación.", "This notice does not need to be acknowledged.");
        en("Lectura confirmada.", "Reading acknowledged.");
        en("Escribe el título del comunicado.", "Write the title of the notice.");
        en("Escribe el texto del comunicado.", "Write the text of the notice.");
        en("Categoría no válida.", "Invalid category.");
        en("El enlace tiene que empezar por https:// o por /.", "The link must start with https:// or /.");
        en("La fecha límite no puede ser anterior a hoy.", "The deadline cannot be earlier than today.");
        en("No hay nadie en esos destinatarios.", "There is nobody in those recipients.");
        en("Todos los destinatarios lo han confirmado.", "All recipients have acknowledged it.");
        en("Todos los destinatarios lo han leído.", "All recipients have read it.");
        en("Comunicado archivado.", "Notice archived.");
        en("La consulta ya no existe.", "The question no longer exists.");
        en("No tienes acceso a esa consulta.", "You do not have access to that question.");
        en("Escribe el asunto de la consulta.", "Write the subject of the question.");
        en("Explica tu consulta.", "Explain your question.");
        en("Consulta enviada a RRHH.", "Question sent to HR.");
        en("Solo quien hizo la consulta puede reabrirla.", "Only the person who asked can reopen it.");
        en("La consulta no está resuelta.", "The question is not resolved.");
        en("Consulta reabierta.", "Question reopened.");
        en("La consulta ya está resuelta.", "The question is already resolved.");
        en("Consulta asignada a ti.", "Question assigned to you.");
        en("Consulta resuelta.", "Question resolved.");
        en("Estado no válido.", "Invalid status.");
        en("Solo quien hizo la consulta puede valorarla.", "Only the person who asked can rate it.");
        en("La valoración va de 1 a 5.", "The rating goes from 1 to 5.");
        en("Gracias por tu valoración.", "Thank you for your rating.");
        en("Escribe la pregunta y la respuesta.", "Write the question and the answer.");
        en("La pregunta ya no existe.", "The question no longer exists.");
        en("Pregunta frecuente guardada.", "FAQ entry saved.");
        en("Pregunta frecuente borrada.", "FAQ entry deleted.");
        en("La encuesta no existe o no va dirigida a ti.", "The survey does not exist or is not addressed to you.");
        en("Esta encuesta no va dirigida a ti.", "This survey is not addressed to you.");
        en("La encuesta ya está cerrada.", "The survey is already closed.");
        en("Ya has respondido a esta encuesta.", "You have already answered this survey.");
        en("Respuestas no válidas.", "Invalid answers.");
        en("Responde a todas las preguntas (el comentario es opcional).", "Answer every question (the comment is optional).");
        en("Respuesta fuera de escala.", "Answer out of scale.");
        en("Gracias: tus respuestas son anónimas.", "Thank you: your answers are anonymous.");
        en("Escribe el título de la encuesta.", "Write the title of the survey.");
        en("El mínimo de respuestas para ver resultados va de 3 a 50.", "The minimum number of answers to see results goes from 3 to 50.");
        en("La fecha de cierre no puede ser anterior a hoy.", "The closing date cannot be earlier than today.");
        en("Tipo de pregunta no válido.", "Invalid question type.");
        en("Preguntas no válidas.", "Invalid questions.");
        en("Añade al menos una pregunta.", "Add at least one question.");
        en("Un pulso tiene como mucho 10 preguntas: que sea corto.", "A pulse has 10 questions at most: keep it short.");
        en("Hay menos destinatarios que el mínimo de respuestas: nunca se verían resultados.", "There are fewer recipients than the minimum number of answers: results would never be shown.");
        en("Encuesta cerrada.", "Survey closed.");
        en("Solo RRHH y los responsables ven los resultados del pulso.", "Only HR and managers see the pulse results.");
        en("No tienes acceso a esa conversación.", "You do not have access to that conversation.");
        patron("Comunicado publicado para (\\d+) personas\\.", "Notice published for $1 people.");
        patron("Recordatorio enviado a (\\d+) personas\\.", "Reminder sent to $1 people.");
        patron("Encuesta abierta para (\\d+) personas\\.", "Survey opened for $1 people.");
    }
}
