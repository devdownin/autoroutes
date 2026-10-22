package fr.autoroutes.supervision.referentiel;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/**
 * Version immuable de la table nom normalisé → gare logique.
 * La construction échoue si un même nom normalisé désigne deux gares : une ambiguïté
 * ne doit jamais être tranchée silencieusement à l'exécution.
 */
public final class StationDirectory {

    private final String version;
    private final Map<String, String> stationIdByName;

    private StationDirectory(String version, Map<String, String> stationIdByName) {
        this.version = version;
        this.stationIdByName = Map.copyOf(stationIdByName);
    }

    public static StationDirectory of(String version, Collection<StationAlias> aliases) {
        var index = new HashMap<String, String>();
        var conflicts = new TreeMap<String, String>();
        for (var alias : aliases) {
            var key = StationNames.normalize(alias.name());
            if (key.isEmpty()) {
                throw new IllegalArgumentException("Alias vide pour la gare " + alias.stationId());
            }
            var previous = index.putIfAbsent(key, alias.stationId());
            if (previous != null && !previous.equals(alias.stationId())) {
                conflicts.put(key, previous + " / " + alias.stationId());
            }
        }
        if (!conflicts.isEmpty()) {
            throw new IllegalArgumentException("Alias ambigus : " + conflicts);
        }
        return new StationDirectory(version, index);
    }

    public Optional<String> resolve(String name) {
        return Optional.ofNullable(stationIdByName.get(StationNames.normalize(name)));
    }

    public String version() {
        return version;
    }

    public int size() {
        return stationIdByName.size();
    }
}
