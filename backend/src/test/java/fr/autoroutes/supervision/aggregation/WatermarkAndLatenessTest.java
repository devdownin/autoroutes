package fr.autoroutes.supervision.aggregation;

import static fr.autoroutes.supervision.aggregation.LatenessPolicy.Verdict.CORRECTION;
import static fr.autoroutes.supervision.aggregation.LatenessPolicy.Verdict.ON_TIME;
import static fr.autoroutes.supervision.aggregation.LatenessPolicy.Verdict.TOO_LATE;
import static org.assertj.core.api.Assertions.assertThat;

import fr.autoroutes.supervision.MutableClock;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class WatermarkAndLatenessTest {

    private static final Instant T0 = Instant.parse("2026-10-22T08:00:00Z");
    private final MutableClock clock = new MutableClock(T0);
    private final WatermarkTracker tracker = new WatermarkTracker(Duration.ofSeconds(30), clock);

    @Test
    void watermarkIsTheSlowestActivePartition() {
        tracker.observe(0, T0.plusSeconds(120));
        tracker.observe(1, T0.plusSeconds(60));
        tracker.observe(0, T0.plusSeconds(30));

        assertThat(tracker.watermark()).contains(T0.plusSeconds(60));
    }

    @Test
    void idlePartitionStopsHoldingBackTheWatermark() {
        tracker.observe(1, T0);
        clock.advance(Duration.ofSeconds(45));
        tracker.observe(0, T0.plusSeconds(300));

        assertThat(tracker.watermark()).contains(T0.plusSeconds(300));
    }

    @Test
    void watermarkFallsBackToMostAdvancedPartitionWhenAllAreIdle() {
        tracker.observe(0, T0);
        tracker.observe(1, T0.plusSeconds(90));
        clock.advance(Duration.ofMinutes(5));

        assertThat(tracker.watermark()).contains(T0.plusSeconds(90));
    }

    @Test
    void classifiesByLatenessRelativeToWatermark() {
        var policy = new LatenessPolicy(Duration.ofMinutes(10), Duration.ofHours(2));

        assertThat(policy.classify(T0.minus(Duration.ofMinutes(10)), T0)).isEqualTo(ON_TIME);
        assertThat(policy.classify(T0.plusSeconds(60), T0)).isEqualTo(ON_TIME);
        assertThat(policy.classify(T0.minus(Duration.ofMinutes(11)), T0)).isEqualTo(CORRECTION);
        assertThat(policy.classify(T0.minus(Duration.ofHours(2)), T0)).isEqualTo(CORRECTION);
        assertThat(policy.classify(T0.minus(Duration.ofHours(2)).minusSeconds(1), T0)).isEqualTo(TOO_LATE);
    }
}
