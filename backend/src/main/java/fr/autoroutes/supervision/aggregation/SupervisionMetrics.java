package fr.autoroutes.supervision.aggregation;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.function.ToDoubleFunction;
import org.springframework.stereotype.Component;

/**
 * Jauges d'exploitation lues dans les derniers instantanés de l'écrivain (jamais dans son état mutable) :
 * retard du watermark, statut de fraîcheur, gares périmées, retard du consommateur, âge du dernier point de reprise.
 * Servent aux alertes (retard du watermark, rattrapage, point de reprise en échec).
 */
@Component
class SupervisionMetrics implements MeterBinder {

    private final LiveView liveView;
    private final Clock clock;

    SupervisionMetrics(LiveView liveView, Clock clock) {
        this.liveView = liveView;
        this.clock = clock;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        stat(registry, "toll.watermark.lag.seconds", "Retard du watermark sur l'horloge (s)", s -> s.watermarkLagSeconds());
        stat(registry, "toll.consumer.lag", "Messages en retard dans le groupe de consommateurs", s -> s.consumerLag());
        stat(registry, "toll.checkpoint.bytes", "Taille du dernier point de reprise (octets)", s -> s.lastCheckpointBytes());
        stat(registry, "toll.freshness.status", "Fraîcheur globale : 0 LIVE, 1 CATCHING_UP, 2 STALE", s -> s.status().ordinal());
        stat(registry, "toll.checkpoint.age.seconds", "Âge du dernier point de reprise (s)", s -> s.lastCheckpointAt() == null
                ? Double.NaN
                : Duration.between(s.lastCheckpointAt(), Instant.now(clock)).toSeconds());
        Gauge.builder("toll.stations.stale", liveView, v -> v.freshness().map(f -> (double) f.staleStations().size()).orElse(Double.NaN))
                .description("Gares sans événement récent par rapport au watermark")
                .register(registry);
        Gauge.builder("toll.od.origin.known.ratio", liveView, v -> v.odSnapshot().map(o -> o.coverage().originKnownRatio()).orElse(Double.NaN))
                .description("Part des sorties en système fermé dont la gare d'entrée est connue (fenêtre O/D)")
                .register(registry);
        Gauge.builder("toll.od.reconciliation.gap.ratio", liveView, v -> v.odSnapshot().map(OdSnapshot::reconciliationGapRatio).orElse(Double.NaN))
                .description("Écart relatif entre sorties des gares et issues O/D (doit rester nul ; critère ± 0,5 %)")
                .register(registry);
    }

    private void stat(MeterRegistry registry, String name, String description, ToDoubleFunction<WriterStats> value) {
        Gauge.builder(name, liveView, v -> v.stats().map(value::applyAsDouble).orElse(Double.NaN))
                .description(description)
                .register(registry);
    }
}
