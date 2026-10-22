package fr.autoroutes.supervision.aggregation;

import static fr.autoroutes.supervision.ingestion.EventType.ENTRY;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class FreshnessPolicyTest {

    private static final Instant NOW = Instant.parse("2026-10-22T08:00:00Z");
    private final FreshnessPolicy policy = new FreshnessPolicy(Duration.ofSeconds(60), Duration.ofMinutes(15), 5_000);
    private final AggregationState state = new AggregationState(ZoneId.of("Europe/Paris"));

    @Test
    void liveWhenEventsFlowWithoutBacklog() {
        state.apply("A", ENTRY, NOW.minusSeconds(2), 1);

        var freshness = policy.evaluate(NOW, NOW.minusSeconds(1), Optional.of(NOW.minusSeconds(2)), 10, state, List.of("A", "B"));

        assertThat(freshness.status()).isEqualTo(FreshnessStatus.LIVE);
        assertThat(freshness.watermarkLagSeconds()).isEqualTo(2);
        assertThat(freshness.staleStations()).containsExactly("B");
    }

    @Test
    void catchingUpWhenConsumerLagExceedsThreshold() {
        var freshness = policy.evaluate(NOW, NOW, Optional.of(NOW.minus(Duration.ofHours(2))), 80_000, state, List.of());

        assertThat(freshness.status()).isEqualTo(FreshnessStatus.CATCHING_UP);
    }

    @Test
    void staleWithoutRecentProcessing() {
        assertThat(policy.evaluate(NOW, null, Optional.empty(), 0, state, List.of()).status()).isEqualTo(FreshnessStatus.STALE);
        assertThat(policy.evaluate(NOW, NOW.minusSeconds(61), Optional.empty(), 0, state, List.of()).status()).isEqualTo(FreshnessStatus.STALE);
    }

    @Test
    void stationStalenessIsRelativeToWatermarkNotWallClock() {
        state.apply("A", ENTRY, NOW.minus(Duration.ofHours(1)), 1);

        var replaying = policy.evaluate(NOW, NOW, Optional.of(NOW.minus(Duration.ofMinutes(50))), 0, state, List.of("A"));

        assertThat(replaying.staleStations()).isEmpty();
    }

    @Test
    void onlyStatusOrStaleListChangesAreVisible() {
        var a = new Freshness(FreshnessStatus.LIVE, 1, 1, List.of("X"));

        assertThat(new Freshness(FreshnessStatus.LIVE, 99, 7, List.of("X")).visiblyDiffersFrom(a)).isFalse();
        assertThat(new Freshness(FreshnessStatus.STALE, 1, 1, List.of("X")).visiblyDiffersFrom(a)).isTrue();
        assertThat(new Freshness(FreshnessStatus.LIVE, 1, 1, List.of()).visiblyDiffersFrom(a)).isTrue();
    }
}
