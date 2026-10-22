package fr.autoroutes.supervision.assignment;

import java.util.List;

/** @param unattachedSamples vingt premières gares sans nœud du graphe dans le rayon, avec la distance au plus proche */
public record GraphDiagnostic(String graphVersion, int attachedStations, int unattachedStations, long maxAttachDistanceM,
                              List<String> unattachedSamples) {
}
