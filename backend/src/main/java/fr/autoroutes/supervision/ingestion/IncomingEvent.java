package fr.autoroutes.supervision.ingestion;

/**
 * Événement validé transmis à l'agrégation.
 *
 * @param replay vrai pour un événement sorti de quarantaine (pas de position Kafka associée)
 */
public record IncomingEvent(int partition, long offset, TollEvent event, boolean replay) {

    public static IncomingEvent fromKafka(int partition, long offset, TollEvent event) {
        return new IncomingEvent(partition, offset, event, false);
    }

    public static IncomingEvent fromQuarantine(TollEvent event) {
        return new IncomingEvent(-1, -1, event, true);
    }
}
