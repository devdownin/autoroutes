package fr.autoroutes.supervision.aggregation;

/** Port vers la persistance de l'historique ; appelé dans la transaction du point de reprise. */
public interface HistorySink {

    void write(HistoryBatch batch);
}
