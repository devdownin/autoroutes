package fr.autoroutes.supervision.aggregation;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Comparator;

/**
 * Produit, à chaque tic (fréquence configurable, 1 Hz par défaut), un delta ne contenant que les gares
 * dont les indicateurs publiés ont changé. Au changement de minute, toutes les gares sont recalculées
 * car les fenêtres glissantes évoluent même sans nouvel événement.
 *
 * <p>Non thread-safe : appelé par le thread d'agrégation, qui publie ensuite delta et snapshot immuables.
 */
public final class DeltaComputer {

    private final String epoch;
    private final Map<String, StationMetrics> published = new HashMap<>();
    private long seq;
    private long lastMinute = Long.MIN_VALUE;
    private Instant lastReference;

    public DeltaComputer(String epoch) {
        this.epoch = epoch;
    }

    public Optional<Delta> tick(AggregationState state, Instant reference) {
        var minute = AggregationState.epochMinute(reference);
        var candidates = new HashSet<>(state.drainDirty());
        if (minute != lastMinute) {
            candidates.addAll(state.stationIds());
            lastMinute = minute;
        }
        lastReference = reference;
        var changed = candidates.stream()
                .map(id -> state.metrics(id, reference))
                .filter(m -> !m.equals(published.get(m.stationId())))
                .sorted(Comparator.comparing(StationMetrics::stationId))
                .toList();
        if (changed.isEmpty()) {
            return Optional.empty();
        }
        changed.forEach(m -> published.put(m.stationId(), m));
        return Optional.of(new Delta(epoch, ++seq, reference, changed));
    }

    public Snapshot snapshot() {
        var stations = published.values().stream()
                .sorted(Comparator.comparing(StationMetrics::stationId))
                .toList();
        return new Snapshot(epoch, seq, lastReference, List.copyOf(stations));
    }
}
