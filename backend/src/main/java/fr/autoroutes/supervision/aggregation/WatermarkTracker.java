package fr.autoroutes.supervision.aggregation;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Watermark en temps d'événement : minimum, sur les partitions actives, du plus grand {@code eventTime} vu.
 * Une partition muette depuis plus de {@code idleTimeout} (horloge murale) est écartée pour ne pas figer le calcul.
 *
 * <p>Non thread-safe : écrivain unique.
 */
public final class WatermarkTracker {

    private record Progress(Instant maxEventTime, Instant lastSeen) {
    }

    private final Duration idleTimeout;
    private final Clock clock;
    private final Map<Integer, Progress> partitions = new HashMap<>();

    public WatermarkTracker(Duration idleTimeout, Clock clock) {
        this.idleTimeout = idleTimeout;
        this.clock = clock;
    }

    public void observe(int partition, Instant eventTime) {
        var now = clock.instant();
        partitions.merge(partition, new Progress(eventTime, now), (previous, current) -> new Progress(
                previous.maxEventTime().isAfter(eventTime) ? previous.maxEventTime() : eventTime, now));
    }

    /** Plus grand eventTime vu par partition, pour le point de reprise. */
    public Map<Integer, Instant> export() {
        var exported = new HashMap<Integer, Instant>();
        partitions.forEach((partition, progress) -> exported.put(partition, progress.maxEventTime()));
        return exported;
    }

    public void restore(Map<Integer, Instant> checkpoint) {
        partitions.clear();
        var now = clock.instant();
        checkpoint.forEach((partition, maxEventTime) -> partitions.put(partition, new Progress(maxEventTime, now)));
    }

    public Optional<Instant> watermark() {
        var activeSince = clock.instant().minus(idleTimeout);
        var active = partitions.values().stream()
                .filter(p -> !p.lastSeen().isBefore(activeSince))
                .map(Progress::maxEventTime)
                .min(Comparator.naturalOrder());
        return active.isPresent()
                ? active
                : partitions.values().stream().map(Progress::maxEventTime).max(Comparator.naturalOrder());
    }
}
