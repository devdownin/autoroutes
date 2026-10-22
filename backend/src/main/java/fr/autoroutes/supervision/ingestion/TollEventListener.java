package fr.autoroutes.supervision.ingestion;

import fr.autoroutes.supervision.SupervisionProperties;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import io.micrometer.core.instrument.MeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.listener.ConsumerSeekAware;
import org.springframework.stereotype.Component;

/**
 * Consommation du topic d'événements. Parsing dans les threads de consommation (parallélisme par partition),
 * puis remise ordonnée à l'écrivain unique. Démarrage manuel, après restauration du point de reprise.
 */
@Component
public class TollEventListener implements ConsumerSeekAware {

    public static final String LISTENER_ID = "toll-events";
    private static final Logger LOG = LoggerFactory.getLogger(TollEventListener.class);

    private final TollEventParser parser;
    private final TollEventSink sink;
    private final RejectionPublisher rejections;
    private final SupervisionProperties properties;
    private final Clock clock;
    private final ResumeOffsets resumeOffsets;
    private final MeterRegistry meters;
    private final Set<TopicPartition> positioned = ConcurrentHashMap.newKeySet();

    TollEventListener(TollEventParser parser, TollEventSink sink, RejectionPublisher rejections,
                      SupervisionProperties properties, Clock clock, ResumeOffsets resumeOffsets, MeterRegistry meters) {
        this.parser = parser;
        this.sink = sink;
        this.rejections = rejections;
        this.properties = properties;
        this.clock = clock;
        this.resumeOffsets = resumeOffsets;
        this.meters = meters;
    }

    @KafkaListener(id = LISTENER_ID, idIsGroup = false, topics = "${supervision.kafka.topic}", autoStartup = "false")
    void onRecord(ConsumerRecord<String, String> record) {
        switch (parser.parse(record.value())) {
            case ParseResult.Valid valid -> sink.submit(IncomingEvent.fromKafka(record.partition(), record.offset(), valid.event()));
            case ParseResult.Rejected rejected -> {
                meters.counter("toll.events.rejected", "reason", rejected.reason().name()).increment();
                rejections.publish(record.partition(), record.offset(), rejected.eventId(), rejected.reason(), rejected.field());
            }
        }
    }

    /**
     * Premier positionnement de chaque partition : offset du point de reprise, sinon minuit à Paris (reconstitution du cumul du jour).
     * Lors d'un rééquilibrage ultérieur, la position commitée est conservée.
     */
    @Override
    public void onPartitionsAssigned(Map<TopicPartition, Long> assignments, ConsumerSeekCallback callback) {
        var initialOffsets = resumeOffsets.get();
        var fromMidnight = new ArrayList<TopicPartition>();
        for (var partition : assignments.keySet()) {
            if (!positioned.add(partition)) {
                continue;
            }
            var offset = initialOffsets.get(partition.partition());
            if (offset != null) {
                callback.seek(partition.topic(), partition.partition(), offset);
            } else {
                fromMidnight.add(partition);
            }
        }
        if (!fromMidnight.isEmpty()) {
            var midnight = LocalDate.now(clock.withZone(properties.zone())).atStartOfDay(properties.zone()).toInstant();
            LOG.info("Partitions {} sans point de reprise : lecture depuis {}", fromMidnight, midnight);
            callback.seekToTimestamp(fromMidnight, midnight.toEpochMilli());
        }
    }
}
