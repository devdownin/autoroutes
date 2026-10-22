package fr.autoroutes.supervision.aggregation;

import java.time.Instant;
import java.util.List;

/**
 * Mise à jour transmise aux navigateurs : uniquement les gares dont les indicateurs ont changé.
 *
 * @param epoch identifiant de l'instance d'état ; un changement d'epoch (redémarrage) impose un snapshot
 * @param seq   numéro de séquence strictement croissant au sein d'un epoch, sans trou
 */
public record Delta(String epoch, long seq, Instant watermark, List<StationMetrics> stations) {
}
