package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.SupervisionProperties;
import fr.autoroutes.supervision.ingestion.ConsumerLagProbe;
import fr.autoroutes.supervision.ingestion.EventDeduplicator;
import fr.autoroutes.supervision.ingestion.IncomingEvent;
import fr.autoroutes.supervision.ingestion.QuarantineStore;
import fr.autoroutes.supervision.ingestion.RejectionPublisher;
import fr.autoroutes.supervision.ingestion.ResumeOffsets;
import fr.autoroutes.supervision.ingestion.TollEventListener;
import fr.autoroutes.supervision.ingestion.TollEventSink;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import fr.autoroutes.supervision.referentiel.LogicalStation;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.stereotype.Component;

/**
 * Écrivain unique : seul thread à modifier l'état (aucun verrou sur le chemin critique).
 * Il traite la file d'événements, publie deltas, flux O/D et fraîcheur à intervalles fixes,
 * et produit des points de reprise cohérents (état + offsets capturés au même instant).
 *
 * <p>Démarrage : restauration du point de reprise, PUIS démarrage de la consommation Kafka positionnée sur ses offsets.
 * Arrêt : consommation stoppée, file vidée, point de reprise final synchrone.
 */
@Component
public class AggregationWriter implements TollEventSink, SmartLifecycle {

    private static final Logger LOG = LoggerFactory.getLogger(AggregationWriter.class);
    private static final int DRAIN_BATCH = 4_096;

    private final SupervisionProperties.Aggregation config;
    private final Clock clock;
    private final EventProcessor processor;
    private final AggregationState state;
    private final OdCounters od;
    private final EventDeduplicator deduplicator;
    private final WatermarkTracker watermarks;
    private final DeltaComputer deltas;
    private final FreshnessPolicy freshnessPolicy;
    private final StreamPublisher publisher;
    private final LiveView liveView;
    private final CheckpointStore checkpoints;
    private final CheckpointTransaction checkpointTransaction;
    private final HistoryIncrements history;
    private final CheckpointCodec codec;
    private final QuarantineStore quarantine;
    private final RejectionPublisher rejections;
    private final ConsumerLagProbe lagProbe;
    private final ResumeOffsets resumeOffsets;
    private final KafkaListenerEndpointRegistry listenerRegistry;
    private final String epoch;
    private final List<String> stationIds;
    private final BlockingQueue<IncomingEvent> queue;
    // Persistance hors du chemin critique ; un seul thread : les quarantaines précèdent le point de reprise qui les couvre.
    private final ExecutorService persistence = Executors.newSingleThreadExecutor(Thread.ofPlatform().name("aggregation-persistence").factory());
    private final Map<Integer, Long> nextOffsets = new HashMap<>();
    private final List<QuarantineMark> quarantineMarks = new ArrayList<>();
    // Lot dont l'écriture a échoué : réintégré au point de reprise suivant (dont les offsets le couvrent aussi).
    private final AtomicReference<HistoryBatch> failedHistory = new AtomicReference<>(HistoryBatch.EMPTY);
    private final Map<String, AtomicLong> outcomes = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> odStatuses = new ConcurrentHashMap<>();
    private final Map<String, Counter> counters = new ConcurrentHashMap<>();
    private final MeterRegistry meters;

    private volatile boolean running;
    private Thread thread;
    private Instant lastProcessedAt;
    private Freshness lastFreshness;
    private Instant nextOdAt = Instant.MIN;
    private Instant nextFreshnessAt = Instant.MIN;
    private Instant nextCheckpointAt;
    private Future<?> checkpointInFlight;
    private volatile Instant lastCheckpointAt;
    private volatile long lastCheckpointBytes;

    @SuppressWarnings("java:S107")
    AggregationWriter(SupervisionProperties properties, Clock clock, EventProcessor processor, AggregationState state,
                      OdCounters od, EventDeduplicator deduplicator, WatermarkTracker watermarks, DeltaComputer deltas,
                      FreshnessPolicy freshnessPolicy, StreamPublisher publisher, LiveView liveView,
                      CheckpointStore checkpoints, CheckpointTransaction checkpointTransaction,
                      HistoryIncrements history, CheckpointCodec codec, QuarantineStore quarantine,
                      RejectionPublisher rejections, ConsumerLagProbe lagProbe, ResumeOffsets resumeOffsets,
                      KafkaListenerEndpointRegistry listenerRegistry, StreamEpoch epoch, StationCatalog catalog,
                      MeterRegistry meters) {
        this.config = properties.aggregation();
        this.clock = clock;
        this.processor = processor;
        this.state = state;
        this.od = od;
        this.deduplicator = deduplicator;
        this.watermarks = watermarks;
        this.deltas = deltas;
        this.freshnessPolicy = freshnessPolicy;
        this.publisher = publisher;
        this.liveView = liveView;
        this.checkpoints = checkpoints;
        this.checkpointTransaction = checkpointTransaction;
        this.history = history;
        this.codec = codec;
        this.quarantine = quarantine;
        this.rejections = rejections;
        this.lagProbe = lagProbe;
        this.resumeOffsets = resumeOffsets;
        this.listenerRegistry = listenerRegistry;
        this.epoch = epoch.value();
        this.stationIds = catalog.stations().stream().map(LogicalStation::id).toList();
        this.queue = new ArrayBlockingQueue<>(config.queueCapacity());
        this.meters = meters;
        meters.gauge("toll.writer.queue", queue, BlockingQueue::size);
        meters.gauge("toll.dedup.entries", deduplicator, EventDeduplicator::size);
    }

    @Override
    public void submit(IncomingEvent event) {
        try {
            while (running) {
                if (queue.offer(event, 1, TimeUnit.SECONDS)) {
                    return;
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        throw new IllegalStateException("Écrivain arrêté : événement non accepté");
    }

    @Override
    public void start() {
        restore();
        var initial = deltas.snapshot();
        liveView.update(initial);
        publisher.publishSnapshot(initial);
        nextCheckpointAt = clock.instant().plus(config.checkpointInterval());
        running = true;
        thread = Thread.ofPlatform().name("aggregation-writer").start(this::loop);
        resumeOffsets.set(nextOffsets);
        listenerRegistry.getListenerContainer(TollEventListener.LISTENER_ID).start();
        LOG.info("Écrivain démarré (epoch {}), consommation Kafka lancée", epoch);
    }

    @Override
    public void stop() {
        var container = listenerRegistry.getListenerContainer(TollEventListener.LISTENER_ID);
        if (container != null) {
            container.stop();
        }
        running = false;
        try {
            if (thread != null) {
                thread.join(Duration.ofSeconds(30));
            }
            // Barrière : les quarantaines déjà soumises sont écrites avant le point de reprise final qui les couvre.
            persistence.submit(() -> { }).get(30, TimeUnit.SECONDS);
            writeCheckpoint(captureCheckpoint());
            persistence.shutdown();
            persistence.awaitTermination(30, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            LOG.error("Point de reprise final non écrit", e);
        }
        LOG.info("Écrivain arrêté, point de reprise final écrit");
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    /** Démarre avant les conteneurs Kafka et s'arrête après eux. */
    @Override
    public int getPhase() {
        return 0;
    }

    private void loop() {
        var batch = new ArrayList<IncomingEvent>(DRAIN_BATCH);
        var nextTick = clock.instant().plus(config.tickInterval());
        while (running || !queue.isEmpty()) {
            try {
                var waitMs = Math.max(0, Duration.between(clock.instant(), nextTick).toMillis());
                var first = queue.poll(waitMs, TimeUnit.MILLISECONDS);
                if (first != null) {
                    handle(first);
                    queue.drainTo(batch, DRAIN_BATCH);
                    batch.forEach(this::handle);
                    batch.clear();
                }
                var now = clock.instant();
                if (!now.isBefore(nextTick)) {
                    tick(now);
                    nextTick = now.plus(config.tickInterval());
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (RuntimeException e) {
                LOG.error("Erreur dans la boucle de l'écrivain ; traitement poursuivi", e);
            }
        }
        tick(clock.instant());
    }

    private void handle(IncomingEvent incoming) {
        var event = incoming.event();
        var outcome = incoming.replay() ? processor.reprocess(event) : processor.process(incoming.partition(), event);
        if (!incoming.replay()) {
            nextOffsets.put(incoming.partition(), incoming.offset() + 1);
        }
        lastProcessedAt = clock.instant();
        switch (outcome) {
            case EventProcessor.Outcome.Applied applied -> {
                count(applied.historyCorrection() ? "correction" : "applied");
                countOd(applied.od());
                markReplayed(incoming, QuarantineStore.Status.APPLIED);
            }
            case EventProcessor.Outcome.Quarantined quarantined -> {
                count("quarantined");
                if (!incoming.replay()) {
                    persistence.execute(() -> quarantine.save(quarantined.event()));
                }
            }
            case EventProcessor.Outcome.Duplicate duplicate -> {
                count("duplicate");
                markReplayed(incoming, QuarantineStore.Status.DUPLICATE);
            }
            case EventProcessor.Outcome.Rejected rejected -> {
                count("too_late");
                if (incoming.replay()) {
                    markReplayed(incoming, QuarantineStore.Status.TOO_LATE);
                } else {
                    rejections.publish(incoming.partition(), incoming.offset(), rejected.eventId(), rejected.reason(), "eventTime");
                }
            }
        }
    }

    private void tick(Instant now) {
        var watermark = watermarks.watermark();
        watermark.flatMap(w -> deltas.tick(state, w)).ifPresent(delta -> {
            var snapshot = deltas.snapshot();
            liveView.update(snapshot);
            publisher.publishDelta(delta, snapshot);
        });
        if (watermark.isPresent() && !now.isBefore(nextOdAt)) {
            var update = new OdUpdate(config.odWindow().toString(), config.odMinVehicles(),
                    od.flows(watermark.get(), config.odWindow(), config.odMinVehicles(), config.odLimit()));
            liveView.update(update);
            publisher.publishOd(update);
            var window = config.odWindow();
            liveView.update(new OdSnapshot(watermark.get(), window, od.cells(watermark.get(), window), od.coverage(watermark.get(), window),
                    state.exitsBetween(OdCounters.firstMinute(watermark.get(), window), OdCounters.lastMinute(watermark.get()))));
            nextOdAt = now.plus(config.odInterval());
        }
        var consumerLag = lagProbe.lag();
        var freshness = freshnessPolicy.evaluate(now, lastProcessedAt, watermark, consumerLag, state, stationIds);
        if (freshness.visiblyDiffersFrom(lastFreshness) || !now.isBefore(nextFreshnessAt)) {
            liveView.update(freshness);
            publisher.publishFreshness(freshness);
            lastFreshness = freshness;
            nextFreshnessAt = now.plus(config.odInterval());
        }
        liveView.update(new WriterStats(epoch, watermark.orElse(null), freshness.watermarkLagSeconds(), consumerLag,
                queue.size(), deduplicator.size(), snapshot(outcomes), snapshot(odStatuses), lastCheckpointAt,
                lastCheckpointBytes, freshness.status()));
        if (!now.isBefore(nextCheckpointAt) && (checkpointInFlight == null || checkpointInFlight.isDone())) {
            var data = captureCheckpoint();
            checkpointInFlight = persistence.submit(() -> writeCheckpoint(data));
            nextCheckpointAt = now.plus(config.checkpointInterval());
        }
    }

    private record PendingCheckpoint(CheckpointData data, HistoryBatch history, List<QuarantineMark> marks) {
    }

    /** Sur le thread de l'écrivain : copie cohérente, l'encodage et l'écriture se font ensuite hors chemin critique. */
    private PendingCheckpoint captureCheckpoint() {
        var data = new CheckpointData(clock.instant(), Map.copyOf(nextOffsets), watermarks.export(), state.export(),
                od.export(), od.exportCoverage(), deduplicator.export());
        var batch = failedHistory.getAndSet(HistoryBatch.EMPTY).merge(history.drain());
        var marks = List.copyOf(quarantineMarks);
        quarantineMarks.clear();
        return new PendingCheckpoint(data, batch, marks);
    }

    private void writeCheckpoint(PendingCheckpoint pending) {
        try {
            var payload = codec.encode(pending.data());
            checkpointTransaction.commit(epoch, payload, pending.history(), pending.marks());
            lastCheckpointAt = pending.data().createdAt();
            lastCheckpointBytes = payload.length;
            meters.counter("toll.checkpoints").increment();
        } catch (RuntimeException e) {
            // Rien n'a été validé : l'historique est réintégré au prochain lot, les issues de rejeu restent à rejouer.
            failedHistory.accumulateAndGet(pending.history(), HistoryBatch::merge);
            meters.counter("toll.checkpoints.failed").increment();
            LOG.error("Échec du point de reprise", e);
        }
    }

    private void restore() {
        checkpoints.latest().map(codec::decode).ifPresentOrElse(data -> {
            state.restore(data.stations());
            od.restore(data.od(), data.odCoverage());
            deduplicator.restore(data.dedup());
            watermarks.restore(data.watermarks());
            nextOffsets.putAll(data.nextOffsets());
            LOG.info("Point de reprise du {} restauré : {} gares, offsets {}", data.createdAt(), data.stations().size(), data.nextOffsets());
        }, () -> LOG.info("Aucun point de reprise : reconstitution depuis minuit"));
    }

    private void markReplayed(IncomingEvent incoming, QuarantineStore.Status status) {
        if (incoming.replay()) {
            quarantineMarks.add(new QuarantineMark(incoming.event().eventId(), status));
        }
    }

    private void count(String result) {
        outcomes.computeIfAbsent(result, r -> new AtomicLong()).incrementAndGet();
        counters.computeIfAbsent(result, r -> meters.counter("toll.events", "result", r)).increment();
    }

    private void countOd(EventProcessor.OdStatus status) {
        if (status != EventProcessor.OdStatus.NOT_APPLICABLE) {
            odStatuses.computeIfAbsent(status.name(), s -> new AtomicLong()).incrementAndGet();
            counters.computeIfAbsent("od-" + status, s -> meters.counter("toll.od", "status", status.name())).increment();
        }
    }

    private static Map<String, Long> snapshot(Map<String, AtomicLong> values) {
        var copy = new HashMap<String, Long>();
        values.forEach((key, value) -> copy.put(key, value.get()));
        return copy;
    }
}
