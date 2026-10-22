package fr.autoroutes.supervision.history;

import java.time.Duration;

/** Pas de lecture d'une série : table interrogée et plage maximale (= rétention de la table). */
public enum Resolution {
    PT1M("station_minute", Duration.ofDays(7)),
    PT15M("station_quarter", Duration.ofDays(400)),
    PT1H("station_hour", Duration.ofDays(1100));

    private final String table;
    private final Duration maxSpan;

    Resolution(String table, Duration maxSpan) {
        this.table = table;
        this.maxSpan = maxSpan;
    }

    String table() {
        return table;
    }

    public Duration maxSpan() {
        return maxSpan;
    }
}
