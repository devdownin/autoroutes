package fr.autoroutes.supervision.referentiel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ReferentielLoaderTest {

    private static final Path STATIONS = Path.of("../referentiel/gares-logiques-proposition.csv");

    @Test
    void groupsTollPointsIntoLogicalStations() {
        var catalog = ReferentielLoader.loadStations(STATIONS);

        assertThat(catalog.size()).isEqualTo(667);
        assertThat(catalog.version()).hasSize(16);
        assertThat(catalog.stations()).extracting(LogicalStation::id).isSorted();
        var laBoisse = catalog.stations().stream().filter(s -> s.name().equals("La Boisse")).findFirst().orElseThrow();
        assertThat(laBoisse.kind()).isEqualTo(LogicalStation.Kind.PLEINE_VOIE);
        assertThat(laBoisse.department()).isEqualTo("01");
        assertThat(laBoisse.longitude()).isBetween(5.0, 5.3);
        assertThat(laBoisse.latitude()).isBetween(45.8, 45.9);
    }

    @Test
    @SuppressWarnings("unchecked")
    void exposesGeoJsonExpectedByTheFrontend() {
        var geoJson = ReferentielLoader.loadStations(STATIONS).toGeoJson();
        var features = (List<Map<String, Object>>) geoJson.get("features");
        var properties = (Map<String, Object>) features.getFirst().get("properties");

        assertThat(geoJson).containsEntry("type", "FeatureCollection");
        assertThat(features).hasSize(667);
        assertThat(properties).containsOnlyKeys("id", "name", "kind", "axes", "dept", "lanes");
    }

    @Test
    void parsesAliasesAndRejectsMalformedTables() {
        assertThat(ReferentielLoader.parseAliases("name;stationId\nNangy;GL-BPV-0003\n\n"))
                .containsExactly(new StationAlias("Nangy", "GL-BPV-0003"));
        assertThatThrownBy(() -> ReferentielLoader.parseAliases("nom;gare\nA;B")).hasMessageContaining("En-tête");
        assertThatThrownBy(() -> ReferentielLoader.parseAliases("name;stationId\nA;")).hasMessageContaining("invalide");
    }
}
