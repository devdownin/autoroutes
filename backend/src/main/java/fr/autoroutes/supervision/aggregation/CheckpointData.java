package fr.autoroutes.supervision.aggregation;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Copie cohérente de l'état, capturée par l'écrivain unique en un seul instant :
 * les offsets correspondent exactement aux compteurs, la reprise rejoue donc sans double comptage.
 *
 * @param nextOffsets prochain offset à lire, par partition
 */
public record CheckpointData(
        Instant createdAt,
        Map<Integer, Long> nextOffsets,
        Map<Integer, Instant> watermarks,
        List<AggregationState.StationCheckpoint> stations,
        List<OdCounters.OdCheckpoint> od,
        List<OdCounters.CoverageCheckpoint> odCoverage,
        Map<Long, long[]> dedup) {
}
