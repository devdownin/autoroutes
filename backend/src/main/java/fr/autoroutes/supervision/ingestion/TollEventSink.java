package fr.autoroutes.supervision.ingestion;

/** Port vers l'agrégation : l'ingestion ne dépend pas de son implémentation. */
public interface TollEventSink {

    /** Bloquant si la file est pleine : contre-pression naturelle sur la consommation Kafka. */
    void submit(IncomingEvent event);
}
