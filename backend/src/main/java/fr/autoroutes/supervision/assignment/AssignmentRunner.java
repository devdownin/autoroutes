package fr.autoroutes.supervision.assignment;

import fr.autoroutes.supervision.SupervisionProperties;
import fr.autoroutes.supervision.aggregation.LiveView;
import fr.autoroutes.supervision.aggregation.OdSnapshot;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Recalcule la charge des tronçons toutes les 10 s à partir du dernier instantané O/D, hors du chemin de l'écrivain unique.
 * Inactif sans fichier de graphe : les clients ne reçoivent alors aucun message {@code segments}.
 */
@Component
@ConditionalOnExpression("!'${supervision.assignment.graph-file:}'.isBlank()")
public class AssignmentRunner {

    private static final Logger LOG = LoggerFactory.getLogger(AssignmentRunner.class);

    private final LiveView liveView;
    private final SegmentPublisher publisher;
    private final AssignmentService service;
    private final StationAttachment.Report attachment;
    private final String graphVersion;
    private final AtomicReference<SegmentLoads> latest = new AtomicReference<>();
    private final Timer computeTimer;
    private OdSnapshot lastSnapshot;

    AssignmentRunner(SupervisionProperties properties, StationCatalog catalog, LiveView liveView, SegmentPublisher publisher,
                     ObjectMapper json, MeterRegistry meters) {
        var config = properties.assignment();
        var graph = new GraphLoader(json).load(Path.of(config.graphFile()));
        var attach = new StationAttachment(graph, catalog.stations(), config.attachRadiusM());
        this.service = new AssignmentService(graph, new ShortestPaths(graph, attach, config.pathCacheSize()), config.minVehicles());
        this.attachment = attach.report();
        this.graphVersion = graph.version();
        this.liveView = liveView;
        this.publisher = publisher;
        this.computeTimer = Timer.builder("toll.segments.compute").description("Durée d'un cycle d'affectation (s)").register(meters);
        Gauge.builder("toll.segments.path.cache", service, AssignmentService::cachedPaths).description("Chemins en cache").register(meters);
        Gauge.builder("toll.segments.routed.ratio", latest, l -> l.get() == null ? Double.NaN : l.get().routedRatio())
                .description("Part des véhicules O/D affectés à un chemin du graphe (gares rattachées et reliées)")
                .register(meters);
        LOG.info("Graphe {} : {} nœuds, {} arêtes ; {} gares rattachées, {} sans rattachement (rayon {} m)", graph.version(),
                graph.nodeCount(), graph.edges().size(), attachment.attached(), attachment.unattached().size(), config.attachRadiusM());
    }

    @Scheduled(fixedDelayString = "PT10S", initialDelayString = "PT15S")
    void compute() {
        liveView.odSnapshot().filter(snapshot -> snapshot != lastSnapshot).ifPresent(snapshot -> {
            lastSnapshot = snapshot;
            try {
                var loads = computeTimer.record(() -> service.assign(snapshot));
                latest.set(loads);
                publisher.publishSegments(loads);
            } catch (RuntimeException e) {
                LOG.error("Échec de l'affectation de la charge des tronçons", e);
            }
        });
    }

    public Optional<SegmentLoads> latest() {
        return Optional.ofNullable(latest.get());
    }

    /** Contrôle de rattachement des gares au graphe (critère de la phase 2 : moins de 500 m). */
    public GraphDiagnostic diagnostic() {
        return new GraphDiagnostic(graphVersion, attachment.attached(), attachment.unattached().size(),
                Math.round(attachment.maxAttachedM()),
                attachment.unattached().stream().limit(20).map(u -> u.stationId() + " (" + Math.round(u.nearestM()) + " m)").toList());
    }
}
