package fr.autoroutes.supervision.assignment;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Charge estimée des tronçons : jamais une mesure. Seuls les tronçons d'au moins 3 véhicules sont publiés
 * (un tronçon n'emprunté que par un flux isolé révélerait ce flux).
 *
 * @param routedVehicles véhicules O/D affectés à un chemin ; @param unroutedVehicles gare non rattachée au graphe ou sans chemin
 */
public record SegmentLoads(Instant reference, Duration window, String graphVersion, String algorithm, List<SegmentLoad> loads,
                           long routedVehicles, long unroutedVehicles) {

    public static final String ALGORITHM = "all-or-nothing-fastest-v1";

    public SegmentLoads {
        loads = List.copyOf(loads);
    }

    public double routedRatio() {
        var total = routedVehicles + unroutedVehicles;
        return total == 0 ? Double.NaN : (double) routedVehicles / total;
    }
}
