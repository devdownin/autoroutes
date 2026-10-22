package fr.autoroutes.supervision.referentiel;

import java.util.Objects;

/** Une ligne de la table d'alias : un nom tel qu'il apparaît dans les événements → une gare logique. */
public record StationAlias(String name, String stationId) {

    public StationAlias {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(stationId, "stationId");
    }
}
