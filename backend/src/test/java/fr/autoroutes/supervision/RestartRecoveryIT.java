package fr.autoroutes.supervision;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import fr.autoroutes.supervision.aggregation.LiveView;
import fr.autoroutes.supervision.aggregation.Snapshot;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Arrêt puis redémarrage de l'application : l'état repart du point de reprise final et la consommation de ses offsets.
 * Les événements rejoués par le producteur (doublons) ne sont jamais comptés deux fois.
 */
@Testcontainers
class RestartRecoveryIT {

    @Container
    static final KafkaContainer KAFKA = new KafkaContainer("apache/kafka:4.1.0");

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final List<String> STATIONS = List.of("La Boisse", "Bellegarde Sortie", "Nangy", "Beaupont", "Sylans");

    @BeforeAll
    static void createTopic() throws Exception {
        try (var admin = AdminClient.create(Map.of("bootstrap.servers", KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic("toll-events", 3, (short) 1))).all().get();
        }
    }

    @Test
    void restartResumesFromCheckpointWithoutDoubleCounting() {
        var firstBatch = events(90);
        publish(firstBatch);
        publish(firstBatch.subList(0, 10));

        String firstEpoch;
        try (var app = start()) {
            awaitTotal(app, 90);
            firstEpoch = snapshot(app).epoch();
        }

        var secondBatch = events(50);
        publish(secondBatch);
        publish(firstBatch.subList(20, 25));

        try (var app = start()) {
            awaitTotal(app, 140);
            assertThat(snapshot(app).epoch()).isNotEqualTo(firstEpoch);
            await().during(Duration.ofSeconds(3)).atMost(Duration.ofSeconds(5)).until(() -> total(app) == 140);
        }

        // L'historique a été écrit avec chaque point de reprise final : exactement les 140 passages, dans chaque résolution.
        try (var connection = java.sql.DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             var statement = connection.createStatement()) {
            for (var table : List.of("station_minute", "station_quarter", "station_hour")) {
                var result = statement.executeQuery("select coalesce(sum(entries + exits), 0) from " + table);
                result.next();
                assertThat(result.getLong(1)).as(table).isEqualTo(140);
            }
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ConfigurableApplicationContext start() {
        return new SpringApplicationBuilder(SupervisionApplication.class).run(
                "--server.port=0",
                "--spring.kafka.bootstrap-servers=" + KAFKA.getBootstrapServers(),
                "--spring.datasource.url=" + POSTGRES.getJdbcUrl(),
                "--spring.datasource.username=" + POSTGRES.getUsername(),
                "--spring.datasource.password=" + POSTGRES.getPassword(),
                // Seul le point de reprise final (arrêt propre) doit servir à la reprise.
                "--supervision.aggregation.checkpoint-interval=1h");
    }

    private static void awaitTotal(ConfigurableApplicationContext app, long expected) {
        await().atMost(Duration.ofSeconds(60)).until(() -> total(app) == expected);
    }

    private static long total(ConfigurableApplicationContext app) {
        return snapshot(app).stations().stream().mapToLong(s -> s.today().entries() + s.today().exits()).sum();
    }

    private static Snapshot snapshot(ConfigurableApplicationContext app) {
        return app.getBean(LiveView.class).snapshot().orElseThrow();
    }

    private static List<String> events(int count) {
        var events = new ArrayList<String>();
        for (var i = 0; i < count; i++) {
            events.add("""
                    {"eventId":"%s","stationName":"%s","type":"%s","eventTime":"%s"}"""
                    .formatted(UUID.randomUUID(), STATIONS.get(i % STATIONS.size()), i % 2 == 0 ? "ENTRY" : "EXIT", Instant.now()));
        }
        return events;
    }

    private static void publish(List<String> events) {
        try (var producer = new KafkaProducer<>(Map.<String, Object>of("bootstrap.servers", KAFKA.getBootstrapServers()),
                new StringSerializer(), new StringSerializer())) {
            events.forEach(e -> producer.send(new ProducerRecord<>("toll-events", e)));
        }
    }
}
