package fr.autoroutes.supervision.ingestion;

import java.util.Map;
import org.springframework.stereotype.Component;

/** Prochain offset à lire par partition, issu du point de reprise ; fixé par l'agrégation avant le démarrage de la consommation. */
@Component
public class ResumeOffsets {

    private volatile Map<Integer, Long> offsets = Map.of();

    public void set(Map<Integer, Long> value) {
        offsets = Map.copyOf(value);
    }

    Map<Integer, Long> get() {
        return offsets;
    }
}
