package fr.autoroutes.supervision.assignment;

import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;

/**
 * Plus courts chemins en temps (longueur / vitesse maximale) entre gares, avec un cache LRU des chemins par couple.
 * Un seul thread l'utilise (le planificateur de l'affectation).
 */
final class ShortestPaths {

    /** Marqueur de couple sans chemin : évite de refaire une recherche qui échouera encore. */
    static final int[] UNREACHABLE = new int[0];

    private record Entry(int node, double seconds) {
    }

    private record Pair(String origin, String destination) {
    }

    private final RoadGraph graph;
    private final StationAttachment attachment;
    private final Map<Pair, int[]> cache;

    ShortestPaths(RoadGraph graph, StationAttachment attachment, int cacheSize) {
        this.graph = graph;
        this.attachment = attachment;
        this.cache = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<Pair, int[]> eldest) {
                return size() > cacheSize;
            }
        };
    }

    /** Indices des arêtes du chemin le plus rapide (tableau vide si origine et destination se touchent) ; {@link #UNREACHABLE} (comparer par identité) sans chemin. */
    int[] path(String origin, String destination) {
        return cache.computeIfAbsent(new Pair(origin, destination), pair -> search(pair.origin(), pair.destination()));
    }

    int cacheSize() {
        return cache.size();
    }

    /** Vrai si les deux gares sont rattachées au graphe (sinon aucun chemin n'est cherché). */
    boolean routable(String origin, String destination) {
        return attachment.nodes(origin) != null && attachment.nodes(destination) != null;
    }

    private int[] search(String origin, String destination) {
        var sources = attachment.nodes(origin);
        var targets = attachment.nodes(destination);
        if (sources == null || targets == null) {
            return UNREACHABLE;
        }
        var goal = Set.copyOf(Arrays.stream(targets).boxed().toList());
        var distance = new double[graph.nodeCount()];
        var previousEdge = new int[graph.nodeCount()];
        Arrays.fill(distance, Double.POSITIVE_INFINITY);
        Arrays.fill(previousEdge, -1);
        var queue = new PriorityQueue<Entry>((a, b) -> Double.compare(a.seconds(), b.seconds()));
        for (var source : sources) {
            distance[source] = 0;
            queue.add(new Entry(source, 0));
        }
        var settled = new HashMap<Integer, Boolean>();
        while (!queue.isEmpty()) {
            var current = queue.poll();
            if (current.seconds() > distance[current.node()] || settled.put(current.node(), true) != null) {
                continue;
            }
            if (goal.contains(current.node())) {
                return unwind(current.node(), previousEdge);
            }
            for (var edgeIndex : graph.outgoing(current.node())) {
                var edge = graph.edges().get(edgeIndex);
                var candidate = current.seconds() + edge.seconds();
                if (candidate < distance[edge.to()]) {
                    distance[edge.to()] = candidate;
                    previousEdge[edge.to()] = edgeIndex;
                    queue.add(new Entry(edge.to(), candidate));
                }
            }
        }
        return UNREACHABLE;
    }

    private int[] unwind(int end, int[] previousEdge) {
        var path = new java.util.ArrayList<Integer>();
        for (var edgeIndex = previousEdge[end]; edgeIndex >= 0; edgeIndex = previousEdge[graph.edges().get(edgeIndex).from()]) {
            path.add(edgeIndex);
        }
        java.util.Collections.reverse(path);
        return path.stream().mapToInt(Integer::intValue).toArray();
    }
}
