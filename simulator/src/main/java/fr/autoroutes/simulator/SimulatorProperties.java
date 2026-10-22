package fr.autoroutes.simulator;

import java.nio.file.Path;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Paramètres de simulation. Les taux d'anomalies servent à éprouver le backend :
 * doublons (déduplication), retards (politique de retard), messages invalides (rejets), noms inconnus (quarantaine).
 *
 * @param seed graine fixe pour un rejeu déterministe ; absente = aléatoire
 */
@ConfigurationProperties("simulator")
public record SimulatorProperties(
        @DefaultValue("toll-events") String topic,
        @DefaultValue("80") double rate,
        @DefaultValue("../referentiel/gares-logiques-proposition.csv") String stationsFile,
        @DefaultValue("../referentiel/alias-gares.csv") String aliasesFile,
        @DefaultValue("0.01") double duplicateRate,
        @DefaultValue("0.01") double lateRate,
        @DefaultValue("30m") Duration maxLateness,
        @DefaultValue("0.002") double invalidRate,
        @DefaultValue("0.002") double unknownNameRate,
        Long seed) {

    public Path stationsPath() {
        return Path.of(stationsFile);
    }

    public Path aliasesPath() {
        return Path.of(aliasesFile);
    }
}
