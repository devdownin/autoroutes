package fr.autoroutes.supervision.assignment;

import fr.autoroutes.supervision.aggregation.OdSnapshot;
import java.util.HashMap;
import java.util.Map;

/**
 * Affectation tout-ou-rien : chaque flux O/D observé est imputé en entier au chemin le plus rapide entre ses deux gares.
 * C'est une ESTIMATION, aux biais documentés (phase 2, section 5.4) : un seul itinéraire, trajets sans péage invisibles,
 * flux daté de la sortie.
 */
final class AssignmentService {

    private final RoadGraph graph;
    private final ShortestPaths paths;
    private final long minVehicles;

    AssignmentService(RoadGraph graph, ShortestPaths paths, long minVehicles) {
        this.graph = graph;
        this.paths = paths;
        this.minVehicles = Math.max(3, minVehicles);
    }

    /** Chemins en cache (borné) : indicateur d'exploitation de l'affectation. */
    int cachedPaths() {
        return paths.cacheSize();
    }

    SegmentLoads assign(OdSnapshot snapshot) {
        var perEdge = new long[graph.edges().size()];
        long routed = 0;
        long unrouted = 0;
        for (var cell : snapshot.cells()) {
            var path = paths.routable(cell.originId(), cell.destinationId()) ? paths.path(cell.originId(), cell.destinationId())
                    : ShortestPaths.UNREACHABLE;
            if (path == ShortestPaths.UNREACHABLE) {
                unrouted += cell.vehicles();
            } else {
                routed += cell.vehicles();
                for (var edge : path) {
                    perEdge[edge] += cell.vehicles();
                }
            }
        }
        // Une arête bidirectionnelle OSM existe en deux sens sous le même segmentId : les charges s'additionnent.
        var perSegment = new HashMap<String, Long>();
        for (var i = 0; i < perEdge.length; i++) {
            if (perEdge[i] > 0) {
                perSegment.merge(graph.edges().get(i).id(), perEdge[i], Long::sum);
            }
        }
        var loads = perSegment.entrySet().stream()
                .filter(e -> e.getValue() >= minVehicles)
                .sorted(Map.Entry.comparingByKey())
                .map(e -> new SegmentLoad(e.getKey(), e.getValue()))
                .toList();
        return new SegmentLoads(snapshot.reference(), snapshot.window(), graph.version(), SegmentLoads.ALGORITHM, loads, routed, unrouted);
    }
}
