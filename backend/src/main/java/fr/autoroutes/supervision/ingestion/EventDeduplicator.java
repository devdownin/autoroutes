package fr.autoroutes.supervision.ingestion;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Déduplication par {@code eventId} sur un horizon borné en temps d'événement.
 * Les identifiants sont rangés par minute d'{@code eventTime} et purgés quand le watermark dépasse l'horizon :
 * la mémoire est proportionnelle au débit × horizon, pas à la durée de fonctionnement.
 * Un événement plus ancien que l'horizon ne peut plus être dédupliqué : il est signalé, jamais compté.
 *
 * <p>Non thread-safe : appelé uniquement par le thread d'agrégation (écrivain unique).
 */
public final class EventDeduplicator {

    public enum Outcome {
        NEW,
        DUPLICATE,
        BEYOND_HORIZON
    }

    private final long horizonMinutes;
    // Perf : HashSet<Long> ≈ 48 o par identifiant ; 2 h à 300 évt/s ≈ 2,2 M ids ≈ 100 Mo.
    // Passer à un ensemble de long primitifs si la volumétrie réelle l'exige.
    private final Map<Long, Set<Long>> idsByMinute = new HashMap<>();
    private final MessageDigest sha256;
    private long floorMinute = Long.MIN_VALUE;
    private int size;

    public EventDeduplicator(Duration horizon) {
        if (horizon.toMinutes() < 1) {
            throw new IllegalArgumentException("Horizon minimal : 1 minute");
        }
        this.horizonMinutes = horizon.toMinutes();
        try {
            this.sha256 = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public Outcome register(String eventId, Instant eventTime, Instant watermark) {
        advanceFloor(epochMinute(watermark) - horizonMinutes);
        var minute = epochMinute(eventTime);
        if (minute < floorMinute) {
            return Outcome.BEYOND_HORIZON;
        }
        var added = idsByMinute.computeIfAbsent(minute, m -> new HashSet<>()).add(fingerprint(eventId));
        if (added) {
            size++;
        }
        return added ? Outcome.NEW : Outcome.DUPLICATE;
    }

    public int size() {
        return size;
    }

    /** Export pour le point de reprise : minute → empreintes. */
    public Map<Long, long[]> export() {
        var copy = new HashMap<Long, long[]>();
        idsByMinute.forEach((minute, ids) -> copy.put(minute, ids.stream().mapToLong(Long::longValue).toArray()));
        return copy;
    }

    public void restore(Map<Long, long[]> exported) {
        idsByMinute.clear();
        size = 0;
        exported.forEach((minute, ids) -> {
            var set = new HashSet<Long>(ids.length * 2);
            for (var id : ids) {
                set.add(id);
            }
            idsByMinute.put(minute, set);
            size += set.size();
        });
    }

    private void advanceFloor(long candidate) {
        if (candidate <= floorMinute) {
            return;
        }
        floorMinute = candidate;
        var it = idsByMinute.entrySet().iterator();
        while (it.hasNext()) {
            var entry = it.next();
            if (entry.getKey() < floorMinute) {
                size -= entry.getValue().size();
                it.remove();
            }
        }
    }

    /** 64 premiers bits d'un SHA-256 : collision improbable (~1e-7 pour 2 M ids), taille fixe quel que soit le format d'eventId. */
    private long fingerprint(String eventId) {
        var digest = sha256.digest(eventId.getBytes(StandardCharsets.UTF_8));
        return ByteBuffer.wrap(digest).getLong();
    }

    static long epochMinute(Instant instant) {
        return Math.floorDiv(instant.getEpochSecond(), 60);
    }
}
