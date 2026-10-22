package fr.autoroutes.supervision.aggregation;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;

/**
 * Matrice origine-destination creuse, par tranche de 15 min de l'heure de SORTIE.
 * Seuls les couples observés sont stockés ; les tranches de plus de 25 h sont purgées.
 *
 * <p>Non thread-safe : écrivain unique.
 */
public final class OdCounters {

    private record OdKey(String originId, String destinationId) {
    }

    static final int BUCKET_MINUTES = 15;
    private static final long RETENTION_BUCKETS = 25 * 60 / BUCKET_MINUTES;

    private final TreeMap<Long, Map<OdKey, Long>> buckets = new TreeMap<>();
    // Issue des sorties par tranche : {enregistré, système ouvert, origine absente, origine inconnue}.
    private final TreeMap<Long, long[]> coverage = new TreeMap<>();

    public void add(String originId, String destinationId, Instant exitTime, long vehicles) {
        var bucket = bucketOf(exitTime);
        buckets.computeIfAbsent(bucket, b -> new HashMap<>()).merge(new OdKey(originId, destinationId), vehicles, Long::sum);
        buckets.headMap(bucket - RETENTION_BUCKETS).clear();
    }

    /** Compte l'issue d'une sortie (véhicules) ; sans effet pour les statuts non applicables (entrées). */
    public void addCoverage(EventProcessor.OdStatus status, Instant exitTime, long vehicles) {
        var index = switch (status) {
            case RECORDED -> 0;
            case OPEN_SYSTEM -> 1;
            case ENTRY_MISSING -> 2;
            case ENTRY_UNKNOWN -> 3;
            case NOT_APPLICABLE -> -1;
        };
        if (index >= 0) {
            var bucket = bucketOf(exitTime);
            coverage.computeIfAbsent(bucket, b -> new long[4])[index] += vehicles;
            coverage.headMap(bucket - RETENTION_BUCKETS).clear();
        }
    }

    /** Cellules brutes (non seuillées) cumulées sur la fenêtre, dans l'ordre déterministe origine puis destination. */
    public List<OdCell> cells(Instant reference, Duration window) {
        var totals = new HashMap<OdKey, Long>();
        buckets.subMap(firstBucket(reference, window), true, bucketOf(reference), true).values()
                .forEach(bucket -> bucket.forEach((key, count) -> totals.merge(key, count, Long::sum)));
        return totals.entrySet().stream()
                .map(e -> new OdCell(e.getKey().originId(), e.getKey().destinationId(), e.getValue()))
                .sorted(Comparator.comparing(OdCell::originId).thenComparing(OdCell::destinationId))
                .toList();
    }

    public OdCoverage coverage(Instant reference, Duration window) {
        var total = new long[4];
        coverage.subMap(firstBucket(reference, window), true, bucketOf(reference), true).values()
                .forEach(counts -> {
                    for (var i = 0; i < 4; i++) {
                        total[i] += counts[i];
                    }
                });
        return new OdCoverage(total[0], total[1], total[2], total[3]);
    }

    /** Première minute (epoch) couverte par les tranches de la fenêtre : permet le rapprochement avec l'état par gare. */
    public static long firstMinute(Instant reference, Duration window) {
        return firstBucket(reference, window) * BUCKET_MINUTES;
    }

    /** Dernière minute (epoch, incluse) couverte : fin de la tranche courante. */
    public static long lastMinute(Instant reference) {
        return (bucketOf(reference) + 1) * BUCKET_MINUTES - 1;
    }

    private static long firstBucket(Instant reference, Duration window) {
        return bucketOf(reference) - Math.max(1, window.toMinutes() / BUCKET_MINUTES) + 1;
    }

    /**
     * Couples dont le total sur la fenêtre atteint {@code minVehicles} (seuil de diffusion RGPD),
     * triés par volume décroissant et limités à {@code limit}.
     */
    public List<OdFlow> flows(Instant reference, Duration window, long minVehicles, int limit) {
        var totals = new HashMap<OdKey, Long>();
        buckets.subMap(firstBucket(reference, window), true, bucketOf(reference), true).values()
                .forEach(bucket -> bucket.forEach((key, count) -> totals.merge(key, count, Long::sum)));
        return totals.entrySet().stream()
                .filter(e -> e.getValue() >= minVehicles)
                .map(e -> new OdFlow(e.getKey().originId(), e.getKey().destinationId(), e.getValue()))
                .sorted(Comparator.comparingLong(OdFlow::vehicles).reversed()
                        .thenComparing(OdFlow::originId)
                        .thenComparing(OdFlow::destinationId))
                .limit(limit)
                .toList();
    }

    public List<OdCheckpoint> export() {
        var exported = new ArrayList<OdCheckpoint>();
        buckets.forEach((bucket, counts) -> counts.forEach((key, vehicles) ->
                exported.add(new OdCheckpoint(bucket, key.originId(), key.destinationId(), vehicles))));
        return exported;
    }

    public List<CoverageCheckpoint> exportCoverage() {
        var exported = new ArrayList<CoverageCheckpoint>();
        coverage.forEach((bucket, counts) -> exported.add(new CoverageCheckpoint(bucket, counts.clone())));
        return exported;
    }

    public void restore(List<OdCheckpoint> checkpoint, List<CoverageCheckpoint> coverageCheckpoint) {
        buckets.clear();
        coverage.clear();
        checkpoint.forEach(c -> buckets.computeIfAbsent(c.bucket(), b -> new HashMap<>())
                .put(new OdKey(c.originId(), c.destinationId()), c.vehicles()));
        coverageCheckpoint.forEach(c -> coverage.put(c.bucket(), c.counts().clone()));
    }

    public void restore(List<OdCheckpoint> checkpoint) {
        restore(checkpoint, List.of());
    }

    public record OdCheckpoint(long bucket, String originId, String destinationId, long vehicles) {
    }

    /** @param counts {enregistré, système ouvert, origine absente, origine inconnue} */
    public record CoverageCheckpoint(long bucket, long[] counts) {
    }

    private static long bucketOf(Instant instant) {
        return Math.floorDiv(instant.getEpochSecond(), BUCKET_MINUTES * 60L);
    }
}
