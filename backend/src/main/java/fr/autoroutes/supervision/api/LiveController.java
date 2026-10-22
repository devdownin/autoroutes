package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.aggregation.LiveView;
import fr.autoroutes.supervision.aggregation.OdCoverage;
import fr.autoroutes.supervision.aggregation.OdFilter;
import fr.autoroutes.supervision.aggregation.OdQueryService;
import fr.autoroutes.supervision.aggregation.OdResult;
import fr.autoroutes.supervision.aggregation.OdSnapshot;
import fr.autoroutes.supervision.aggregation.Snapshot;
import fr.autoroutes.supervision.aggregation.StationMetrics;
import fr.autoroutes.supervision.referentiel.LogicalStation;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import java.time.Duration;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
class LiveController {

    record StationDetail(LogicalStation station, StationMetrics metrics) {
    }

    /** Rapprochement des sorties des gares avec les issues O/D sur la fenêtre ; {@code gapRatio} doit rester nul. */
    record OdCoverageView(Instant reference, Duration window, OdCoverage coverage, long stationExits, long gap, double gapRatio,
                          Double originKnownRatio) {
    }

    private final LiveView liveView;
    private final StationCatalog catalog;
    private final OdQueryService odQueries;

    LiveController(LiveView liveView, StationCatalog catalog, OdQueryService odQueries) {
        this.liveView = liveView;
        this.catalog = catalog;
        this.odQueries = odQueries;
    }

    @GetMapping("/snapshot")
    Snapshot snapshot() {
        return liveView.snapshot().orElseThrow(LiveController::starting);
    }

    @GetMapping("/stations/{id}")
    StationDetail station(@PathVariable String id) {
        var station = catalog.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gare inconnue : " + id));
        var metrics = snapshot().stations().stream().filter(m -> m.stationId().equals(id)).findFirst().orElse(null);
        return new StationDetail(station, metrics);
    }

    /**
     * Flux O/D de la dernière fenêtre, filtrés puis seuillés (au moins 3 véhicules, imposé).
     * {@code level} STATION|DEPARTMENT ; {@code department} et {@code axis} : valeurs séparées par des virgules ;
     * {@code role} ANY|ORIGIN|DESTINATION : côté du flux auquel s'appliquent les filtres.
     */
    @GetMapping("/od")
    OdResult od(@RequestParam(defaultValue = "STATION") OdFilter.Level level,
                @RequestParam(required = false) String department,
                @RequestParam(required = false) String axis,
                @RequestParam(defaultValue = "ANY") OdFilter.Role role,
                @RequestParam(defaultValue = "3") long minVehicles,
                @RequestParam(defaultValue = "500") int limit) {
        var filter = new OdFilter(level, OdParams.csv(department), OdParams.csv(axis), role, minVehicles, limit);
        return odQueries.query(filter).orElseThrow(LiveController::starting);
    }

    @GetMapping("/od/coverage")
    OdCoverageView odCoverage() {
        OdSnapshot snapshot = liveView.odSnapshot().orElseThrow(LiveController::starting);
        return new OdCoverageView(snapshot.reference(), snapshot.window(), snapshot.coverage(), snapshot.stationExits(),
                snapshot.reconciliationGap(), snapshot.reconciliationGapRatio(), Double.isNaN(snapshot.coverage().originKnownRatio()) ? null : snapshot.coverage().originKnownRatio());
    }

    private static ResponseStatusException starting() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Démarrage en cours");
    }
}
