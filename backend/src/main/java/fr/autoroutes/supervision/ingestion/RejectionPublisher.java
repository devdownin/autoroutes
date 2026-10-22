package fr.autoroutes.supervision.ingestion;

import fr.autoroutes.supervision.SupervisionProperties;
import java.nio.charset.StandardCharsets;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/**
 * Topic de rejet SANS le message brut (RGPD) : motif, champ, eventId et position d'origine en en-têtes.
 * Le message reste consultable à sa position dans le topic source par les personnes habilitées.
 */
@Component
public class RejectionPublisher {

    private static final Logger LOG = LoggerFactory.getLogger(RejectionPublisher.class);

    private final KafkaTemplate<String, String> kafka;
    private final String topic;

    RejectionPublisher(KafkaTemplate<String, String> kafka, SupervisionProperties properties) {
        this.kafka = kafka;
        this.topic = properties.kafka().rejectedTopic();
    }

    public void publish(int partition, long offset, String eventId, RejectReason reason, String field) {
        var headers = new RecordHeaders();
        headers.add("x-reason", bytes(reason.name()));
        headers.add("x-source-partition", bytes(Integer.toString(partition)));
        headers.add("x-source-offset", bytes(Long.toString(offset)));
        if (field != null) {
            headers.add("x-field", bytes(field));
        }
        if (eventId != null) {
            headers.add("x-event-id", bytes(eventId));
        }
        kafka.send(new ProducerRecord<>(topic, null, eventId, null, headers))
                .whenComplete((result, error) -> {
                    if (error != null) {
                        LOG.warn("Rejet non publié (partition {}, offset {}) : {}", partition, offset, error.getMessage());
                    }
                });
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}
