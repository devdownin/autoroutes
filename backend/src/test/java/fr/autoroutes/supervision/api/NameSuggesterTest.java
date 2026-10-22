package fr.autoroutes.supervision.api;

import static org.assertj.core.api.Assertions.assertThat;

import fr.autoroutes.supervision.referentiel.LogicalStation;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import java.util.List;
import org.junit.jupiter.api.Test;

class NameSuggesterTest {

    private static LogicalStation station(String id, String name) {
        return new LogicalStation(id, name, LogicalStation.Kind.ECHANGEUR, List.of("A0042"), "01", 4, 5.0, 45.0);
    }

    @Test
    void computesEditDistance() {
        assertThat(NameSuggester.levenshtein("kitten", "sitting")).isEqualTo(3);
        assertThat(NameSuggester.levenshtein("", "abc")).isEqualTo(3);
    }

    @Test
    void suggestsClosestStationsIgnoringAccentsAndCase() {
        var suggester = new NameSuggester(new StationCatalog("v1", List.of(
                station("GL-1", "Bellegarde"), station("GL-2", "Beaupont"), station("GL-3", "Château-Thierry"))));

        assertThat(suggester.suggest("CHATEAU THIERRI", 1)).containsExactly("Château-Thierry (GL-3)");
        assertThat(suggester.suggest("Belegarde", 2)).first().isEqualTo("Bellegarde (GL-1)");
    }
}
