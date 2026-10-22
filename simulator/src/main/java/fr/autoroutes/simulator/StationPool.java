package fr.autoroutes.simulator;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Gares simulées, pondérées par leur nombre de voies. Les trajets en système fermé suivent un modèle gravitaire :
 * probabilité d'une entrée en i pour une sortie en j ∝ voies(i) / (1 + distance(i, j) / 50 km)².
 */
public final class StationPool {

    public record Station(String id, boolean openSystem, int lanes, double lon, double lat, List<String> names) {
    }

    private static final double DECAY_KM = 50;

    private final List<Station> stations;
    private final double[] cumulativeLanes;
    private final List<Station> closed;
    private final Map<String, double[]> entryCumulative = new HashMap<>();
    private final Random random;

    StationPool(List<Station> stations, Random random) {
        this.stations = List.copyOf(stations);
        this.random = random;
        this.cumulativeLanes = cumulative(this.stations.stream().mapToDouble(Station::lanes).toArray());
        this.closed = this.stations.stream().filter(s -> !s.openSystem()).toList();
        for (var exit : closed) {
            entryCumulative.put(exit.id(), cumulative(closed.stream()
                    .mapToDouble(entry -> entry == exit ? 0 : entry.lanes() / Math.pow(1 + distanceKm(entry, exit) / DECAY_KM, 2))
                    .toArray()));
        }
    }

    public static StationPool load(Path stationsFile, Path aliasesFile, Random random) {
        var names = new HashMap<String, List<String>>();
        lines(aliasesFile).stream().skip(1).map(l -> l.split(";", -1))
                .forEach(c -> names.computeIfAbsent(c[1], id -> new ArrayList<>()).add(c[0]));
        var rows = lines(stationsFile);
        var header = Arrays.asList(rows.getFirst().split(";", -1));
        var grouped = new LinkedHashMap<String, List<String[]>>();
        rows.stream().skip(1).filter(l -> !l.isBlank()).map(l -> l.split(";", -1))
                .forEach(c -> grouped.computeIfAbsent(c[header.indexOf("gareLogiqueId")], id -> new ArrayList<>()).add(c));
        var stations = grouped.entrySet().stream().map(e -> {
            var points = e.getValue();
            return new Station(
                    e.getKey(),
                    "Bpv".equals(points.getFirst()[header.indexOf("typeGare")]),
                    points.stream().mapToInt(p -> Integer.parseInt(p[header.indexOf("nbVoies")])).sum(),
                    points.stream().mapToDouble(p -> Double.parseDouble(p[header.indexOf("lon")])).average().orElseThrow(),
                    points.stream().mapToDouble(p -> Double.parseDouble(p[header.indexOf("lat")])).average().orElseThrow(),
                    names.getOrDefault(e.getKey(), List.of(points.getFirst()[header.indexOf("nomGare")].strip())));
        }).toList();
        return new StationPool(stations, random);
    }

    public Station pickByLanes() {
        return stations.get(sample(cumulativeLanes));
    }

    /** Gare d'entrée d'un trajet sortant en {@code exit} (système fermé). */
    public Station pickEntryFor(Station exit) {
        return closed.get(sample(entryCumulative.get(exit.id())));
    }

    /** Un des noms d'alias de la gare : exerce le rapprochement par nom du backend. */
    public String nameOf(Station station) {
        return station.names().get(random.nextInt(station.names().size()));
    }

    public int size() {
        return stations.size();
    }

    private int sample(double[] cumulative) {
        var target = random.nextDouble() * cumulative[cumulative.length - 1];
        var index = Arrays.binarySearch(cumulative, target);
        return index >= 0 ? index : -index - 1;
    }

    private static double[] cumulative(double[] weights) {
        var result = new double[weights.length];
        double total = 0;
        for (var i = 0; i < weights.length; i++) {
            total += weights[i];
            result[i] = total;
        }
        return result;
    }

    static double distanceKm(Station a, Station b) {
        var lat1 = Math.toRadians(a.lat());
        var lat2 = Math.toRadians(b.lat());
        var h = Math.pow(Math.sin((lat2 - lat1) / 2), 2)
                + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(Math.toRadians(b.lon() - a.lon()) / 2), 2);
        return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
    }

    private static List<String> lines(Path file) {
        try {
            return Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Lecture impossible : " + file, e);
        }
    }
}
