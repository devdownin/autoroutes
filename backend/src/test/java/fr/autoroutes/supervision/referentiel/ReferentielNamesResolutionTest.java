package fr.autoroutes.supervision.referentiel;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

/**
 * Q14 : les événements Kafka portent les noms de gare du référentiel gares-peage-2025.csv.
 * Chacun de ces noms doit donc être résolu par la table d'alias, sans passer par la quarantaine.
 */
class ReferentielNamesResolutionTest {

    @Test
    void everyStationNameOfTheSourceReferentielResolves() throws IOException {
        var lines = Files.readAllLines(Path.of("../gares-peage-2025.csv"), StandardCharsets.UTF_8);
        var nameColumn = Arrays.asList(lines.getFirst().split(";", -1)).indexOf("nomGare");
        var names = lines.stream().skip(1).filter(l -> !l.isBlank()).map(l -> l.split(";", -1)[nameColumn]).distinct().toList();
        var aliases = ReferentielLoader.parseAliases(ReferentielLoader.readText(Path.of("../referentiel/alias-gares.csv")));
        var directory = StationDirectory.of("fichier", aliases);
        var catalog = ReferentielLoader.loadStations(Path.of("../referentiel/gares-logiques-proposition.csv"));

        var unresolved = names.stream().filter(n -> directory.resolve(n).isEmpty()).toList();
        var unknownStations = names.stream().map(directory::resolve).flatMap(java.util.Optional::stream)
                .filter(id -> !catalog.contains(id)).distinct().toList();

        assertThat(names).hasSize(813);
        assertThat(unresolved).isEmpty();
        assertThat(unknownStations).isEmpty();
    }
}
