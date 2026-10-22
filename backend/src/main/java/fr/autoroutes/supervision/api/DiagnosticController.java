package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.aggregation.LiveView;
import fr.autoroutes.supervision.aggregation.OdSnapshot;
import fr.autoroutes.supervision.aggregation.WriterStats;
import fr.autoroutes.supervision.assignment.AssignmentRunner;
import fr.autoroutes.supervision.assignment.GraphDiagnostic;
import fr.autoroutes.supervision.diffusion.StreamBroadcaster;
import fr.autoroutes.supervision.ingestion.QuarantineStore;
import fr.autoroutes.supervision.referentiel.AliasService;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class DiagnosticController {

    record QuarantinedName(String stationName, long events, List<String> suggestions) {
    }

    record Diagnostic(WriterStats writer, long quarantinePending, List<QuarantinedName> quarantineTopNames,
                      String referentielVersion, String aliasVersion, int sseClients, OdSnapshot odCoverage, GraphDiagnostic graph) {
    }

    private final LiveView liveView;
    private final QuarantineStore quarantine;
    private final StationCatalog catalog;
    private final AliasService aliases;
    private final StreamBroadcaster broadcaster;
    private final ObjectProvider<AssignmentRunner> assignment;
    private final NameSuggester suggester;

    DiagnosticController(LiveView liveView, QuarantineStore quarantine, StationCatalog catalog, AliasService aliases,
                         StreamBroadcaster broadcaster, ObjectProvider<AssignmentRunner> assignment) {
        this.liveView = liveView;
        this.quarantine = quarantine;
        this.catalog = catalog;
        this.aliases = aliases;
        this.broadcaster = broadcaster;
        this.assignment = assignment;
        this.suggester = new NameSuggester(catalog);
    }

    /** Suggestions d'alias pour les noms en quarantaine : aide à la saisie, jamais appliquées automatiquement. */
    @GetMapping("/api/v1/diagnostic")
    Diagnostic diagnostic() {
        var top = quarantine.topPendingNames(20).stream()
                .map(n -> new QuarantinedName(n.stationName(), n.events(), suggester.suggest(n.stationName(), 3)))
                .toList();
        return new Diagnostic(liveView.stats().orElse(null), quarantine.countPending(), top, catalog.version(),
                aliases.currentVersion(), broadcaster.clientCount(),
                liveView.odSnapshot().map(o -> new OdSnapshot(o.reference(), o.window(), java.util.List.of(), o.coverage(), o.stationExits())).orElse(null),
                assignment.stream().findFirst().map(AssignmentRunner::diagnostic).orElse(null));
    }
}
