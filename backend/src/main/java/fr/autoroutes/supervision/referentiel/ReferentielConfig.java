package fr.autoroutes.supervision.referentiel;

import fr.autoroutes.supervision.SupervisionProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class ReferentielConfig {

    private static final Logger LOG = LoggerFactory.getLogger(ReferentielConfig.class);

    @Bean
    StationCatalog stationCatalog(SupervisionProperties properties) {
        var catalog = ReferentielLoader.loadStations(properties.referentiel().stationsPath());
        LOG.info("Référentiel {} chargé : {} gares logiques", catalog.version(), catalog.size());
        return catalog;
    }

    /** Dernière table d'alias importée (base) ; à défaut, celle du dépôt. */
    @Bean
    StationResolver stationResolver(SupervisionProperties properties, AliasRepository repository) {
        var directory = repository.latest()
                .map(stored -> StationDirectory.of(stored.version(), ReferentielLoader.parseAliases(stored.content())))
                .orElseGet(() -> StationDirectory.of("fichier",
                        ReferentielLoader.parseAliases(ReferentielLoader.readText(properties.referentiel().aliasesPath()))));
        LOG.info("Table d'alias {} active : {} noms", directory.version(), directory.size());
        return new StationResolver(directory);
    }
}
