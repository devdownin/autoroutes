package fr.autoroutes.supervision.referentiel;

import java.time.Clock;
import java.time.format.DateTimeFormatter;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Remplacement à chaud de la table d'alias : validation complète avant bascule, ancienne table conservée en cas d'erreur. */
@Service
public class AliasService {

    private static final DateTimeFormatter VERSION_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss.SSS'Z'");

    private final StationCatalog catalog;
    private final StationResolver resolver;
    private final AliasRepository repository;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    AliasService(StationCatalog catalog, StationResolver resolver, AliasRepository repository,
                 ApplicationEventPublisher events, Clock clock) {
        this.catalog = catalog;
        this.resolver = resolver;
        this.repository = repository;
        this.events = events;
        this.clock = clock;
    }

    /** @throws IllegalArgumentException CSV invalide, alias ambigu ou gare inconnue du référentiel */
    @Transactional
    public AliasesUpdated replace(String csv) {
        var aliases = ReferentielLoader.parseAliases(csv);
        var unknown = aliases.stream().map(StationAlias::stationId).filter(id -> !catalog.contains(id)).distinct().toList();
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException("Gares absentes du référentiel : " + unknown);
        }
        var version = "upload-" + VERSION_FORMAT.format(clock.instant().atZone(java.time.ZoneOffset.UTC));
        var directory = StationDirectory.of(version, aliases);
        repository.save(version, csv);
        resolver.replace(directory);
        var updated = new AliasesUpdated(version, directory.size());
        events.publishEvent(updated);
        return updated;
    }

    public String currentVersion() {
        return resolver.version();
    }
}
