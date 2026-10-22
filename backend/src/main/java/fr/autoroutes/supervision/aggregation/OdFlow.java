package fr.autoroutes.supervision.aggregation;

/** Flux origine → destination OBSERVÉ (sortie en système fermé portant la gare d'entrée). */
public record OdFlow(String originId, String destinationId, long vehicles) {
}
