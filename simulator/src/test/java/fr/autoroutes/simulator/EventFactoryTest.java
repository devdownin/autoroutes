package fr.autoroutes.simulator;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Random;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class EventFactoryTest {

    private static final Instant NOW = Instant.parse("2026-10-22T08:00:00Z");
    private final JsonMapper json = JsonMapper.builder().build();

    private static StationPool pool(Random random) {
        return new StationPool(List.of(
                new StationPool.Station("GL-ECH-1", false, 6, 4.80, 45.70, List.of("Lyon Nord")),
                new StationPool.Station("GL-ECH-2", false, 4, 4.90, 45.75, List.of("Lyon Est Entrée", "Lyon Est Sortie")),
                new StationPool.Station("GL-BPV-3", true, 10, 5.10, 45.80, List.of("Barrière Test"))), random);
    }

    private static SimulatorProperties properties(double duplicate, double late, double invalid, double unknown) {
        return new SimulatorProperties("toll-events", 80, "s", "a", duplicate, late, Duration.ofMinutes(30), invalid, unknown, 42L);
    }

    private EventFactory factory(SimulatorProperties properties) {
        var random = new Random(42);
        return new EventFactory(pool(random), random, Clock.fixed(NOW, ZoneOffset.UTC), json, properties);
    }

    private List<JsonNode> generate(EventFactory factory, int count) {
        return IntStream.range(0, count).mapToObj(i -> json.readTree(factory.next().payload())).toList();
    }

    @Test
    void producesSimulatedEventsFollowingTheContract() {
        var events = generate(factory(properties(0, 0, 0, 0)), 500);

        assertThat(events).allSatisfy(e -> {
            assertThat(e.path("simulated").asBoolean()).isTrue();
            assertThat(e.path("eventId").asString()).isNotBlank();
            assertThat(e.path("eventTime").asString()).isEqualTo(NOW.toString());
            assertThat(e.path("type").asString()).isIn("ENTRY", "EXIT");
        });
        assertThat(events).extracting(e -> e.path("eventId").asString()).doesNotHaveDuplicates();
    }

    @Test
    void openSystemExitsNeverCarryAnEntryStationAndClosedExitsAlwaysDo() {
        var events = generate(factory(properties(0, 0, 0, 0)), 1_000);

        var open = events.stream().filter(e -> e.path("stationName").asString().equals("Barrière Test")).toList();
        var closedExits = events.stream()
                .filter(e -> !e.path("stationName").asString().equals("Barrière Test") && e.path("type").asString().equals("EXIT"))
                .toList();
        assertThat(open).isNotEmpty().allSatisfy(e -> {
            assertThat(e.path("type").asString()).isEqualTo("EXIT");
            assertThat(e.has("entryStationName")).isFalse();
        });
        assertThat(closedExits).isNotEmpty().allSatisfy(e -> {
            assertThat(e.path("entryStationName").asString()).isNotBlank().isNotEqualTo("Barrière Test");
        });
    }

    @Test
    void injectsConfiguredAnomalies() {
        var factory = factory(properties(0.05, 0.05, 0.05, 0.05));
        var records = IntStream.range(0, 4_000).mapToObj(i -> factory.next()).toList();

        var invalid = records.stream().filter(r -> !r.payload().endsWith("}")).count();
        var valid = records.stream().filter(r -> r.payload().endsWith("}")).map(r -> json.readTree(r.payload())).toList();
        var duplicates = valid.size() - valid.stream().map(e -> e.path("eventId").asString()).distinct().count();
        var late = valid.stream().filter(e -> Instant.parse(e.path("eventTime").asString()).isBefore(NOW)).count();
        var unknown = valid.stream().filter(e -> e.path("stationName").asString().startsWith("Gare simulée inconnue")).count();

        assertThat(invalid).isBetween(120L, 280L);
        assertThat(duplicates).isBetween(120L, 280L);
        assertThat(late).isPositive();
        assertThat(unknown).isPositive();
    }

    @Test
    void gravityModelFavoursNearbyLargeStations() {
        var random = new Random(7);
        var pool = pool(random);
        var exit = new StationPool.Station("GL-ECH-2", false, 4, 4.90, 45.75, List.of("x"));

        assertThat(IntStream.range(0, 200).mapToObj(i -> pool.pickEntryFor(exit).id()).distinct()).containsExactly("GL-ECH-1");
        assertThat(StationPool.distanceKm(exit, exit)).isZero();
    }
}
