package fr.autoroutes.supervision.aggregation;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class OdCountersTest {

    private static final Instant T0 = Instant.parse("2026-10-22T08:00:00Z");
    private final OdCounters od = new OdCounters();

    @Test
    void aggregatesWindowAndMasksFlowsBelowDisclosureThreshold() {
        od.add("A", "B", T0, 2);
        od.add("A", "B", T0.plus(Duration.ofMinutes(20)), 2);
        od.add("C", "B", T0.plus(Duration.ofMinutes(20)), 2);
        od.add("A", "D", T0.plus(Duration.ofMinutes(25)), 9);

        var flows = od.flows(T0.plus(Duration.ofMinutes(30)), Duration.ofHours(1), 3, 10);

        assertThat(flows).containsExactly(new OdFlow("A", "D", 9), new OdFlow("A", "B", 4));
    }

    @Test
    void limitsAndExcludesBucketsOutsideWindow() {
        od.add("A", "B", T0, 50);
        od.add("A", "C", T0.plus(Duration.ofHours(2)), 5);
        od.add("A", "D", T0.plus(Duration.ofHours(2)), 4);

        var flows = od.flows(T0.plus(Duration.ofHours(2)), Duration.ofHours(1), 1, 1);

        assertThat(flows).containsExactly(new OdFlow("A", "C", 5));
    }
}
