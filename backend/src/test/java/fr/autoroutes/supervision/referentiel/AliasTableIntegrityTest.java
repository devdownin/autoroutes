package fr.autoroutes.supervision.referentiel;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** Garde-fou : la table d'alias versionnée dans le dépôt doit se charger sans ambiguïté. */
class AliasTableIntegrityTest {

    private static final Path ALIAS_TABLE = Path.of("../referentiel/alias-gares.csv");

    @Test
    void repositoryAliasTableLoadsWithoutConflict() throws IOException {
        var aliases = Files.readAllLines(ALIAS_TABLE, StandardCharsets.UTF_8).stream()
                .skip(1)
                .map(line -> line.split(";", -1))
                .map(cols -> new StationAlias(cols[0], cols[1]))
                .toList();

        var directory = StationDirectory.of("2025-01-01", aliases);

        assertThat(directory.size()).isGreaterThan(800);
        assertThat(directory.resolve("ABBEVILLE-EST ENTRÉE")).isPresent();
    }
}
