package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.referentiel.LogicalStation;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** Lecture filtrée, agrégée puis seuillée du dernier instantané O/D publié par l'écrivain. */
@Service
public class OdQueryService {

    private record Pair(String origin, String destination) {
    }

    private final LiveView liveView;
    private final StationCatalog catalog;

    public OdQueryService(LiveView liveView, StationCatalog catalog) {
        this.liveView = liveView;
        this.catalog = catalog;
    }

    /**
     * Gares à lire dans la source (superset du filtre exact) : le département prime sur l'axe, car le filtre exact exige les deux.
     * Vide = aucune restriction.
     */
    public Optional<Set<String>> candidateStations(OdFilter filter) {
        if (!filter.departments().isEmpty()) {
            return Optional.of(catalog.stations().stream().filter(s -> filter.departments().contains(department(s)))
                    .map(LogicalStation::id).collect(Collectors.toSet()));
        }
        if (!filter.axes().isEmpty()) {
            return Optional.of(catalog.stations().stream().filter(s -> s.axes().stream().anyMatch(filter.axes()::contains))
                    .map(LogicalStation::id).collect(Collectors.toSet()));
        }
        return Optional.empty();
    }

    public Optional<OdResult> query(OdFilter filter) {
        return liveView.odSnapshot().map(snapshot -> query(snapshot, filter));
    }

    public OdResult query(OdSnapshot snapshot, OdFilter filter) {
        var totals = new HashMap<Pair, Long>();
        for (var cell : snapshot.cells()) {
            var origin = catalog.find(cell.originId());
            var destination = catalog.find(cell.destinationId());
            if (origin.isPresent() && destination.isPresent() && matches(origin.get(), destination.get(), filter)) {
                var pair = filter.level() == OdFilter.Level.DEPARTMENT
                        ? new Pair(department(origin.get()), department(destination.get()))
                        : new Pair(cell.originId(), cell.destinationId());
                totals.merge(pair, cell.vehicles(), Long::sum);
            }
        }
        var total = totals.values().stream().mapToLong(Long::longValue).sum();
        var diffusable = totals.entrySet().stream()
                .filter(e -> e.getValue() >= filter.minVehicles())
                .sorted(Map.Entry.<Pair, Long>comparingByValue().reversed()
                        .thenComparing(e -> e.getKey().origin()).thenComparing(e -> e.getKey().destination()))
                .toList();
        var shown = diffusable.stream().limit(filter.limit()).toList();
        var maskedCells = totals.size() - diffusable.size();
        var maskedVehicles = totals.values().stream().filter(v -> v < filter.minVehicles()).mapToLong(Long::longValue).sum();
        var flows = shown.stream().map(e -> new OdFlow(e.getKey().origin(), e.getKey().destination(), e.getValue())).toList();
        return new OdResult(snapshot.reference(), snapshot.window(), filter.level(), filter.minVehicles(), flows, nodes(flows, filter.level()),
                new OdResult.Masked(maskedCells, maskedVehicles), total, diffusable.size() > shown.size(), snapshot.coverage());
    }

    private static String department(LogicalStation station) {
        return station.department() == null || station.department().isBlank() ? "NC" : station.department();
    }

    private static boolean matches(LogicalStation origin, LogicalStation destination, OdFilter filter) {
        return side(origin, destination, filter.role(), s -> filter.departments().isEmpty() || filter.departments().contains(department(s)))
                && side(origin, destination, filter.role(), s -> filter.axes().isEmpty() || s.axes().stream().anyMatch(filter.axes()::contains));
    }

    private static boolean side(LogicalStation origin, LogicalStation destination, OdFilter.Role role,
                                java.util.function.Predicate<LogicalStation> test) {
        return switch (role) {
            case ORIGIN -> test.test(origin);
            case DESTINATION -> test.test(destination);
            case ANY -> test.test(origin) || test.test(destination);
        };
    }

    private List<OdResult.OdNode> nodes(List<OdFlow> flows, OdFilter.Level level) {
        var ids = flows.stream().flatMap(f -> java.util.stream.Stream.of(f.originId(), f.destinationId()))
                .collect(Collectors.toCollection(java.util.TreeSet::new));
        if (level == OdFilter.Level.STATION) {
            return ids.stream().flatMap(id -> catalog.find(id).stream())
                    .map(s -> new OdResult.OdNode(s.id(), s.name(), s.longitude(), s.latitude())).toList();
        }
        var byDepartment = catalog.stations().stream()
                .filter(s -> ids.contains(s.department()))
                .collect(Collectors.groupingBy(LogicalStation::department, LinkedHashMap::new, Collectors.toList()));
        return byDepartment.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(Comparator.naturalOrder()))
                .map(e -> new OdResult.OdNode(e.getKey(), "Département " + e.getKey(),
                        e.getValue().stream().mapToDouble(LogicalStation::longitude).average().orElse(0),
                        e.getValue().stream().mapToDouble(LogicalStation::latitude).average().orElse(0)))
                .toList();
    }
}
