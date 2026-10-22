package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.ingestion.EventType;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;

/**
 * Accumulateur de l'écrivain unique : chaque passage appliqué à l'état est aussi ajouté ici,
 * puis vidé à chaque point de reprise. Non thread-safe.
 */
public final class HistoryIncrements {

    private final ZoneId zone;
    private Map<HistoryBatch.StationMinute, long[]> minutes = new HashMap<>();
    private Map<HistoryBatch.OdHour, Long> odHours = new HashMap<>();
    private Map<HistoryBatch.OdDay, Long> odDays = new HashMap<>();

    public HistoryIncrements(ZoneId zone) {
        this.zone = zone;
    }

    public void station(String stationId, EventType type, Instant eventTime, int vehicles) {
        var counts = minutes.computeIfAbsent(new HistoryBatch.StationMinute(stationId, Math.floorDiv(eventTime.getEpochSecond(), 60)),
                k -> new long[2]);
        counts[type == EventType.ENTRY ? 0 : 1] += vehicles;
    }

    public void od(String originId, String destinationId, Instant exitTime, int vehicles) {
        odHours.merge(new HistoryBatch.OdHour(originId, destinationId, Math.floorDiv(exitTime.getEpochSecond(), 3600)),
                (long) vehicles, Long::sum);
        odDays.merge(new HistoryBatch.OdDay(originId, destinationId, exitTime.atZone(zone).toLocalDate()), (long) vehicles, Long::sum);
    }

    /** Lot immuable des incréments accumulés ; l'accumulateur repart à vide. */
    public HistoryBatch drain() {
        var counts = new HashMap<HistoryBatch.StationMinute, WindowCounts>(minutes.size() * 2);
        minutes.forEach((key, value) -> counts.put(key, new WindowCounts(value[0], value[1])));
        var batch = new HistoryBatch(counts, odHours, odDays);
        minutes = new HashMap<>();
        odHours = new HashMap<>();
        odDays = new HashMap<>();
        return batch;
    }
}
