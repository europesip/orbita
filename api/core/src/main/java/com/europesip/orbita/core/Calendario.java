package com.europesip.orbita.core;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Set;

/** Calendario laboral: lunes a jueves 8 h, viernes 7 h; fines de semana y festivos no son laborables. */
final class Calendario {

    private Calendario() {}

    static boolean laborable(LocalDate d, Set<LocalDate> festivos) {
        DayOfWeek w = d.getDayOfWeek();
        return w != DayOfWeek.SATURDAY && w != DayOfWeek.SUNDAY && !festivos.contains(d);
    }

    /** Minutos de jornada teórica de un día (0 si no es laborable). */
    static int objetivo(LocalDate d, Set<LocalDate> festivos) {
        if (!laborable(d, festivos)) return 0;
        return d.getDayOfWeek() == DayOfWeek.FRIDAY ? 420 : 480;
    }

    static int laborables(LocalDate desde, LocalDate hasta, Set<LocalDate> festivos) {
        int n = 0;
        for (LocalDate d = desde; !d.isAfter(hasta); d = d.plusDays(1)) if (laborable(d, festivos)) n++;
        return n;
    }

    /** El n-ésimo día laborable a partir de d (incluido si lo es). */
    static LocalDate laborableDesde(LocalDate d, int n, Set<LocalDate> festivos) {
        while (!laborable(d, festivos)) d = d.plusDays(1);
        for (int i = 0; i < n; ) {
            d = d.plusDays(1);
            if (laborable(d, festivos)) i++;
        }
        return d;
    }

    /** Lunes de la semana de d. */
    static LocalDate lunes(LocalDate d) {
        return d.minusDays(d.getDayOfWeek().getValue() - 1);
    }
}
