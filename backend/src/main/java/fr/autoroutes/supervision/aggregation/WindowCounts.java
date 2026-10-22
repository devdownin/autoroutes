package fr.autoroutes.supervision.aggregation;

public record WindowCounts(long entries, long exits) {

    public static final WindowCounts ZERO = new WindowCounts(0, 0);

    public long balance() {
        return entries - exits;
    }
}
