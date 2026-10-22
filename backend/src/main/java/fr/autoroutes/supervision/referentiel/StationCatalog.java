package fr.autoroutes.supervision.referentiel;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Référentiel immuable des gares logiques, dans l'ordre stable des identifiants (= ordre des features côté navigateur). */
public final class StationCatalog {

    private final String version;
    private final Map<String, LogicalStation> stationsById;

    public StationCatalog(String version, List<LogicalStation> stations) {
        this.version = version;
        this.stationsById = stations.stream()
                .sorted(java.util.Comparator.comparing(LogicalStation::id))
                .collect(Collectors.toMap(LogicalStation::id, Function.identity(), (a, b) -> {
                    throw new IllegalArgumentException("Gare logique en double : " + a.id());
                }, LinkedHashMap::new));
    }

    public String version() {
        return version;
    }

    public List<LogicalStation> stations() {
        return List.copyOf(stationsById.values());
    }

    public Optional<LogicalStation> find(String id) {
        return Optional.ofNullable(stationsById.get(id));
    }

    public boolean contains(String id) {
        return stationsById.containsKey(id);
    }

    public int size() {
        return stationsById.size();
    }

    /** FeatureCollection GeoJSON (WGS84) attendue par le frontend : id, name, kind, axes, dept, lanes. */
    public Map<String, Object> toGeoJson() {
        var features = stationsById.values().stream()
                .map(s -> Map.of(
                        "type", "Feature",
                        "geometry", Map.of("type", "Point", "coordinates", List.of(s.longitude(), s.latitude())),
                        "properties", Map.of(
                                "id", s.id(),
                                "name", s.name(),
                                "kind", s.kind().name(),
                                "axes", String.join(", ", s.axes()),
                                "dept", s.department(),
                                "lanes", s.lanes())))
                .toList();
        return Map.of("type", "FeatureCollection", "features", features);
    }
}
