package fr.autoroutes.supervision.aggregation;

import static fr.autoroutes.supervision.ingestion.EventType.ENTRY;
import static fr.autoroutes.supervision.ingestion.EventType.EXIT;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import org.junit.jupiter.api.Test;

class HistoryIncrementsTest {

    private final HistoryIncrements increments = new HistoryIncrements(ZoneId.of("Europe/Paris"));

    @Test
    void accumulatesPerStationAndMinute() {
        var t = Instant.parse("2026-10-22T08:00:10Z");
        increments.station("A", ENTRY, t, 2);
        increments.station("A", EXIT, t.plusSeconds(30), 1);
        increments.station("A", ENTRY, t.plusSeconds(60), 1);

        var batch = increments.drain();

        var minute = t.getEpochSecond() / 60;
        assertThat(batch.minutes()).containsExactlyInAnyOrderEntriesOf(Map.of(
                new HistoryBatch.StationMinute("A", minute), new WindowCounts(2, 1),
                new HistoryBatch.StationMinute("A", minute + 1), new WindowCounts(1, 0)));
    }

    @Test
    void assignsOdDayInParisTime() {
        // 23:30 UTC le 22/10 = 01:30 à Paris le 23/10.
        increments.od("A", "B", Instant.parse("2026-10-22T23:30:00Z"), 3);

        var batch = increments.drain();

        assertThat(batch.odDays()).containsExactly(Map.entry(new HistoryBatch.OdDay("A", "B", LocalDate.of(2026, 10, 23)), 3L));
        assertThat(batch.odHours()).containsExactly(Map.entry(
                new HistoryBatch.OdHour("A", "B", Instant.parse("2026-10-22T23:00:00Z").getEpochSecond() / 3600), 3L));
    }

    @Test
    void mergesBatchesForRetry() {
        increments.station("A", ENTRY, Instant.parse("2026-10-22T08:00:00Z"), 1);
        var first = increments.drain();
        increments.station("A", ENTRY, Instant.parse("2026-10-22T08:00:20Z"), 4);
        increments.od("A", "B", Instant.parse("2026-10-22T08:00:00Z"), 1);
        var second = increments.drain();

        var merged = first.merge(second);

        assertThat(merged.minutes().values()).containsExactly(new WindowCounts(5, 0));
        assertThat(merged.odHours().values()).containsExactly(1L);
        assertThat(HistoryBatch.EMPTY.merge(HistoryBatch.EMPTY).isEmpty()).isTrue();
    }
}
