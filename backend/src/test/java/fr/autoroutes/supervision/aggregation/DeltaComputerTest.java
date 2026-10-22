package fr.autoroutes.supervision.aggregation;

import static fr.autoroutes.supervision.ingestion.EventType.ENTRY;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class DeltaComputerTest {

    private static final Instant T0 = Instant.parse("2026-10-22T08:00:10Z");
    private final AggregationState state = new AggregationState(ZoneId.of("Europe/Paris"));
    private final DeltaComputer computer = new DeltaComputer("epoch-1");

    @Test
    void emitsOnlyChangedStationsWithContiguousSequence() {
        state.apply("GL-1", ENTRY, T0, 1);
        state.apply("GL-2", ENTRY, T0, 1);
        var first = computer.tick(state, T0).orElseThrow();

        state.apply("GL-2", ENTRY, T0, 1);
        var second = computer.tick(state, T0.plusSeconds(1)).orElseThrow();

        assertThat(first.seq()).isEqualTo(1);
        assertThat(first.stations()).extracting(StationMetrics::stationId).containsExactly("GL-1", "GL-2");
        assertThat(second.seq()).isEqualTo(2);
        assertThat(second.stations()).extracting(StationMetrics::stationId).containsExactly("GL-2");
    }

    @Test
    void emitsNothingWhenNothingChanged() {
        state.apply("GL-1", ENTRY, T0, 1);
        computer.tick(state, T0);

        assertThat(computer.tick(state, T0.plusSeconds(1))).isEmpty();
    }

    @Test
    void recomputesAllStationsWhenWindowsSlideAtMinuteBoundary() {
        state.apply("GL-1", ENTRY, T0, 1);
        computer.tick(state, T0);

        var afterExpiry = computer.tick(state, T0.plus(Duration.ofMinutes(5))).orElseThrow();

        assertThat(afterExpiry.stations()).singleElement()
                .satisfies(m -> assertThat(m.last5m()).isEqualTo(WindowCounts.ZERO));
    }

    @Test
    void snapshotMatchesStateAfterLastDelta() {
        state.apply("GL-1", ENTRY, T0, 4);
        var delta = computer.tick(state, T0).orElseThrow();

        var snapshot = computer.snapshot();

        assertThat(snapshot.seq()).isEqualTo(delta.seq());
        assertThat(snapshot.epoch()).isEqualTo("epoch-1");
        assertThat(snapshot.stations()).isEqualTo(delta.stations());
    }
}
