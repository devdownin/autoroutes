package fr.autoroutes.supervision.history;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class PartitionGranularityTest {

    @Test
    void namesAndBoundsRoundTrip() {
        var day = LocalDate.of(2026, 10, 22);
        for (var granularity : PartitionManager.Granularity.values()) {
            var spec = new PartitionManager.Spec("t", granularity, false, Duration.ofDays(1));
            var start = granularity.start(day);
            var name = spec.partitionName(start);

            assertThat(granularity.parse(name.substring(3))).isEqualTo(start);
            assertThat(granularity.end(start)).isAfter(day);
        }
        assertThat(new PartitionManager.Spec("station_quarter", PartitionManager.Granularity.MONTH, false, Duration.ZERO)
                .partitionName(LocalDate.of(2026, 10, 1))).isEqualTo("station_quarter_p202610");
    }
}
