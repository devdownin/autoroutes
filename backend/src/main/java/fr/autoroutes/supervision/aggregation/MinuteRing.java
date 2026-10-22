package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.ingestion.EventType;

/**
 * Compteurs par minute sur un anneau de 25 h : couvre la journée de 25 h du passage à l'heure d'hiver.
 * Un emplacement dont l'horodatage ne correspond pas à la minute demandée est considéré vide.
 */
final class MinuteRing {

    static final int SIZE = 25 * 60;

    private final long[] minuteStamp = new long[SIZE];
    private final long[] entries = new long[SIZE];
    private final long[] exits = new long[SIZE];

    MinuteRing() {
        java.util.Arrays.fill(minuteStamp, Long.MIN_VALUE);
    }

    void add(long minute, EventType type, long count) {
        var slot = (int) Math.floorMod(minute, SIZE);
        if (minuteStamp[slot] != minute) {
            if (minuteStamp[slot] > minute) {
                return; // plus ancien que l'anneau : déjà écarté en amont par la politique de retard
            }
            minuteStamp[slot] = minute;
            entries[slot] = 0;
            exits[slot] = 0;
        }
        if (type == EventType.ENTRY) {
            entries[slot] += count;
        } else {
            exits[slot] += count;
        }
    }

    interface SlotConsumer {
        void accept(long minute, long entries, long exits);
    }

    void forEachSlot(SlotConsumer consumer) {
        for (var slot = 0; slot < SIZE; slot++) {
            if (minuteStamp[slot] != Long.MIN_VALUE && (entries[slot] != 0 || exits[slot] != 0)) {
                consumer.accept(minuteStamp[slot], entries[slot], exits[slot]);
            }
        }
    }

    void restoreSlot(long minute, long entryCount, long exitCount) {
        var slot = (int) Math.floorMod(minute, SIZE);
        minuteStamp[slot] = minute;
        entries[slot] = entryCount;
        exits[slot] = exitCount;
    }

    WindowCounts sum(long fromMinuteInclusive, long toMinuteInclusive) {
        long in = 0;
        long out = 0;
        var from = Math.max(fromMinuteInclusive, toMinuteInclusive - SIZE + 1);
        for (var minute = from; minute <= toMinuteInclusive; minute++) {
            var slot = (int) Math.floorMod(minute, SIZE);
            if (minuteStamp[slot] == minute) {
                in += entries[slot];
                out += exits[slot];
            }
        }
        return new WindowCounts(in, out);
    }
}
