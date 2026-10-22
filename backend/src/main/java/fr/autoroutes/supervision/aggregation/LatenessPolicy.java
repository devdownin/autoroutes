package fr.autoroutes.supervision.aggregation;

import java.time.Duration;
import java.time.Instant;

/**
 * Classement d'un événement selon son retard par rapport au watermark.
 * <ul>
 *   <li>{@code ON_TIME} : la minute n'est pas encore figée dans l'historique ;</li>
 *   <li>{@code CORRECTION} : appliqué à l'état courant et répercuté en correction de l'historique ;</li>
 *   <li>{@code TOO_LATE} : au-delà de l'horizon de déduplication, rejeté (idempotence impossible à garantir).</li>
 * </ul>
 */
public record LatenessPolicy(Duration allowedLateness, Duration horizon) {

    public enum Verdict {
        ON_TIME,
        CORRECTION,
        TOO_LATE
    }

    public LatenessPolicy {
        if (allowedLateness.isNegative() || horizon.compareTo(allowedLateness) < 0) {
            throw new IllegalArgumentException("Exigé : 0 <= allowedLateness <= horizon");
        }
    }

    public Verdict classify(Instant eventTime, Instant watermark) {
        if (!eventTime.isBefore(watermark.minus(allowedLateness))) {
            return Verdict.ON_TIME;
        }
        return eventTime.isBefore(watermark.minus(horizon)) ? Verdict.TOO_LATE : Verdict.CORRECTION;
    }
}
