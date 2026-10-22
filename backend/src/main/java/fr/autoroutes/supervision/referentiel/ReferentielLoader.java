package fr.autoroutes.supervision.referentiel;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.TreeSet;

/**
 * Lecture des fichiers produits par scripts/analyse_referentiel.py.
 * Coordonnées déjà reprojetées en WGS84 ; une gare logique = centroïde de ses points de péage.
 */
public final class ReferentielLoader {

    private static final String SEPARATOR = ";";

    private ReferentielLoader() {
    }

    public static StationCatalog loadStations(Path file) {
        var lines = readLines(file);
        var header = List.of(lines.getFirst().split(SEPARATOR, -1));
        var col = new ColumnIndex(header);
        var points = new LinkedHashMap<String, List<String[]>>();
        for (var line : lines.subList(1, lines.size())) {
            if (line.isBlank()) {
                continue;
            }
            var cells = line.split(SEPARATOR, -1);
            points.computeIfAbsent(cells[col.of("gareLogiqueId")], id -> new ArrayList<>()).add(cells);
        }
        var stations = points.entrySet().stream().map(e -> toStation(e.getKey(), e.getValue(), col)).toList();
        return new StationCatalog(sha256(lines), stations);
    }

    public static List<StationAlias> parseAliases(String csv) {
        var lines = csv.lines().toList();
        if (lines.isEmpty() || !lines.getFirst().strip().equalsIgnoreCase("name;stationId")) {
            throw new IllegalArgumentException("En-tête attendu : name;stationId");
        }
        return lines.subList(1, lines.size()).stream()
                .filter(line -> !line.isBlank())
                .map(line -> {
                    var cells = line.split(SEPARATOR, -1);
                    if (cells.length != 2 || cells[1].isBlank()) {
                        throw new IllegalArgumentException("Ligne d'alias invalide : " + line);
                    }
                    return new StationAlias(cells[0], cells[1].strip());
                })
                .toList();
    }

    public static String readText(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Lecture impossible : " + file, e);
        }
    }

    private static LogicalStation toStation(String id, List<String[]> rows, ColumnIndex col) {
        var axes = new TreeSet<String>();
        double lon = 0;
        double lat = 0;
        var lanes = 0;
        for (var row : rows) {
            if (!row[col.of("axe")].isBlank()) {
                axes.add(row[col.of("axe")]);
            }
            lon += Double.parseDouble(row[col.of("lon")]);
            lat += Double.parseDouble(row[col.of("lat")]);
            lanes += Integer.parseInt(row[col.of("nbVoies")]);
        }
        var first = rows.getFirst();
        var name = rows.stream().map(r -> r[col.of("nomGare")].strip()).min(Comparator.comparingInt(String::length)).orElseThrow();
        var kind = "Bpv".equals(first[col.of("typeGare")]) ? LogicalStation.Kind.PLEINE_VOIE : LogicalStation.Kind.ECHANGEUR;
        var department = first[col.of("depPr")].length() == 1 ? "0" + first[col.of("depPr")] : first[col.of("depPr")];
        return new LogicalStation(id, name, kind, List.copyOf(axes), department, lanes, lon / rows.size(), lat / rows.size());
    }

    private static List<String> readLines(Path file) {
        try {
            var lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            if (lines.isEmpty()) {
                throw new IllegalArgumentException("Fichier vide : " + file);
            }
            return lines;
        } catch (IOException e) {
            throw new UncheckedIOException("Lecture impossible : " + file, e);
        }
    }

    private static String sha256(List<String> lines) {
        try {
            var digest = MessageDigest.getInstance("SHA-256").digest(String.join("\n", lines).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private record ColumnIndex(List<String> header) {

        int of(String column) {
            var index = header.indexOf(column);
            if (index < 0) {
                throw new IllegalArgumentException("Colonne absente du référentiel : " + column);
            }
            return index;
        }
    }
}
