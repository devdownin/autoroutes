package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.referentiel.LogicalStation;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import fr.autoroutes.supervision.referentiel.StationNames;
import java.util.Comparator;
import java.util.List;

/** Gares logiques les plus proches d'un nom inconnu (distance de Levenshtein sur les noms normalisés). */
final class NameSuggester {

    private record Candidate(String label, String normalized) {
    }

    private final List<Candidate> candidates;

    NameSuggester(StationCatalog catalog) {
        this.candidates = catalog.stations().stream()
                .map(s -> new Candidate(label(s), StationNames.normalize(s.name())))
                .toList();
    }

    List<String> suggest(String name, int limit) {
        var target = StationNames.normalize(name);
        return candidates.stream()
                .sorted(Comparator.comparingInt((Candidate c) -> levenshtein(target, c.normalized())).thenComparing(Candidate::label))
                .limit(limit)
                .map(Candidate::label)
                .toList();
    }

    private static String label(LogicalStation station) {
        return station.name() + " (" + station.id() + ")";
    }

    static int levenshtein(String a, String b) {
        var previous = new int[b.length() + 1];
        var current = new int[b.length() + 1];
        for (var j = 0; j <= b.length(); j++) {
            previous[j] = j;
        }
        for (var i = 1; i <= a.length(); i++) {
            current[0] = i;
            for (var j = 1; j <= b.length(); j++) {
                var cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }
            var swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()];
    }
}
