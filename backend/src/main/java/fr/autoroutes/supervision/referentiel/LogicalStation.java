package fr.autoroutes.supervision.referentiel;

import java.util.List;

/** Gare logique : unité d'affichage et d'agrégation (regroupement de points de péage). */
public record LogicalStation(
        String id,
        String name,
        Kind kind,
        List<String> axes,
        String department,
        int lanes,
        double longitude,
        double latitude) {

    public enum Kind {
        ECHANGEUR,
        PLEINE_VOIE
    }

    public LogicalStation {
        axes = List.copyOf(axes);
    }
}
