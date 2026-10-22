package fr.autoroutes.supervision.assignment;

import static org.assertj.core.api.Assertions.assertThat;

import fr.autoroutes.supervision.aggregation.OdCell;
import fr.autoroutes.supervision.aggregation.OdCoverage;
import fr.autoroutes.supervision.aggregation.OdSnapshot;
import fr.autoroutes.supervision.referentiel.LogicalStation;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class AssignmentServiceTest {

    private static final Instant T0 = Instant.parse("2026-10-22T08:00:00Z");

    /**
     * Axe A7 orienté 0 → 1 → 2 → 3 (une chaussée), avec un contournement 1 → 4 → 2 plus long mais plus rapide
     * (130 km/h contre 50 km/h sur le tronçon direct) : le plus court en TEMPS passe par le contournement.
     */
    private static RoadGraph graph() {
        var longitude = new double[] {5.00, 5.02, 5.04, 5.06, 5.03};
        var latitude = new double[] {45.0, 45.0, 45.0, 45.0, 45.01};
        return new RoadGraph("graph-test", longitude, latitude, List.of(
                new RoadGraph.Edge("e01", 0, 1, 1_570, 130, Set.of("A7"), false),
                new RoadGraph.Edge("e12", 1, 2, 1_570, 50, Set.of("A7"), false),
                new RoadGraph.Edge("e23", 2, 3, 1_570, 130, Set.of("A7"), false),
                new RoadGraph.Edge("e14", 1, 4, 1_400, 130, Set.of(), true),
                new RoadGraph.Edge("e42", 4, 2, 1_400, 130, Set.of(), true)));
    }

    private static LogicalStation station(String id, String axis, double lon, double lat) {
        return new LogicalStation(id, id, LogicalStation.Kind.ECHANGEUR, List.of(axis), "38", 2, lon, lat);
    }

    private final List<LogicalStation> stations = List.of(
            station("S0", "A0007", 5.0003, 45.0), station("S1", "A0007", 5.02, 45.0003), station("S3", "A0007", 5.06, 45.0),
            station("FAR", "A0007", 6.5, 46.0));

    private AssignmentService service(long minVehicles) {
        var graph = graph();
        return new AssignmentService(graph, new ShortestPaths(graph, new StationAttachment(graph, stations, 500), 100), minVehicles);
    }

    private static OdSnapshot snapshot(OdCell... cells) {
        return new OdSnapshot(T0, Duration.ofHours(1), List.of(cells), OdCoverage.EMPTY, 0);
    }

    @Test
    void assignsEachFlowToTheFastestPathNotTheShortest() {
        var loads = service(3).assign(snapshot(new OdCell("S0", "S3", 5)));

        assertThat(loads.loads()).extracting(SegmentLoad::segmentId).containsExactly("e01", "e14", "e23", "e42");
        assertThat(loads.loads()).allSatisfy(load -> assertThat(load.vehicles()).isEqualTo(5));
        assertThat(loads.routedVehicles()).isEqualTo(5);
        assertThat(loads.algorithm()).isEqualTo("all-or-nothing-fastest-v1");
        assertThat(loads.graphVersion()).isEqualTo("graph-test");
    }

    @Test
    void sumsFlowsSharingASegmentAndHidesSegmentsBelowTheFloor() {
        var loads = service(0).assign(snapshot(new OdCell("S0", "S3", 2), new OdCell("S0", "S1", 2), new OdCell("S1", "S3", 1)));

        // e01 : 2 + 2 = 4 (publié) ; e14, e42, e23 : 2 + 1 = 3 (publié, égal au seuil) ; aucun tronçon à 1 ou 2 véhicules.
        assertThat(loads.loads()).extracting(SegmentLoad::segmentId, SegmentLoad::vehicles)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("e01", 4L), org.assertj.core.groups.Tuple.tuple("e14", 3L),
                        org.assertj.core.groups.Tuple.tuple("e23", 3L), org.assertj.core.groups.Tuple.tuple("e42", 3L));
        assertThat(service(0).assign(snapshot(new OdCell("S0", "S3", 2))).loads()).isEmpty();
    }

    @Test
    void flowsAgainstTheCarriagewayDirectionOrFromUnattachedStationsAreNotRouted() {
        var loads = service(3).assign(snapshot(new OdCell("S3", "S0", 7), new OdCell("FAR", "S0", 4), new OdCell("S0", "S3", 5)));

        assertThat(loads.routedVehicles()).isEqualTo(5);
        assertThat(loads.unroutedVehicles()).isEqualTo(11);
        assertThat(loads.routedRatio()).isEqualTo(5.0 / 16);
    }

    @Test
    void reportsStationsMoreThanTheRadiusFromTheGraph() {
        var graph = graph();
        var report = new StationAttachment(graph, stations, 500).report();

        assertThat(report.attached()).isEqualTo(3);
        assertThat(report.unattached()).singleElement().satisfies(u -> {
            assertThat(u.stationId()).isEqualTo("FAR");
            assertThat(u.nearestM()).isGreaterThan(100_000);
        });
    }

    @Test
    void axisCodesFromTheReferentialMatchOsmReferences() {
        assertThat(RoadGraph.normalizeAxis("A0007")).isEqualTo("A7");
        assertThat(RoadGraph.normalizeAxis("A0016")).isEqualTo("A16");
        assertThat(RoadGraph.normalizeAxis("A7")).isEqualTo("A7");
    }
}
