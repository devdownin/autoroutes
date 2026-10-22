package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.SupervisionProperties;
import fr.autoroutes.supervision.ingestion.EventDeduplicator;
import fr.autoroutes.supervision.referentiel.LogicalStation;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import fr.autoroutes.supervision.referentiel.StationResolver;
import java.time.Clock;
import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Objets d'état de l'écrivain unique : non thread-safe par conception, accessibles uniquement depuis son thread. */
@Configuration(proxyBeanMethods = false)
class AggregationConfig {

    /** Identifiant de cette instance d'état : change à chaque démarrage, impose un snapshot aux clients. */
    @Bean
    StreamEpoch streamEpoch() {
        return new StreamEpoch(UUID.randomUUID().toString());
    }

    @Bean
    WatermarkTracker watermarkTracker(SupervisionProperties properties, Clock clock) {
        return new WatermarkTracker(properties.aggregation().partitionIdleTimeout(), clock);
    }

    @Bean
    EventDeduplicator eventDeduplicator(SupervisionProperties properties) {
        return new EventDeduplicator(properties.aggregation().dedupHorizon());
    }

    @Bean
    AggregationState aggregationState(SupervisionProperties properties) {
        return new AggregationState(properties.zone());
    }

    @Bean
    OdCounters odCounters() {
        return new OdCounters();
    }

    @Bean
    HistoryIncrements historyIncrements(SupervisionProperties properties) {
        return new HistoryIncrements(properties.zone());
    }

    @Bean
    EventProcessor eventProcessor(StationResolver resolver, WatermarkTracker watermarks, EventDeduplicator deduplicator,
                                  AggregationState state, OdCounters od, HistoryIncrements history,
                                  SupervisionProperties properties, StationCatalog catalog) {
        var aggregation = properties.aggregation();
        // Système ouvert = barrière pleine voie : un seul passage, sans gare d'entrée attendue (phase 1, section 6).
        return new EventProcessor(resolver, watermarks,
                new LatenessPolicy(aggregation.allowedLateness(), aggregation.dedupHorizon()), deduplicator, state, od, history,
                id -> catalog.find(id).map(s -> s.kind() == LogicalStation.Kind.PLEINE_VOIE).orElse(false));
    }

    @Bean
    DeltaComputer deltaComputer(StreamEpoch epoch) {
        return new DeltaComputer(epoch.value());
    }

    @Bean
    FreshnessPolicy freshnessPolicy(SupervisionProperties properties) {
        var aggregation = properties.aggregation();
        return new FreshnessPolicy(aggregation.staleAfter(), aggregation.stationStaleAfter(), aggregation.catchingUpLag());
    }

    @Bean
    CheckpointCodec checkpointCodec() {
        return new CheckpointCodec();
    }
}
