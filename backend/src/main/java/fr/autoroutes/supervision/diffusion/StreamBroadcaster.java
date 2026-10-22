package fr.autoroutes.supervision.diffusion;

import fr.autoroutes.supervision.SupervisionProperties;
import fr.autoroutes.supervision.aggregation.Delta;
import fr.autoroutes.supervision.aggregation.Freshness;
import fr.autoroutes.supervision.aggregation.OdUpdate;
import fr.autoroutes.supervision.aggregation.ReplayBuffer;
import fr.autoroutes.supervision.aggregation.Snapshot;
import fr.autoroutes.supervision.aggregation.StreamEpoch;
import fr.autoroutes.supervision.aggregation.StreamPublisher;
import fr.autoroutes.supervision.assignment.SegmentLoads;
import fr.autoroutes.supervision.assignment.SegmentPublisher;
import fr.autoroutes.supervision.referentiel.StationCatalog;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.json.JsonMapper;

/**
 * Diffusion SSE. Un seul verrou ordonne publications et connexions : un client inscrit reçoit soit les deltas manquants
 * (reprise par Last-Event-ID), soit le snapshot courant, puis tous les deltas suivants, sans trou ni doublon.
 */
@Component
public class StreamBroadcaster implements StreamPublisher, SegmentPublisher {

    private final JsonMapper json;
    private final Clock clock;
    private final String epoch;
    private final String referentielVersion;
    private final SupervisionProperties.Stream config;
    private final ReplayBuffer replay;
    private final ReentrantLock lock = new ReentrantLock();
    private final List<ClientChannel> clients = new ArrayList<>();
    private final StreamFrame resyncFrame;
    private Snapshot snapshot;
    private StreamFrame lastOd;
    private StreamFrame lastFreshness;
    private StreamFrame lastSegments;

    StreamBroadcaster(JsonMapper json, Clock clock, StreamEpoch epoch, StationCatalog catalog,
                      SupervisionProperties properties, MeterRegistry meters) {
        this.json = json;
        this.clock = clock;
        this.epoch = epoch.value();
        this.referentielVersion = catalog.version();
        this.config = properties.stream();
        this.replay = new ReplayBuffer(this.epoch, config.replayCapacity());
        this.resyncFrame = frame("resync", null, null, Map.of("reason", "client-trop-lent"));
        meters.gauge("sse.clients", clients, List::size);
    }

    /** @param lastEventId en-tête Last-Event-ID (« epoch:seq ») envoyé par EventSource à la reconnexion, ou null */
    public SseEmitter connect(String lastEventId) {
        var emitter = new SseEmitter(config.connectionTimeout().toMillis());
        lock.lock();
        try {
            if (snapshot == null) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Démarrage en cours");
            }
            if (clients.size() >= config.maxClients()) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Nombre maximal de connexions atteint");
            }
            var channel = new ClientChannel(emitter, config.clientQueueCapacity(), resyncFrame, this::remove);
            initialFrames(lastEventId).forEach(channel::offer);
            clients.add(channel);
            channel.start();
        } finally {
            lock.unlock();
        }
        return emitter;
    }

    public int clientCount() {
        lock.lock();
        try {
            return clients.size();
        } finally {
            lock.unlock();
        }
    }

    @Override
    public void publishSnapshot(Snapshot initial) {
        lock.lock();
        try {
            snapshot = initial;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public void publishDelta(Delta delta, Snapshot snapshotAfterDelta) {
        var frame = frame("delta", delta.seq(), delta.watermark(), Map.of("stations", delta.stations()));
        lock.lock();
        try {
            replay.append(delta);
            snapshot = snapshotAfterDelta;
            broadcast(frame);
        } finally {
            lock.unlock();
        }
    }

    @Override
    public void publishOd(OdUpdate update) {
        var frame = frame("od", null, snapshotWatermark(), Map.of(
                "window", update.window(), "nature", "OBSERVED", "minVehicles", update.minVehicles(), "flows", update.flows()));
        lock.lock();
        try {
            lastOd = frame;
            broadcast(frame);
        } finally {
            lock.unlock();
        }
    }

    @Override
    public void publishSegments(SegmentLoads loads) {
        var frame = frame("segments", null, snapshotWatermark(), Map.of("window", loads.window().toString(), "nature", "ESTIMATED",
                "graphVersion", loads.graphVersion(), "algorithm", loads.algorithm(), "loads", loads.loads()));
        lock.lock();
        try {
            lastSegments = frame;
            broadcast(frame);
        } finally {
            lock.unlock();
        }
    }

    @Override
    public void publishFreshness(Freshness freshness) {
        var frame = frame("freshness", null, snapshotWatermark(), freshness);
        lock.lock();
        try {
            lastFreshness = frame;
            broadcast(frame);
        } finally {
            lock.unlock();
        }
    }

    /** Garde les proxys ouverts et permet au client de détecter un serveur muet. */
    @Scheduled(fixedRateString = "PT15S")
    void heartbeat() {
        var frame = frame("heartbeat", null, null, Map.of());
        lock.lock();
        try {
            broadcast(frame);
        } finally {
            lock.unlock();
        }
    }

    private List<StreamFrame> initialFrames(String lastEventId) {
        var frames = new ArrayList<StreamFrame>();
        resume(lastEventId).ifPresentOrElse(
                missed -> missed.forEach(d -> frames.add(frame("delta", d.seq(), d.watermark(), Map.of("stations", d.stations())))),
                () -> frames.add(frame("snapshot", snapshot.seq(), snapshot.watermark(),
                        Map.of("stations", snapshot.stations(), "referentielVersion", referentielVersion))));
        if (lastOd != null) {
            frames.add(lastOd);
        }
        if (lastSegments != null) {
            frames.add(lastSegments);
        }
        if (lastFreshness != null) {
            frames.add(lastFreshness);
        }
        return frames;
    }

    private Optional<List<Delta>> resume(String lastEventId) {
        if (lastEventId == null) {
            return Optional.empty();
        }
        var separator = lastEventId.lastIndexOf(':');
        if (separator <= 0) {
            return Optional.empty();
        }
        try {
            return replay.after(lastEventId.substring(0, separator), Long.parseLong(lastEventId.substring(separator + 1)));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private void broadcast(StreamFrame frame) {
        // Itération sur une copie : un client saturé se retire de la liste pendant la diffusion.
        for (var client : List.copyOf(clients)) {
            client.offer(frame);
        }
    }

    private void remove(ClientChannel channel) {
        lock.lock();
        try {
            clients.remove(channel);
        } finally {
            lock.unlock();
        }
    }

    private Instant snapshotWatermark() {
        lock.lock();
        try {
            return snapshot == null ? null : snapshot.watermark();
        } finally {
            lock.unlock();
        }
    }

    private StreamFrame frame(String type, Long seq, Instant watermark, Object payload) {
        var data = json.writeValueAsString(new StreamMessage(type, epoch, seq, clock.instant(), watermark, payload));
        return new StreamFrame(type, seq == null ? null : epoch + ":" + seq, data);
    }
}
