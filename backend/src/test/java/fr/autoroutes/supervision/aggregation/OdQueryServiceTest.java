package fr.autoroutes.supervision.aggregation;

import static org.assertj.core.api.Assertions.assertThat;

import fr.autoroutes.supervision.aggregation.OdFilter.Level;
import fr.autoroutes.supervision.aggregation.OdFilter.Role;
import fr.autoroutes.supervision.referentiel.LogicalStation;
import fr.autoroutes.supervision.referentiel.LogicalStation.Kind;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class OdQueryServiceTest {

    private static final Instant T0 = Instant.parse("2026-10-22T08:00:00Z");

    private static LogicalStation station(String id, String department, String axis, double lon, double lat) {
        return new LogicalStation(id, id, Kind.ECHANGEUR, List.of(axis), department, 4, lon, lat);
    }

    private final StationCatalog catalog = new StationCatalog("test", List.of(
            station("A", "69", "A6", 4.0, 45.0),
            station("B", "69", "A7", 5.0, 46.0),
            station("C", "13", "A7", 5.0, 43.0),
            station("D", "75", "A1", 2.0, 48.0)));

    private final OdQueryService service = new OdQueryService(new LiveView(), catalog);

    private OdSnapshot snapshot(OdCell... cells) {
        return new OdSnapshot(T0, Duration.ofHours(1), List.of(cells), OdCoverage.EMPTY, 0);
    }

    private static OdFilter filter(Level level, Set<String> departments, Set<String> axes, Role role) {
        return new OdFilter(level, departments, axes, role, 3, 100);
    }

    @Test
    void thresholdAppliesAfterAggregationAndMaskedFlowsAreOnlyCounted() {
        // A→C et B→C : 2 véhicules chacun (masqués par station) mais 4 une fois agrégés au département 69 → 13.
        var snapshot = snapshot(new OdCell("A", "C", 2), new OdCell("B", "C", 2), new OdCell("A", "D", 9), new OdCell("D", "A", 1));

        var stations = service.query(snapshot, filter(Level.STATION, Set.of(), Set.of(), Role.ANY));
        var departments = service.query(snapshot, filter(Level.DEPARTMENT, Set.of(), Set.of(), Role.ANY));

        assertThat(stations.flows()).containsExactly(new OdFlow("A", "D", 9));
        assertThat(stations.masked()).isEqualTo(new OdResult.Masked(3, 5));
        assertThat(stations.totalVehicles()).isEqualTo(14);
        assertThat(departments.flows()).containsExactly(new OdFlow("69", "75", 9), new OdFlow("69", "13", 4));
        assertThat(departments.masked()).isEqualTo(new OdResult.Masked(1, 1));
        assertThat(departments.nodes()).extracting(OdResult.OdNode::id).containsExactly("13", "69", "75");
        assertThat(departments.nodes().get(1).latitude()).isEqualTo(45.5);
    }

    @Test
    void neverPublishesBelowFloorEvenIfAskedLower() {
        var result = service.query(snapshot(new OdCell("A", "D", 2)), new OdFilter(Level.STATION, Set.of(), Set.of(), Role.ANY, 0, 100));

        assertThat(result.minVehicles()).isEqualTo(3);
        assertThat(result.flows()).isEmpty();
    }

    @Test
    void filtersByDepartmentAndAxisOnTheChosenSide() {
        var snapshot = snapshot(new OdCell("A", "C", 5), new OdCell("C", "D", 6), new OdCell("D", "B", 7));

        assertThat(service.query(snapshot, filter(Level.STATION, Set.of("13"), Set.of(), Role.ORIGIN)).flows())
                .containsExactly(new OdFlow("C", "D", 6));
        assertThat(service.query(snapshot, filter(Level.STATION, Set.of("13"), Set.of(), Role.DESTINATION)).flows())
                .containsExactly(new OdFlow("A", "C", 5));
        assertThat(service.query(snapshot, filter(Level.STATION, Set.of("13"), Set.of(), Role.ANY)).flows())
                .containsExactly(new OdFlow("C", "D", 6), new OdFlow("A", "C", 5));
        assertThat(service.query(snapshot, filter(Level.STATION, Set.of(), Set.of("A1"), Role.ANY)).flows())
                .containsExactly(new OdFlow("D", "B", 7), new OdFlow("C", "D", 6));
    }

    @Test
    void marksTruncationWhenLimitCutsDiffusableFlows() {
        var result = service.query(snapshot(new OdCell("A", "C", 5), new OdCell("C", "D", 6), new OdCell("D", "B", 7)),
                new OdFilter(Level.STATION, Set.of(), Set.of(), Role.ANY, 3, 2));

        assertThat(result.flows()).hasSize(2);
        assertThat(result.truncated()).isTrue();
    }

    @Test
    void ignoresCellsWhoseStationLeftTheCatalog() {
        var result = service.query(snapshot(new OdCell("ZZ", "A", 50), new OdCell("A", "D", 4)), filter(Level.STATION, Set.of(), Set.of(), Role.ANY));

        assertThat(result.flows()).containsExactly(new OdFlow("A", "D", 4));
    }
}
