package fr.autoroutes.supervision.api;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

final class OdParams {

    private OdParams() {
    }

    /** Valeurs séparées par des virgules ; absent ou vide = aucun filtre. */
    static Set<String> csv(String value) {
        return value == null ? Set.of() : Arrays.stream(value.split(",")).map(String::trim).filter(v -> !v.isEmpty()).collect(Collectors.toSet());
    }
}
