package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.ingestion.QuarantineStore;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Une seule transaction pour l'historique, les issues de rejeu de quarantaine et le point de reprise :
 * après un crash, tout ce qui suit les offsets du dernier point de reprise est rejoué, rien n'est compté deux fois.
 */
@Component
class CheckpointTransaction {

    private final HistorySink history;
    private final QuarantineStore quarantine;
    private final CheckpointStore checkpoints;

    CheckpointTransaction(HistorySink history, QuarantineStore quarantine, CheckpointStore checkpoints) {
        this.history = history;
        this.quarantine = quarantine;
        this.checkpoints = checkpoints;
    }

    @Transactional
    void commit(String epoch, byte[] payload, HistoryBatch batch, List<QuarantineMark> marks) {
        history.write(batch);
        marks.forEach(mark -> quarantine.markProcessed(mark.eventId(), mark.status()));
        checkpoints.save(epoch, payload);
    }
}
