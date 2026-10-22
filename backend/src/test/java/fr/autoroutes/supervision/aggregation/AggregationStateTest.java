package fr.autoroutes.supervision.aggregation;

import static fr.autoroutes.supervision.ingestion.EventType.ENTRY;
import static fr.autoroutes.supervision.ingestion.EventType.EXIT;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class AggregationStateTest {

    private static final ZoneId PARIS = ZoneId.of("Europe/Paris");
    private final AggregationState state = new AggregationState(PARIS);

    @Test
    void computesSlidingWindowsAndBalance() {
        var now = Instant.parse("2026-10-22T08:00:30Z");
        state.apply("GL-1", ENTRY, now, 3);
        state.apply("GL-1", EXIT, now.minus(Duration.ofMinutes(10)), 2);
        state.apply("GL-1", ENTRY, now.minus(Duration.ofMinutes(50)), 5);

        var metrics = state.metrics("GL-1", now);

        assertThat(metrics.last5m()).isEqualTo(new WindowCounts(3, 0));
        assertThat(metrics.last15m()).isEqualTo(new WindowCounts(3, 2));
        assertThat(metrics.last1h()).isEqualTo(new WindowCounts(8, 2));
        assertThat(metrics.last1h().balance()).isEqualTo(6);
        assertThat(metrics.lastEventTime()).isEqualTo(now);
    }

    @Test
    void windowsExpireWithTimeWithoutNewEvents() {
        var t = Instant.parse("2026-10-22T08:00:00Z");
        state.apply("GL-1", ENTRY, t, 1);

        assertThat(state.metrics("GL-1", t.plus(Duration.ofMinutes(5))).last5m()).isEqualTo(WindowCounts.ZERO);
        assertThat(state.metrics("GL-1", t.plus(Duration.ofMinutes(5))).last15m().entries()).isEqualTo(1);
    }

    @Test
    void todayStartsAtParisMidnightAndCovers25HoursOnFallBackDay() {
        // 25/10/2026 : minuit à Paris = 24/10 22:00Z ; la journée dure 25 h.
        state.apply("GL-1", ENTRY, Instant.parse("2026-10-24T21:59:00Z"), 100);
        state.apply("GL-1", ENTRY, Instant.parse("2026-10-24T22:00:00Z"), 1);
        state.apply("GL-1", EXIT, Instant.parse("2026-10-25T22:58:00Z"), 1);

        var endOfDay = Instant.parse("2026-10-25T22:59:00Z");

        assertThat(state.metrics("GL-1", endOfDay).today()).isEqualTo(new WindowCounts(1, 1));
    }

    @Test
    void unknownStationHasZeroMetrics() {
        var metrics = state.metrics("GL-X", Instant.parse("2026-10-22T08:00:00Z"));

        assertThat(metrics.today()).isEqualTo(WindowCounts.ZERO);
        assertThat(metrics.lastEventTime()).isNull();
    }
}
