package fr.autoroutes.supervision.assignment;

import fr.autoroutes.supervision.referentiel.LogicalStation;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Rattachement des gares au graphe : tous les nœuds à moins de {@code radiusM} de la gare (les deux chaussées),
 * en privilégiant ceux de l'axe de la gare. Plusieurs nœuds par gare : le chemin part ou arrive du plus favorable,
 * quel que soit le sens de circulation.
 */
final class StationAttachment {

    record Unattached(String stationId, double nearestM) {
    }

    /** @param unattached gares sans nœud dans le rayon, avec la distance au plus proche (contrôle de la phase 2 : < 500 m) */
    record Report(int attached, List<Unattached> unattached, double maxAttachedM) {
    }

    private final Map<String, int[]> nodesByStation;
    private final Report report;

    StationAttachment(RoadGraph graph, List<LogicalStation> stations, double radiusM) {
        var attached = new HashMap<String, int[]>();
        var unattached = new ArrayList<Unattached>();
        var maxDistance = 0.0;
        for (var station : stations) {
            var candidates = graph.nodesWithin(station.longitude(), station.latitude(), radiusM);
            var axes = station.axes().stream().map(RoadGraph::normalizeAxis).collect(Collectors.toSet());
            var onAxis = candidates.stream().filter(node -> graph.refsOf(node).stream().anyMatch(axes::contains)).toList();
            var chosen = onAxis.isEmpty() ? candidates : onAxis;
            if (chosen.isEmpty()) {
                unattached.add(new Unattached(station.id(), graph.nearestDistanceM(station.longitude(), station.latitude())));
            } else {
                attached.put(station.id(), chosen.stream().mapToInt(Integer::intValue).toArray());
                maxDistance = Math.max(maxDistance, chosen.stream()
                        .mapToDouble(node -> graph.distanceM(node, station.longitude(), station.latitude())).min().orElse(0));
            }
        }
        this.nodesByStation = Map.copyOf(attached);
        this.report = new Report(attached.size(), List.copyOf(unattached), maxDistance);
    }

    int[] nodes(String stationId) {
        return nodesByStation.get(stationId);
    }

    Report report() {
        return report;
    }
}
