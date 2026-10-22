package fr.autoroutes.supervision.aggregation;

import java.util.Set;

/**
 * Critères de lecture de la matrice O/D. Les filtres s'appliquent AVANT l'agrégation, le seuil de diffusion APRÈS :
 * un flux n'est jamais publié sous le seuil, quelle que soit la combinaison de filtres.
 *
 * @param departments codes de département (vide = tous) ; @param axes axes autoroutiers (vide = tous)
 * @param role côté du flux auquel s'appliquent les filtres
 */
public record OdFilter(Level level, Set<String> departments, Set<String> axes, Role role, long minVehicles, int limit) {

    /** Seuil plancher de diffusion : aucun flux de moins de trois véhicules ne sort du backend (RGPD). */
    public static final long DISCLOSURE_FLOOR = 3;
    public static final int MAX_LIMIT = 2_000;

    public enum Level {
        STATION,
        DEPARTMENT
    }

    public enum Role {
        /** Origine ou destination correspond. */
        ANY,
        ORIGIN,
        DESTINATION
    }

    public OdFilter {
        departments = Set.copyOf(departments);
        axes = Set.copyOf(axes);
        minVehicles = Math.max(DISCLOSURE_FLOOR, minVehicles);
        limit = Math.min(MAX_LIMIT, Math.max(0, limit));
    }
}
