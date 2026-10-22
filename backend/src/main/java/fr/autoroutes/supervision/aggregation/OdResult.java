package fr.autoroutes.supervision.aggregation;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Flux O/D diffusables : seuil appliqué, identifiants de gare ou de département. Les flux masqués ne sont
 * connus que par leur nombre et leur volume agrégé, jamais individuellement.
 *
 * @param totalVehicles volume de tous les flux observés correspondant aux filtres (masqués inclus)
 * @param truncated flux au-dessus du seuil non listés à cause de la limite
 */
public record OdResult(Instant reference, Duration window, OdFilter.Level level, long minVehicles, List<OdFlow> flows,
                       List<OdNode> nodes, Masked masked, long totalVehicles, boolean truncated, OdCoverage coverage) {

    public record Masked(long flows, long vehicles) {
    }

    /** Extrémité d'un flux : une gare, ou un département représenté par le centre de ses gares. */
    public record OdNode(String id, String name, double longitude, double latitude) {
    }
}
