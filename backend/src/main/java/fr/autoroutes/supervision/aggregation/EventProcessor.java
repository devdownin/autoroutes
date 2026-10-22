package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.ingestion.EventDeduplicator;
import fr.autoroutes.supervision.ingestion.EventType;
import fr.autoroutes.supervision.ingestion.RejectReason;
import fr.autoroutes.supervision.ingestion.TollEvent;
import fr.autoroutes.supervision.referentiel.StationResolver;
import java.util.function.Predicate;

/**
 * Chaîne de traitement d'un événement validé, exécutée par le thread d'agrégation (écrivain unique) :
 * résolution du nom → watermark → retard → déduplication → état courant → matrice O/D.
 */
public final class EventProcessor {

    public enum OdStatus {
        /** Entrée : pas de flux. */
        NOT_APPLICABLE,
        /** Sortie dont la gare d'entrée est connue : flux observé. */
        RECORDED,
        /** Sortie sans gare d'entrée à une gare en système ouvert : aucune origine attendue. */
        OPEN_SYSTEM,
        /** Sortie sans gare d'entrée à une gare en système fermé : anomalie de données. */
        ENTRY_MISSING,
        /** Gare d'entrée absente de la table d'alias. */
        ENTRY_UNKNOWN
    }

    public sealed interface Outcome {

        record Applied(String stationId, boolean historyCorrection, OdStatus od) implements Outcome {
        }

        /** Nom de gare absent de la table d'alias : conservé (champs autorisés) pour rejeu après mise à jour. */
        record Quarantined(TollEvent event) implements Outcome {
        }

        record Duplicate(String eventId) implements Outcome {
        }

        record Rejected(String eventId, RejectReason reason) implements Outcome {
        }
    }

    private final StationResolver resolver;
    private final WatermarkTracker watermarks;
    private final LatenessPolicy lateness;
    private final EventDeduplicator deduplicator;
    private final AggregationState state;
    private final OdCounters od;
    private final HistoryIncrements history;
    private final Predicate<String> openSystem;

    /** @param openSystem vrai pour une gare logique en système ouvert (barrière pleine voie) : pas d'origine attendue */
    public EventProcessor(StationResolver resolver, WatermarkTracker watermarks, LatenessPolicy lateness,
                          EventDeduplicator deduplicator, AggregationState state, OdCounters od, HistoryIncrements history,
                          Predicate<String> openSystem) {
        this.resolver = resolver;
        this.watermarks = watermarks;
        this.lateness = lateness;
        this.deduplicator = deduplicator;
        this.state = state;
        this.od = od;
        this.history = history;
        this.openSystem = openSystem;
    }

    public Outcome process(int partition, TollEvent event) {
        watermarks.observe(partition, event.eventTime());
        return apply(event);
    }

    /**
     * Rejeu d'un événement sorti de quarantaine : il ne fait pas progresser le watermark,
     * sinon un événement ancien ferait reculer le temps de référence de toutes les fenêtres.
     */
    public Outcome reprocess(TollEvent event) {
        return apply(event);
    }

    private Outcome apply(TollEvent event) {
        var stationId = resolver.resolve(event.stationName());
        if (stationId.isEmpty()) {
            return new Outcome.Quarantined(event);
        }
        var watermark = watermarks.watermark().orElse(event.eventTime());
        var verdict = lateness.classify(event.eventTime(), watermark);
        if (verdict == LatenessPolicy.Verdict.TOO_LATE) {
            return new Outcome.Rejected(event.eventId(), RejectReason.TOO_LATE);
        }
        switch (deduplicator.register(event.eventId(), event.eventTime(), watermark)) {
            case DUPLICATE -> {
                return new Outcome.Duplicate(event.eventId());
            }
            case BEYOND_HORIZON -> {
                return new Outcome.Rejected(event.eventId(), RejectReason.TOO_LATE);
            }
            case NEW -> {
                state.apply(stationId.get(), event.type(), event.eventTime(), event.vehicleCount());
                history.station(stationId.get(), event.type(), event.eventTime(), event.vehicleCount());
            }
        }
        return new Outcome.Applied(stationId.get(), verdict == LatenessPolicy.Verdict.CORRECTION,
                recordOd(event, stationId.get()));
    }

    private OdStatus recordOd(TollEvent event, String destinationId) {
        if (event.type() != EventType.EXIT) {
            return OdStatus.NOT_APPLICABLE;
        }
        var status = classifyExit(event, destinationId);
        // Toute sortie appliquée a exactement une issue : c'est ce qui rend le rapprochement avec les sorties des gares exact.
        od.addCoverage(status, event.eventTime(), event.vehicleCount());
        return status;
    }

    private OdStatus classifyExit(TollEvent event, String destinationId) {
        if (event.entryStation().isEmpty()) {
            return openSystem.test(destinationId) ? OdStatus.OPEN_SYSTEM : OdStatus.ENTRY_MISSING;
        }
        return event.entryStation()
                .flatMap(resolver::resolve)
                .map(originId -> {
                    od.add(originId, destinationId, event.eventTime(), event.vehicleCount());
                    history.od(originId, destinationId, event.eventTime(), event.vehicleCount());
                    return OdStatus.RECORDED;
                })
                .orElse(OdStatus.ENTRY_UNKNOWN);
    }
}
