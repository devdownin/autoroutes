package fr.autoroutes.supervision.aggregation;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/** Dernières valeurs publiées par l'écrivain, immuables, lisibles depuis n'importe quel thread (REST, santé). */
@Component
public class LiveView {

    private final AtomicReference<Snapshot> snapshot = new AtomicReference<>();
    private final AtomicReference<OdUpdate> od = new AtomicReference<>();
    private final AtomicReference<OdSnapshot> odSnapshot = new AtomicReference<>();
    private final AtomicReference<Freshness> freshness = new AtomicReference<>();
    private final AtomicReference<WriterStats> stats = new AtomicReference<>();

    public Optional<Snapshot> snapshot() {
        return Optional.ofNullable(snapshot.get());
    }

    public Optional<OdUpdate> od() {
        return Optional.ofNullable(od.get());
    }

    public Optional<OdSnapshot> odSnapshot() {
        return Optional.ofNullable(odSnapshot.get());
    }

    public Optional<Freshness> freshness() {
        return Optional.ofNullable(freshness.get());
    }

    public Optional<WriterStats> stats() {
        return Optional.ofNullable(stats.get());
    }

    void update(Snapshot value) {
        snapshot.set(value);
    }

    void update(OdUpdate value) {
        od.set(value);
    }

    void update(OdSnapshot value) {
        odSnapshot.set(value);
    }

    void update(Freshness value) {
        freshness.set(value);
    }

    void update(WriterStats value) {
        stats.set(value);
    }
}
