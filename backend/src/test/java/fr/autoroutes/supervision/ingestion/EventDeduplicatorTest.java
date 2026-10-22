package fr.autoroutes.supervision.ingestion;

import static fr.autoroutes.supervision.ingestion.EventDeduplicator.Outcome.BEYOND_HORIZON;
import static fr.autoroutes.supervision.ingestion.EventDeduplicator.Outcome.DUPLICATE;
import static fr.autoroutes.supervision.ingestion.EventDeduplicator.Outcome.NEW;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class EventDeduplicatorTest {

    private static final Instant T0 = Instant.parse("2026-10-22T08:00:00Z");
    private final EventDeduplicator deduplicator = new EventDeduplicator(Duration.ofHours(2));

    @Test
    void detectsReplayedEventWithinHorizon() {
        assertThat(deduplicator.register("e-1", T0, T0)).isEqualTo(NEW);
        assertThat(deduplicator.register("e-2", T0, T0)).isEqualTo(NEW);
        assertThat(deduplicator.register("e-1", T0, T0.plusSeconds(3600))).isEqualTo(DUPLICATE);
        assertThat(deduplicator.size()).isEqualTo(2);
    }

    @Test
    void evictsIdentifiersOnceWatermarkPassesHorizonAndRefusesOlderEvents() {
        deduplicator.register("e-1", T0, T0);

        var later = T0.plus(Duration.ofHours(2)).plusSeconds(60);
        assertThat(deduplicator.register("e-3", later, later)).isEqualTo(NEW);
        assertThat(deduplicator.size()).isEqualTo(1);
        assertThat(deduplicator.register("e-1", T0, later)).isEqualTo(BEYOND_HORIZON);
    }

    @Test
    void restoresFromCheckpointExport() {
        deduplicator.register("e-1", T0, T0);
        var restored = new EventDeduplicator(Duration.ofHours(2));
        restored.restore(deduplicator.export());

        assertThat(restored.register("e-1", T0, T0)).isEqualTo(DUPLICATE);
        assertThat(restored.size()).isEqualTo(1);
    }
}
