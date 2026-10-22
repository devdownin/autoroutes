package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.ingestion.IncomingEvent;
import fr.autoroutes.supervision.ingestion.QuarantineStore;
import fr.autoroutes.supervision.ingestion.TollEventSink;
import fr.autoroutes.supervision.referentiel.AliasesUpdated;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Rejoue les événements en quarantaine après une mise à jour de la table d'alias (déduplication active). */
@Component
public class QuarantineReplayer {

    private static final Logger LOG = LoggerFactory.getLogger(QuarantineReplayer.class);
    private static final int MAX_REPLAY = 100_000;

    private final QuarantineStore quarantine;
    private final TollEventSink sink;

    QuarantineReplayer(QuarantineStore quarantine, TollEventSink sink) {
        this.quarantine = quarantine;
        this.sink = sink;
    }

    @EventListener
    void onAliasesUpdated(AliasesUpdated event) {
        LOG.info("Table d'alias {} active : rejeu de la quarantaine", event.version());
        replayAsync();
    }

    public void replayAsync() {
        Thread.ofVirtual().name("quarantine-replay").start(this::replay);
    }

    /** @return nombre d'événements soumis à l'écrivain */
    int replay() {
        var pending = quarantine.pending(MAX_REPLAY);
        pending.forEach(event -> sink.submit(IncomingEvent.fromQuarantine(event)));
        LOG.info("{} événements de quarantaine rejoués", pending.size());
        return pending.size();
    }
}
