package fr.autoroutes.supervision.referentiel;

import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

/** Point d'accès à la table d'alias courante, remplaçable à chaud lors d'un import du référentiel. */
public class StationResolver {

    private final AtomicReference<StationDirectory> current;

    public StationResolver(StationDirectory initial) {
        this.current = new AtomicReference<>(Objects.requireNonNull(initial));
    }

    public Optional<String> resolve(String name) {
        return current.get().resolve(name);
    }

    public String version() {
        return current.get().version();
    }

    public void replace(StationDirectory next) {
        current.set(Objects.requireNonNull(next));
    }
}
