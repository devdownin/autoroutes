package fr.autoroutes.supervision.aggregation;

import java.time.Instant;

/** Indicateurs d'une gare logique, tous OBSERVÉS, calculés à la minute du watermark. */
public record StationMetrics(
        String stationId,
        WindowCounts last5m,
        WindowCounts last15m,
        WindowCounts last1h,
        WindowCounts today,
        Instant lastEventTime) {
}
