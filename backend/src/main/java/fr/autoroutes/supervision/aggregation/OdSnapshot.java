package fr.autoroutes.supervision.aggregation;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Instantané immuable de la matrice O/D sur une fenêtre, publié par l'écrivain unique et lu par l'API.
 * Contient les cellules brutes (non seuillées) : le seuil de diffusion s'applique à la requête, après agrégation.
 *
 * @param stationExits sorties de toutes les gares sur les mêmes tranches (source indépendante : l'état par gare)
 */
public record OdSnapshot(Instant reference, Duration window, List<OdCell> cells, OdCoverage coverage, long stationExits) {

    public OdSnapshot {
        cells = List.copyOf(cells);
    }

    /** Écart absolu entre les sorties des gares et la somme des issues O/D : doit être nul. */
    public long reconciliationGap() {
        return Math.abs(stationExits - coverage.totalExits());
    }

    public double reconciliationGapRatio() {
        return stationExits == 0 ? 0 : (double) reconciliationGap() / stationExits;
    }
}
