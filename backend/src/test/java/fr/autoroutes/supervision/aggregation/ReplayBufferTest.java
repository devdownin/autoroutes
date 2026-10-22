package fr.autoroutes.supervision.aggregation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReplayBufferTest {

    private final ReplayBuffer buffer = new ReplayBuffer("epoch-1", 3);

    private static Delta delta(long seq) {
        return new Delta("epoch-1", seq, Instant.EPOCH, List.of());
    }

    @Test
    void resumesFromLastSeenSequence() {
        for (long seq = 1; seq <= 5; seq++) {
            buffer.append(delta(seq));
        }

        assertThat(buffer.after("epoch-1", 3)).hasValueSatisfying(
                deltas -> assertThat(deltas).extracting(Delta::seq).containsExactly(4L, 5L));
        assertThat(buffer.after("epoch-1", 2)).hasValueSatisfying(
                deltas -> assertThat(deltas).extracting(Delta::seq).containsExactly(3L, 4L, 5L));
        assertThat(buffer.after("epoch-1", 5)).hasValue(List.of());
    }

    @Test
    void requiresSnapshotWhenResumeIsImpossible() {
        for (long seq = 1; seq <= 5; seq++) {
            buffer.append(delta(seq));
        }

        assertThat(buffer.after("epoch-1", 1)).isEmpty();
        assertThat(buffer.after("epoch-1", 9)).isEmpty();
        assertThat(buffer.after("epoch-0", 4)).isEmpty();
    }

    @Test
    void refusesNonContiguousSequence() {
        buffer.append(delta(1));

        assertThatThrownBy(() -> buffer.append(delta(3))).isInstanceOf(IllegalStateException.class);
    }
}
