package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.SupervisionProperties;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

/** Prêt quand l'écrivain tourne et que le rattrapage est terminé (retard du consommateur sous le seuil). */
@Component("supervisionHealthIndicator")
class SupervisionHealthIndicator implements HealthIndicator {

    private final AggregationWriter writer;
    private final LiveView liveView;
    private final long catchingUpLag;

    SupervisionHealthIndicator(AggregationWriter writer, LiveView liveView, SupervisionProperties properties) {
        this.writer = writer;
        this.liveView = liveView;
        this.catchingUpLag = properties.aggregation().catchingUpLag();
    }

    @Override
    public Health health() {
        var stats = liveView.stats();
        if (!writer.isRunning() || stats.isEmpty()) {
            return Health.down().withDetail("writer", "arrêté").build();
        }
        var s = stats.get();
        var builder = s.consumerLag() > catchingUpLag ? Health.down() : Health.up();
        return builder.withDetail("epoch", s.epoch())
                .withDetail("consumerLag", s.consumerLag())
                .withDetail("watermarkLagSeconds", s.watermarkLagSeconds())
                .withDetail("freshness", s.status())
                .build();
    }
}
