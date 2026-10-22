package fr.autoroutes.supervision.aggregation;

import static org.assertj.core.api.Assertions.assertThat;

import fr.autoroutes.supervision.MutableClock;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SupervisionMetricsTest {

    private static final Instant NOW = Instant.parse("2026-10-22T08:00:00Z");

    @Test
    void exposesNaNUntilTheWriterPublishesThenLiveValues() {
        var liveView = new LiveView();
        var registry = new SimpleMeterRegistry();
        new SupervisionMetrics(liveView, new MutableClock(NOW)).bindTo(registry);

        assertThat(registry.get("toll.watermark.lag.seconds").gauge().value()).isNaN();

        liveView.update(new WriterStats("e1", NOW.minusSeconds(7), 7, 1_234, 3, 10, Map.of(), Map.of(),
                NOW.minusSeconds(30), 4_096, FreshnessStatus.CATCHING_UP));
        liveView.update(new Freshness(FreshnessStatus.CATCHING_UP, 1_234, 7, List.of("A", "B")));

        assertThat(registry.get("toll.watermark.lag.seconds").gauge().value()).isEqualTo(7);
        assertThat(registry.get("toll.consumer.lag").gauge().value()).isEqualTo(1_234);
        assertThat(registry.get("toll.freshness.status").gauge().value()).isEqualTo(1);
        assertThat(registry.get("toll.stations.stale").gauge().value()).isEqualTo(2);
        assertThat(registry.get("toll.checkpoint.age.seconds").gauge().value()).isEqualTo(30);
        assertThat(registry.get("toll.checkpoint.bytes").gauge().value()).isEqualTo(4_096);
    }
}
