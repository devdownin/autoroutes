package fr.autoroutes.supervision.aggregation;

import static fr.autoroutes.supervision.ingestion.EventType.ENTRY;
import static fr.autoroutes.supervision.ingestion.EventType.EXIT;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import fr.autoroutes.supervision.MutableClock;
import fr.autoroutes.supervision.ingestion.EventDeduplicator;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CheckpointCodecTest {

    private static final Instant T0 = Instant.parse("2026-10-22T08:00:00Z");
    private static final ZoneId PARIS = ZoneId.of("Europe/Paris");
    private final CheckpointCodec codec = new CheckpointCodec();

    @Test
    void restoredStateProducesIdenticalMetricsAndDeduplication() {
        var state = new AggregationState(PARIS);
        state.apply("GL-1", ENTRY, T0, 3);
        state.apply("GL-1", EXIT, T0.minus(Duration.ofMinutes(40)), 2);
        state.apply("GL-2", ENTRY, T0.minus(Duration.ofHours(5)), 7);
        var od = new OdCounters();
        od.add("GL-2", "GL-1", T0, 4);
        var dedup = new EventDeduplicator(Duration.ofHours(2));
        dedup.register("e-1", T0, T0);
        var clock = new MutableClock(T0);
        var watermarks = new WatermarkTracker(Duration.ofSeconds(30), clock);
        watermarks.observe(0, T0);
        watermarks.observe(3, T0.minusSeconds(5));

        var decoded = codec.decode(codec.encode(new CheckpointData(T0, Map.of(0, 42L, 3, 7L), watermarks.export(),
                state.export(), od.export(), od.exportCoverage(), dedup.export())));

        var restoredState = new AggregationState(PARIS);
        restoredState.restore(decoded.stations());
        var restoredOd = new OdCounters();
        restoredOd.restore(decoded.od(), decoded.odCoverage());
        var restoredDedup = new EventDeduplicator(Duration.ofHours(2));
        restoredDedup.restore(decoded.dedup());
        var restoredWatermarks = new WatermarkTracker(Duration.ofSeconds(30), clock);
        restoredWatermarks.restore(decoded.watermarks());

        assertThat(decoded.nextOffsets()).containsExactlyInAnyOrderEntriesOf(Map.of(0, 42L, 3, 7L));
        assertThat(restoredState.metrics("GL-1", T0)).isEqualTo(state.metrics("GL-1", T0));
        assertThat(restoredState.metrics("GL-2", T0)).isEqualTo(state.metrics("GL-2", T0));
        assertThat(restoredOd.flows(T0, Duration.ofHours(1), 1, 10)).isEqualTo(od.flows(T0, Duration.ofHours(1), 1, 10));
        assertThat(restoredOd.coverage(T0, Duration.ofHours(1))).isEqualTo(od.coverage(T0, Duration.ofHours(1)));
        assertThat(restoredDedup.register("e-1", T0, T0)).isEqualTo(EventDeduplicator.Outcome.DUPLICATE);
        assertThat(restoredWatermarks.watermark()).isEqualTo(watermarks.watermark());
    }

    @Test
    void readsVersion1CheckpointWithoutCoverage() throws Exception {
        var bytes = new java.io.ByteArrayOutputStream();
        try (var out = new java.io.DataOutputStream(new java.util.zip.GZIPOutputStream(bytes))) {
            out.writeInt(1);
            out.writeLong(T0.toEpochMilli());
            for (var i = 0; i < 5; i++) {
                out.writeInt(0); // offsets, watermarks, gares, flux O/D, déduplication
            }
        }

        var decoded = codec.decode(bytes.toByteArray());

        assertThat(decoded.createdAt()).isEqualTo(T0);
        assertThat(decoded.odCoverage()).isEmpty();
    }

    @Test
    void rejectsCorruptedPayload() {
        var payload = codec.encode(new CheckpointData(T0, Map.of(), Map.of(), List.of(), List.of(), List.of(), Map.of()));
        payload[payload.length - 1] ^= 0x7F;

        assertThatThrownBy(() -> codec.decode(payload)).isInstanceOf(RuntimeException.class);
    }
}
