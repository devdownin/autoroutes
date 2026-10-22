package fr.autoroutes.supervision.aggregation;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Optional;

/**
 * STALE : aucun événement traité depuis {@code staleAfter} ; CATCHING_UP : retard du consommateur au-delà du seuil
 * (l'interface ne doit pas animer un rattrapage comme une activité réelle) ; LIVE sinon.
 * Une gare est périmée si son dernier passage précède le watermark de plus de {@code stationStaleAfter}.
 */
public record FreshnessPolicy(Duration staleAfter, Duration stationStaleAfter, long catchingUpLag) {

    public Freshness evaluate(Instant now, Instant lastProcessedAt, Optional<Instant> watermark, long consumerLag,
                              AggregationState state, Collection<String> stationIds) {
        FreshnessStatus status;
        if (lastProcessedAt == null || lastProcessedAt.isBefore(now.minus(staleAfter))) {
            status = FreshnessStatus.STALE;
        } else if (consumerLag > catchingUpLag) {
            status = FreshnessStatus.CATCHING_UP;
        } else {
            status = FreshnessStatus.LIVE;
        }
        var reference = watermark.orElse(now);
        var threshold = reference.minus(stationStaleAfter);
        var stale = stationIds.stream()
                .filter(id -> state.lastEventTime(id).map(t -> t.isBefore(threshold)).orElse(true))
                .sorted()
                .toList();
        var lagSeconds = watermark.map(w -> Math.max(0, Duration.between(w, now).toSeconds())).orElse(0L);
        return new Freshness(status, consumerLag, lagSeconds, stale);
    }
}
