package fr.autoroutes.simulator;

import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Émission au débit configuré, par lots toutes les 100 ms (la partie fractionnaire est reportée au lot suivant). */
@Component
class SimulatorRunner {

    private static final Logger LOG = LoggerFactory.getLogger(SimulatorRunner.class);
    private static final double BATCHES_PER_SECOND = 10;

    private final EventFactory factory;
    private final KafkaTemplate<String, String> kafka;
    private final SimulatorProperties properties;
    private final Clock clock;
    private double carry;
    private long sent;
    private long lastReport;

    SimulatorRunner(EventFactory factory, KafkaTemplate<String, String> kafka, SimulatorProperties properties,
                    StationPool pool, Clock clock) {
        this.factory = factory;
        this.kafka = kafka;
        this.properties = properties;
        this.clock = clock;
        LOG.info("Simulation de {} gares à {} évt/s vers « {} » (DONNÉES SIMULÉES)", pool.size(), properties.rate(), properties.topic());
    }

    @Scheduled(fixedRate = 100)
    void emit() {
        carry += properties.rate() / BATCHES_PER_SECOND;
        var count = (int) carry;
        carry -= count;
        for (var i = 0; i < count; i++) {
            var record = factory.next();
            kafka.send(properties.topic(), record.key(), record.payload());
        }
        sent += count;
        var now = clock.millis();
        if (now - lastReport >= 60_000) {
            LOG.info("{} événements simulés émis", sent);
            lastReport = now;
        }
    }
}
