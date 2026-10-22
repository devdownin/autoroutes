package fr.autoroutes.supervision.assignment;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Graphe routier orienté (OSM {@code motorway} et {@code motorway_link}) produit par la chaîne cartographique.
 * Immuable après construction ; les tableaux sont indexés par nœud ou par arête.
 */
public final class RoadGraph {

    public record Edge(String id, int from, int to, double lengthM, int speedKmh, Set<String> refs, boolean link) {

        /** Temps de parcours à la vitesse maximale, en secondes. */
        public double seconds() {
            return lengthM / (speedKmh / 3.6);
        }
    }

    private static final double EARTH_RADIUS_M = 6_371_000;
    /** Côté d'une case de la grille spatiale, en degrés (≈ 1 km) : un rayon de 500 m reste dans les 9 cases voisines. */
    private static final double CELL_DEGREES = 0.01;

    private final String version;
    private final double[] longitude;
    private final double[] latitude;
    private final List<Edge> edges;
    private final int[][] outgoing;
    private final List<Set<String>> nodeRefs;
    private final Map<Long, List<Integer>> grid = new HashMap<>();

    public RoadGraph(String version, double[] longitude, double[] latitude, List<Edge> edges) {
        this.version = version;
        this.longitude = longitude.clone();
        this.latitude = latitude.clone();
        this.edges = List.copyOf(edges);
        var out = new ArrayList<List<Integer>>();
        var refs = new ArrayList<Set<String>>();
        for (var node = 0; node < longitude.length; node++) {
            out.add(new ArrayList<>());
            refs.add(new TreeSet<>());
            grid.computeIfAbsent(cell(longitude[node], latitude[node]), c -> new ArrayList<>()).add(node);
        }
        for (var index = 0; index < this.edges.size(); index++) {
            var edge = this.edges.get(index);
            out.get(edge.from()).add(index);
            refs.get(edge.from()).addAll(edge.refs());
            refs.get(edge.to()).addAll(edge.refs());
        }
        this.outgoing = out.stream().map(list -> list.stream().mapToInt(Integer::intValue).toArray()).toArray(int[][]::new);
        this.nodeRefs = List.copyOf(refs);
    }

    public String version() {
        return version;
    }

    public int nodeCount() {
        return longitude.length;
    }

    public List<Edge> edges() {
        return edges;
    }

    public int[] outgoing(int node) {
        return outgoing[node];
    }

    public Set<String> refsOf(int node) {
        return nodeRefs.get(node);
    }

    public double distanceM(int node, double lon, double lat) {
        return haversine(longitude[node], latitude[node], lon, lat);
    }

    /** Nœuds à au plus {@code radiusM} d'un point, de proche en proche (rayon ≤ 1 km). */
    public List<Integer> nodesWithin(double lon, double lat, double radiusM) {
        var found = new ArrayList<Integer>();
        var cx = (int) Math.floor(lon / CELL_DEGREES);
        var cy = (int) Math.floor(lat / CELL_DEGREES);
        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                for (var node : grid.getOrDefault(key(cx + dx, cy + dy), List.of())) {
                    if (distanceM(node, lon, lat) <= radiusM) {
                        found.add(node);
                    }
                }
            }
        }
        return found;
    }

    /** Distance au nœud le plus proche (parcours complet : appelé seulement pour documenter un rattachement raté). */
    public double nearestDistanceM(double lon, double lat) {
        var best = Double.POSITIVE_INFINITY;
        for (var node = 0; node < longitude.length; node++) {
            best = Math.min(best, distanceM(node, lon, lat));
        }
        return best;
    }

    /** « A0007 » (référentiel) et « A7 » (OSM) désignent le même axe. */
    public static String normalizeAxis(String axis) {
        var digits = axis.replaceAll("^\\D*0*", "");
        return digits.isEmpty() ? axis : "A" + digits.replaceAll("\\D.*$", "");
    }

    static double haversine(double lon1, double lat1, double lon2, double lat2) {
        var p1 = Math.toRadians(lat1);
        var p2 = Math.toRadians(lat2);
        var a = Math.pow(Math.sin((p2 - p1) / 2), 2)
                + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(Math.toRadians(lon2 - lon1) / 2), 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
    }

    private static long cell(double lon, double lat) {
        return key((int) Math.floor(lon / CELL_DEGREES), (int) Math.floor(lat / CELL_DEGREES));
    }

    private static long key(int x, int y) {
        return ((long) x << 32) ^ (y & 0xffffffffL);
    }
}
