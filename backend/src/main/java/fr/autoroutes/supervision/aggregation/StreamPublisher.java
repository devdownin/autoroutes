package fr.autoroutes.supervision.aggregation;

/** Port vers la diffusion : l'agrégation ne dépend pas du transport (SSE). Appelé par l'écrivain unique. */
public interface StreamPublisher {

    /** État initial après (re)démarrage : nouvel epoch, les clients doivent recharger un snapshot. */
    void publishSnapshot(Snapshot snapshot);

    void publishDelta(Delta delta, Snapshot snapshotAfterDelta);

    void publishOd(OdUpdate update);

    void publishFreshness(Freshness freshness);
}
