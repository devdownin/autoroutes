package fr.autoroutes.supervision.aggregation;

import java.time.Instant;
import java.util.List;

/** État complet cohérent avec le delta de même {@code seq} : le client applique ensuite les deltas {@code seq + 1}, {@code seq + 2}… */
public record Snapshot(String epoch, long seq, Instant watermark, List<StationMetrics> stations) {
}
