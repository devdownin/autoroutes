package fr.autoroutes.supervision.referentiel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class StationDirectoryTest {

    @Test
    void resolvesIgnoringCaseAccentsPunctuationAndSurroundingWhitespace() {
        var directory = StationDirectory.of("2025-01-01", List.of(
                new StationAlias("\tGondreville la Franche", "GL-ECH-0001"),
                new StationAlias("Pont-Colbert BPV", "GL-BPV-0002")));

        assertThat(directory.resolve("GONDREVILLE  LA FRANCHE")).contains("GL-ECH-0001");
        assertThat(directory.resolve("pont colbert bpv")).contains("GL-BPV-0002");
        assertThat(directory.resolve("Château-Thierry")).isEmpty();
    }

    @Test
    void acceptsSeveralAliasesForTheSameStation() {
        var directory = StationDirectory.of("v1", List.of(
                new StationAlias("Bellegarde Entrée", "GL-ECH-0010"),
                new StationAlias("Bellegarde Sortie", "GL-ECH-0010"),
                new StationAlias("Bellegarde", "GL-ECH-0010")));

        assertThat(directory.resolve("bellegarde entree")).contains("GL-ECH-0010");
        assertThat(directory.size()).isEqualTo(3);
    }

    @Test
    void rejectsAnAliasPointingToTwoStations() {
        var aliases = List.of(
                new StationAlias("Saint-Germain", "GL-ECH-0100"),
                new StationAlias("saint germain", "GL-BPV-0200"));

        assertThatThrownBy(() -> StationDirectory.of("v1", aliases))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("saint germain");
    }

    @Test
    void resolverSwapsDirectoryAtomically() {
        var resolver = new StationResolver(StationDirectory.of("v1", List.of()));
        resolver.replace(StationDirectory.of("v2", List.of(new StationAlias("Nangy", "GL-BPV-0003"))));

        assertThat(resolver.version()).isEqualTo("v2");
        assertThat(resolver.resolve("Nangy")).contains("GL-BPV-0003");
    }
}
