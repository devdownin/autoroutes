package fr.autoroutes.supervision.aggregation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import fr.autoroutes.supervision.MutableClock;
import fr.autoroutes.supervision.aggregation.EventProcessor.OdStatus;
import fr.autoroutes.supervision.aggregation.EventProcessor.Outcome;
import fr.autoroutes.supervision.ingestion.EventDeduplicator;
import fr.autoroutes.supervision.ingestion.EventType;
import fr.autoroutes.supervision.ingestion.RejectReason;
import fr.autoroutes.supervision.ingestion.TollEvent;
import fr.autoroutes.supervision.referentiel.StationResolver;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EventProcessorTest {

    private static final Instant T0 = Instant.parse("2026-10-22T08:00:00Z");

    @Mock
    private StationResolver resolver;

    private AggregationState state;
    private OdCounters od;
    private HistoryIncrements history;
    private EventProcessor processor;

    @BeforeEach
    void setUp() {
        when(resolver.resolve(anyString())).thenReturn(Optional.empty());
        when(resolver.resolve("La Boisse")).thenReturn(Optional.of("GL-ECH-LA-BOISSE"));
        when(resolver.resolve("Bellegarde Entrée")).thenReturn(Optional.of("GL-ECH-BELLEGARDE"));
        state = new AggregationState(ZoneId.of("Europe/Paris"));
        od = new OdCounters();
        history = new HistoryIncrements(ZoneId.of("Europe/Paris"));
        processor = new EventProcessor(resolver,
                new WatermarkTracker(Duration.ofSeconds(30), new MutableClock(T0)),
                new LatenessPolicy(Duration.ofMinutes(10), Duration.ofHours(2)),
                new EventDeduplicator(Duration.ofHours(2)), state, od, history, id -> id.startsWith("GL-PV-"));
    }

    private static TollEvent exit(String id, Instant at, String entry) {
        return new TollEvent(id, "La Boisse", EventType.EXIT, at, entry, null, 1, null, false);
    }

    @Test
    void recordsExitAndObservedOriginDestinationFlow() {
        var outcome = processor.process(0, exit("e-1", T0, "Bellegarde Entrée"));

        assertThat(outcome).isEqualTo(new Outcome.Applied("GL-ECH-LA-BOISSE", false, OdStatus.RECORDED));
        assertThat(state.metrics("GL-ECH-LA-BOISSE", T0).last5m().exits()).isEqualTo(1);
        assertThat(od.flows(T0, Duration.ofHours(1), 1, 10))
                .containsExactly(new OdFlow("GL-ECH-BELLEGARDE", "GL-ECH-LA-BOISSE", 1));
    }

    @Test
    void recordsHistoryIncrementsOnlyForAppliedEvents() {
        processor.process(0, exit("e-1", T0, "Bellegarde Entrée"));
        processor.process(0, exit("e-1", T0, "Bellegarde Entrée"));
        processor.process(0, new TollEvent("e-2", "Gare Inconnue", EventType.ENTRY, T0, null, null, 1, null, false));

        var batch = history.drain();

        assertThat(batch.minutes()).containsExactly(java.util.Map.entry(
                new HistoryBatch.StationMinute("GL-ECH-LA-BOISSE", T0.getEpochSecond() / 60), new WindowCounts(0, 1)));
        assertThat(batch.odHours().values()).containsExactly(1L);
        assertThat(history.drain().isEmpty()).isTrue();
    }

    @Test
    void replayedEventIsNotCountedTwice() {
        processor.process(0, exit("e-1", T0, "Bellegarde Entrée"));

        assertThat(processor.process(1, exit("e-1", T0, "Bellegarde Entrée"))).isEqualTo(new Outcome.Duplicate("e-1"));
        assertThat(state.metrics("GL-ECH-LA-BOISSE", T0).last5m().exits()).isEqualTo(1);
        assertThat(od.flows(T0, Duration.ofHours(1), 1, 10)).singleElement()
                .satisfies(flow -> assertThat(flow.vehicles()).isEqualTo(1));
    }

    @Test
    void unknownStationNameIsQuarantinedNotCounted() {
        var event = new TollEvent("e-2", "Gare Inconnue", EventType.ENTRY, T0, null, null, 1, null, false);

        assertThat(processor.process(0, event)).isEqualTo(new Outcome.Quarantined(event));
        assertThat(state.stationIds()).isEmpty();
    }

    @Test
    void exitWithoutOrUnknownEntryCountsStationButNotFlow() {
        assertThat(processor.process(0, exit("e-3", T0, null)))
                .isEqualTo(new Outcome.Applied("GL-ECH-LA-BOISSE", false, OdStatus.ENTRY_MISSING));
        assertThat(processor.process(0, exit("e-4", T0, "Gare Inconnue")))
                .isEqualTo(new Outcome.Applied("GL-ECH-LA-BOISSE", false, OdStatus.ENTRY_UNKNOWN));
        assertThat(od.flows(T0, Duration.ofHours(1), 1, 10)).isEmpty();
    }

    @Test
    void lateEventBecomesHistoryCorrectionThenTooLateBeyondHorizon() {
        processor.process(0, exit("e-5", T0, null));

        assertThat(processor.process(0, exit("e-6", T0.minus(Duration.ofMinutes(30)), null)))
                .isEqualTo(new Outcome.Applied("GL-ECH-LA-BOISSE", true, OdStatus.ENTRY_MISSING));
        assertThat(processor.process(0, exit("e-7", T0.minus(Duration.ofHours(3)), null)))
                .isEqualTo(new Outcome.Rejected("e-7", RejectReason.TOO_LATE));
    }

    @Test
    void everyExitHasExactlyOneOutcomeSoOdReconcilesWithStationExits() {
        var random = new java.util.Random(42);
        var entries = new String[] {"Bellegarde Entrée", null, "Gare Inconnue"};
        for (var i = 0; i < 2_000; i++) {
            var at = T0.minusSeconds(random.nextInt(3_000));
            var type = random.nextInt(4) == 0 ? EventType.ENTRY : EventType.EXIT;
            var entry = type == EventType.EXIT ? entries[random.nextInt(entries.length)] : null;
            processor.process(0, new TollEvent("e-" + i, "La Boisse", type, at, entry, null, 1 + random.nextInt(4), null, false));
            // Doublons rejoués : ne doivent rien changer au rapprochement.
            if (random.nextInt(10) == 0) {
                processor.process(1, new TollEvent("e-" + i, "La Boisse", type, at, entry, null, 1, null, false));
            }
        }

        var window = Duration.ofHours(1);
        var coverage = od.coverage(T0, window);
        var stationExits = state.exitsBetween(OdCounters.firstMinute(T0, window), OdCounters.lastMinute(T0));

        assertThat(coverage.totalExits()).isEqualTo(stationExits).isPositive();
        assertThat(coverage.recorded()).isEqualTo(od.cells(T0, window).stream().mapToLong(OdCell::vehicles).sum());
        assertThat(coverage.entryMissing()).isPositive();
        assertThat(coverage.entryUnknown()).isPositive();
    }

    @Test
    void exitAtOpenSystemStationIsNotAnAnomaly() {
        when(resolver.resolve("Barrière Test")).thenReturn(Optional.of("GL-PV-TEST"));

        var outcome = processor.process(0,
                new TollEvent("e-pv", "Barrière Test", EventType.EXIT, T0, null, null, 3, null, false));

        assertThat(outcome).isEqualTo(new Outcome.Applied("GL-PV-TEST", false, OdStatus.OPEN_SYSTEM));
        assertThat(od.coverage(T0, Duration.ofHours(1))).isEqualTo(new OdCoverage(0, 3, 0, 0));
    }
}
