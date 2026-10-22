package fr.autoroutes.supervision.aggregation;

import java.time.Instant;
import java.util.Map;

/** Instantané d'exploitation publié par l'écrivain à chaque tic, lu par l'API de diagnostic et la santé. */
public record WriterStats(
        String epoch,
        Instant watermark,
        long watermarkLagSeconds,
        long consumerLag,
        int queueSize,
        int dedupEntries,
        Map<String, Long> outcomes,
        Map<String, Long> odStatuses,
        Instant lastCheckpointAt,
        long lastCheckpointBytes,
        FreshnessStatus status) {

    public WriterStats {
        outcomes = Map.copyOf(outcomes);
        odStatuses = Map.copyOf(odStatuses);
    }
}
