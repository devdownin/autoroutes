package fr.autoroutes.supervision.aggregation;

import java.util.List;

/** Flux O/D OBSERVÉS au-dessus du seuil de diffusion, liste complète remplaçante (message {@code od}). */
public record OdUpdate(String window, long minVehicles, List<OdFlow> flows) {

    public OdUpdate {
        flows = List.copyOf(flows);
    }
}
