package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.aggregation.OdCoverage;
import fr.autoroutes.supervision.aggregation.OdFilter;
import fr.autoroutes.supervision.aggregation.OdQueryService;
import fr.autoroutes.supervision.aggregation.OdResult;
import fr.autoroutes.supervision.aggregation.OdSnapshot;
import fr.autoroutes.supervision.history.HistoryQueries;
import fr.autoroutes.supervision.history.Resolution;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Historique OBSERVÉ : séries par gare et réseau, minutes pour la relecture, cumuls, flux O/D. Instants ISO-8601. */
@RestController
@RequestMapping("/api/v1")
class HistoryController {

    record StationSeries(String stationId, Resolution step, List<HistoryQueries.Point> points) {
    }

    record NetworkSeries(Resolution step, List<HistoryQueries.Point> points) {
    }

    record OdHistory(Instant from, Instant to, String nature, OdResult result) {
    }

    private final HistoryQueries history;
    private final StationCatalog catalog;
    private final OdQueryService odQueries;

    HistoryController(HistoryQueries history, StationCatalog catalog, OdQueryService odQueries) {
        this.history = history;
        this.catalog = catalog;
        this.odQueries = odQueries;
    }

    @GetMapping("/stations/{id}/history")
    StationSeries station(@PathVariable String id,
                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                          @RequestParam(defaultValue = "PT15M") Resolution step) {
        if (!catalog.contains(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Gare inconnue : " + id);
        }
        return new StationSeries(id, step, history.stationSeries(id, from, to, step));
    }

    @GetMapping("/history/network")
    NetworkSeries network(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                          @RequestParam(defaultValue = "PT1H") Resolution step) {
        return new NetworkSeries(step, history.networkSeries(from, to, step));
    }

    @GetMapping("/history/minutes")
    List<HistoryQueries.MinuteRow> minutes(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                                           @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return history.minutes(from, to);
    }

    @GetMapping("/history/totals")
    List<HistoryQueries.StationTotal> totals(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                                             @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return history.totals(from, to);
    }

    /** Mêmes niveaux, filtres et seuil (au moins 3 véhicules, après agrégation) que le temps réel ({@code /api/v1/od}). */
    @GetMapping("/history/od")
    OdHistory od(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                 @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                 @RequestParam(defaultValue = "STATION") OdFilter.Level level,
                 @RequestParam(required = false) String department,
                 @RequestParam(required = false) String axis,
                 @RequestParam(defaultValue = "ANY") OdFilter.Role role,
                 @RequestParam(defaultValue = "3") long minVehicles,
                 @RequestParam(defaultValue = "500") int limit) {
        var filter = new OdFilter(level, OdParams.csv(department), OdParams.csv(axis), role, minVehicles, limit);
        var stations = odQueries.candidateStations(filter).orElse(null);
        var cells = history.odCells(from, to, HistoryQueries.Side.valueOf(role.name()), stations);
        var snapshot = new OdSnapshot(to, Duration.between(from, to), cells, OdCoverage.EMPTY, 0);
        return new OdHistory(from, to, "OBSERVED", odQueries.query(snapshot, filter));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail invalidRange(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}
