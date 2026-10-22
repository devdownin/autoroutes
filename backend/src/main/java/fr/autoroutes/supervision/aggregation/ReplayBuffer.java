package fr.autoroutes.supervision.aggregation;

import java.util.ArrayDeque;
import java.util.List;
import java.util.Optional;

/**
 * Derniers deltas émis, pour reprendre une connexion sans snapshot.
 * Thread-safe : alimenté par le thread d'agrégation, lu par les threads de diffusion.
 */
public final class ReplayBuffer {

    private final String epoch;
    private final int capacity;
    private final ArrayDeque<Delta> deltas;

    public ReplayBuffer(String epoch, int capacity) {
        this.epoch = epoch;
        this.capacity = capacity;
        this.deltas = new ArrayDeque<>(capacity);
    }

    public synchronized void append(Delta delta) {
        if (!deltas.isEmpty() && delta.seq() != deltas.peekLast().seq() + 1) {
            throw new IllegalStateException("Séquence non contiguë : " + delta.seq());
        }
        if (deltas.size() == capacity) {
            deltas.removeFirst();
        }
        deltas.addLast(delta);
    }

    /**
     * Deltas postérieurs à {@code lastSeq}, ou vide si la reprise est impossible
     * (autre epoch, séquence sortie du tampon ou postérieure au dernier delta) : le client doit recharger un snapshot.
     */
    public synchronized Optional<List<Delta>> after(String clientEpoch, long lastSeq) {
        if (!epoch.equals(clientEpoch)) {
            return Optional.empty();
        }
        var newest = deltas.isEmpty() ? 0 : deltas.peekLast().seq();
        if (lastSeq == newest) {
            return Optional.of(List.of());
        }
        if (deltas.isEmpty() || lastSeq > newest || lastSeq < deltas.peekFirst().seq() - 1) {
            return Optional.empty();
        }
        return Optional.of(deltas.stream().filter(d -> d.seq() > lastSeq).toList());
    }
}
