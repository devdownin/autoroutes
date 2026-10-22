package fr.autoroutes.supervision.ingestion;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/** Retard du consommateur (messages), lu dans les métriques du client Kafka publiées par Micrometer. */
@Component
public class ConsumerLagProbe {

    private final MeterRegistry registry;

    ConsumerLagProbe(MeterRegistry registry) {
        this.registry = registry;
    }

    /** Somme des retards par partition ; 0 si les métriques ne sont pas encore disponibles. */
    public long lag() {
        return Math.round(registry.find("kafka.consumer.fetch.manager.records.lag").gauges().stream()
                .mapToDouble(g -> g.value())
                .filter(Double::isFinite)
                .filter(v -> v > 0)
                .sum());
    }
}
