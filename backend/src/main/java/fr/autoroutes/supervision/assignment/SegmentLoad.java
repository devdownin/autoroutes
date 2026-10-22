package fr.autoroutes.supervision.assignment;

/** Véhicules ESTIMÉS sur un tronçon (segmentId de la couche cartographique) sur la fenêtre. */
public record SegmentLoad(String segmentId, long vehicles) {
}
