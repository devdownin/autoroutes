package fr.autoroutes.supervision.aggregation;

/** Couple origine → destination et son volume sur une fenêtre, AVANT application du seuil de diffusion. */
public record OdCell(String originId, String destinationId, long vehicles) {
}
