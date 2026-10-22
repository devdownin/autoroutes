package fr.autoroutes.supervision.aggregation;

import java.util.List;

/** État de fraîcheur diffusé aux navigateurs (message {@code freshness}). */
public record Freshness(FreshnessStatus status, long consumerLag, long watermarkLagSeconds, List<String> staleStations) {

    public Freshness {
        staleStations = List.copyOf(staleStations);
    }

    /** Changement visible pour l'utilisateur : les retards varient en continu et ne justifient pas un envoi immédiat. */
    boolean visiblyDiffersFrom(Freshness other) {
        return other == null || status != other.status || !staleStations.equals(other.staleStations);
    }
}
