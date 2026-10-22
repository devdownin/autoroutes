package fr.autoroutes.supervision;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.kafka.core.KafkaTemplate;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Bout en bout avec Kafka et PostgreSQL réels : ingestion, déduplication, quarantaine, rejets, API, SSE.
 * Conteneurs gérés par Spring (@ServiceConnection sans @Container) : arrêtés APRÈS le contexte,
 * l'application peut donc écrire son point de reprise final à l'arrêt.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"supervision.aggregation.checkpoint-interval=2s", "supervision.assignment.graph-file=src/test/resources/graph-it.json"})
class SupervisionIT {

    @ServiceConnection
    static final KafkaContainer KAFKA = new KafkaContainer("apache/kafka:4.1.0");

    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final String UNKNOWN = "Gare Test Inconnue " + UUID.randomUUID();

    @LocalServerPort
    int port;

    @Autowired
    KafkaTemplate<String, String> kafka;

    @Autowired
    JsonMapper json;

    @Autowired
    fr.autoroutes.supervision.history.PartitionManager partitions;

    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeAll
    static void createTopics() throws Exception {
        KAFKA.start();
        try (var admin = AdminClient.create(Map.of("bootstrap.servers", KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic("toll-events", 3, (short) 1), new NewTopic("toll-events.rejected", 1, (short) 1)))
                    .all().get();
        }
    }

    @Test
    void countsValidEventsOnceQuarantinesUnknownNamesAndRejectsInvalidPayloads() throws Exception {
        var stations = new String[] {"La Boisse", "Bellegarde Sortie", "Nangy"};
        var baseline = totalToday(stations);
        var exitId = UUID.randomUUID().toString();
        send(event(UUID.randomUUID().toString(), "La Boisse", "ENTRY", null));
        send(event(exitId, "Bellegarde Sortie", "EXIT", "Nangy"));
        send(event(exitId, "Bellegarde Sortie", "EXIT", "Nangy"));
        send(event(UUID.randomUUID().toString(), UNKNOWN, "ENTRY", null));
        kafka.send("toll-events", "x", "pas du json").get();

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            assertThat(totalToday(stations)).isEqualTo(baseline + 2);
            assertThat(get("/api/v1/diagnostic").path("quarantinePending").asLong()).isEqualTo(1);
        });
        var writer = get("/api/v1/diagnostic").path("writer");
        assertThat(writer.path("outcomes").path("duplicate").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(writer.path("odStatuses").path("RECORDED").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(rejectedReasons()).contains("INVALID_JSON");
        var metrics = http.send(HttpRequest.newBuilder(uri("/actuator/prometheus")).build(), HttpResponse.BodyHandlers.ofString()).body();
        assertThat(metrics).contains("toll_events_rejected_total{reason=\"INVALID_JSON\"}", "toll_watermark_lag_seconds",
                "toll_freshness_status", "toll_consumer_lag", "toll_events_total{result=\"duplicate\"}");

        var aliases = Files.readString(Path.of("../referentiel/alias-gares.csv"), StandardCharsets.UTF_8);
        var nangy = stationId("Nangy");
        var upload = http.send(HttpRequest.newBuilder(uri("/api/v1/admin/aliases"))
                .header("Content-Type", "text/csv")
                .POST(HttpRequest.BodyPublishers.ofString(aliases + UNKNOWN + ";" + nangy + "\n")).build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(upload.statusCode()).isEqualTo(200);

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            assertThat(totalToday(stations)).isEqualTo(baseline + 3);
            assertThat(get("/api/v1/diagnostic").path("quarantinePending").asLong()).isZero();
        });
    }

    @Test
    void streamsSnapshotThenDeltasAndResumesWithLastEventId() {
        assertTimeoutPreemptively(Duration.ofSeconds(60), () -> {
            String lastId;
            try (var reader = openStream(null)) {
                assertThat(nextEvent(reader).type()).isEqualTo("snapshot");
                send(event(UUID.randomUUID().toString(), "Ablis", "ENTRY", null));
                var delta = nextEventOfType(reader, "delta");
                lastId = delta.id();
                assertThat(lastId).matches("[0-9a-f-]{36}:\\d+");
                assertThat(delta.data()).contains("\"type\":\"delta\"");
            }
            try (var resumed = openStream(lastId)) {
                // Reprise : les deltas manquants (aucun ici) puis le flux courant, sans snapshot.
                assertThat(nextEvent(resumed).type()).isNotEqualTo("snapshot");
            }
            try (var otherEpoch = openStream("00000000-0000-0000-0000-000000000000:3")) {
                assertThat(nextEvent(otherEpoch).type()).isEqualTo("snapshot");
            }
        });
    }

    @Test
    void historyMatchesLiveTotalsInEveryResolutionAndValidatesRanges() throws Exception {
        var from = Instant.now().minus(Duration.ofHours(3)).truncatedTo(java.time.temporal.ChronoUnit.HOURS);
        var to = Instant.now().plus(Duration.ofHours(1));
        var baseline = totalToday("Sylans", "Beaupont");
        send(event(UUID.randomUUID().toString(), "Sylans", "ENTRY", null));
        send(event(UUID.randomUUID().toString(), "Beaupont", "EXIT", "Sylans"));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            assertThat(totalToday("Sylans", "Beaupont")).isEqualTo(baseline + 2);
            for (var step : List.of("PT1M", "PT15M", "PT1H")) {
                assertThat(historyTotal("Sylans", step, from, to) + historyTotal("Beaupont", step, from, to))
                        .as("historique %s = temps réel", step).isEqualTo(totalToday("Sylans", "Beaupont"));
            }
        });
        assertThat(get("/api/v1/history/network?from=%s&to=%s&step=PT1H".formatted(from, to)).path("points").size()).isPositive();
        assertThat(get("/api/v1/history/minutes?from=%s&to=%s".formatted(Instant.now().minus(Duration.ofHours(1)), to)).size()).isPositive();
        assertThat(get("/api/v1/history/od?from=%s&to=%s&minVehicles=1".formatted(from, to)).path("result").path("minVehicles").asLong()).isEqualTo(3);

        var tooLong = http.send(HttpRequest.newBuilder(uri("/api/v1/history/minutes?from=%s&to=%s".formatted(from, to))).build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(tooLong.statusCode()).isEqualTo(400);
        assertThat(tooLong.body()).contains("Plage trop longue");
    }

    @Test
    void originDestinationFlowsAreFilteredThresholdedAndReconciledLiveAndInHistory() throws Exception {
        for (var i = 0; i < 4; i++) {
            send(event(UUID.randomUUID().toString(), "Montabon", "ENTRY", null));
            send(event(UUID.randomUUID().toString(), "Mont-Choisy Sortie", "EXIT", "Montabon"));
        }
        send(event(UUID.randomUUID().toString(), "Chignin Barriere", "EXIT", null));
        var origin = stationId("Montabon");
        var destination = stationId("Mont-Choisy Sortie");
        var from = Instant.now().minus(Duration.ofHours(1));
        var to = Instant.now().plus(Duration.ofHours(1));

        await().atMost(Duration.ofSeconds(60)).untilAsserted(() -> {
            var stations = get("/api/v1/od?limit=2000&department=51");
            assertThat(stations.path("minVehicles").asLong()).isEqualTo(3);
            assertThat(stations.path("flows")).anySatisfy(flow -> {
                assertThat(flow.path("originId").asString()).isEqualTo(origin);
                assertThat(flow.path("destinationId").asString()).isEqualTo(destination);
                assertThat(flow.path("vehicles").asLong()).isGreaterThanOrEqualTo(4);
            });
        });
        var departments = get("/api/v1/od?level=DEPARTMENT&department=51&role=DESTINATION");
        assertThat(departments.path("flows")).anySatisfy(flow -> {
            assertThat(flow.path("originId").asString()).isEqualTo("72");
            assertThat(flow.path("destinationId").asString()).isEqualTo("51");
        });
        assertThat(get("/api/v1/od?department=72&role=DESTINATION").path("flows")).noneSatisfy(flow ->
                assertThat(flow.path("originId").asString()).isEqualTo(origin));
        assertThat(get("/api/v1/od?axis=A0028&role=ORIGIN").path("flows")).anySatisfy(flow ->
                assertThat(flow.path("originId").asString()).isEqualTo(origin));

        var coverage = get("/api/v1/od/coverage");
        assertThat(coverage.path("gap").asLong()).as("sorties des gares = issues O/D").isZero();
        assertThat(coverage.path("coverage").path("recorded").asLong()).isGreaterThanOrEqualTo(4);
        assertThat(coverage.path("coverage").path("openSystem").asLong()).isPositive();

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(
                get("/api/v1/history/od?from=%s&to=%s&department=51".formatted(from, to)).path("result").path("flows"))
                .anySatisfy(flow -> assertThat(flow.path("destinationId").asString()).isEqualTo(destination)));
        assertThat(get("/api/v1/history/od?from=%s&to=%s&level=DEPARTMENT&department=51&role=DESTINATION".formatted(from, to))
                .path("result").path("flows")).anySatisfy(flow -> assertThat(flow.path("originId").asString()).isEqualTo("72"));

        // Charge estimée : le flux Montabon → Mont-Choisy (≥ 4 véhicules) est affecté à l'unique tronçon du graphe de test.
        await().atMost(Duration.ofSeconds(60)).untilAsserted(() -> {
            var segments = get("/api/v1/segments/load");
            assertThat(segments.path("algorithm").asString()).isEqualTo("all-or-nothing-fastest-v1");
            assertThat(segments.path("graphVersion").asString()).startsWith("graph-");
            assertThat(segments.path("loads")).anySatisfy(load -> {
                assertThat(load.path("segmentId").asString()).isEqualTo("it-1");
                assertThat(load.path("vehicles").asLong()).isGreaterThanOrEqualTo(4);
            });
        });
        assertThat(get("/api/v1/diagnostic").path("graph").path("attachedStations").asInt()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void dropsPartitionsBeyondRetention() {
        var old = Instant.now().minus(Duration.ofDays(30));
        partitions.ensure("station_minute", old);
        partitions.ensure("station_quarter", old);

        var dropped = partitions.dropExpired(Instant.now());

        assertThat(dropped).anyMatch(name -> name.startsWith("station_minute_p"));
        assertThat(dropped).noneMatch(name -> name.startsWith("station_quarter_p"));
    }

    @Test
    void servesReferentielWithEtag() throws Exception {
        var first = http.send(HttpRequest.newBuilder(uri("/api/v1/referentiel/stations")).build(), HttpResponse.BodyHandlers.ofString());
        var etag = first.headers().firstValue("ETag").orElseThrow();
        var second = http.send(HttpRequest.newBuilder(uri("/api/v1/referentiel/stations")).header("If-None-Match", etag).build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(json.readTree(first.body()).path("features").size()).isEqualTo(667);
        assertThat(second.statusCode()).isEqualTo(304);
    }

    private record SseEvent(String type, String id, String data) {
    }

    private BufferedReader openStream(String lastEventId) throws IOException, InterruptedException {
        var request = HttpRequest.newBuilder(uri("/api/v1/stream"));
        if (lastEventId != null) {
            request.header("Last-Event-ID", lastEventId);
        }
        var response = http.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
        assertThat(response.statusCode()).isEqualTo(200);
        return new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8));
    }

    private static SseEvent nextEvent(BufferedReader reader) throws IOException {
        String type = null;
        String id = null;
        var data = new StringBuilder();
        for (var line = reader.readLine(); line != null; line = reader.readLine()) {
            if (line.isEmpty() && type != null) {
                return new SseEvent(type, id, data.toString());
            }
            if (line.startsWith("event:")) {
                type = line.substring(6);
            } else if (line.startsWith("id:")) {
                id = line.substring(3);
            } else if (line.startsWith("data:")) {
                data.append(line.substring(5));
            }
        }
        throw new IOException("Flux SSE fermé");
    }

    private static SseEvent nextEventOfType(BufferedReader reader, String type) throws IOException {
        for (var event = nextEvent(reader); ; event = nextEvent(reader)) {
            if (event.type().equals(type)) {
                return event;
            }
        }
    }

    private List<String> rejectedReasons() {
        var props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "it-" + UUID.randomUUID());
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        try (var consumer = new KafkaConsumer<>(props, new StringDeserializer(), new StringDeserializer())) {
            consumer.subscribe(List.of("toll-events.rejected"));
            var deadline = Instant.now().plusSeconds(20);
            while (Instant.now().isBefore(deadline)) {
                var records = consumer.poll(Duration.ofSeconds(1));
                if (!records.isEmpty()) {
                    var reasons = new java.util.ArrayList<String>();
                    records.forEach(r -> {
                        assertThat(r.value()).as("jamais de message brut dans le topic de rejet").isNull();
                        reasons.add(new String(r.headers().lastHeader("x-reason").value(), StandardCharsets.UTF_8));
                    });
                    return reasons;
                }
            }
            return List.of();
        }
    }

    private void send(String payload) throws Exception {
        kafka.send("toll-events", "it", payload).get();
    }

    private String event(String id, String station, String type, String entry) {
        var event = new java.util.LinkedHashMap<String, Object>();
        event.put("eventId", id);
        event.put("stationName", station);
        event.put("type", type);
        event.put("eventTime", Instant.now().toString());
        if (entry != null) {
            event.put("entryStationName", entry);
        }
        event.put("plate", "AB-123-CD");
        return json.writeValueAsString(event);
    }

    /** Cumul du jour des gares données : chaque test travaille sur ses propres gares (contexte partagé entre tests). */
    private long totalToday(String... stationNames) throws Exception {
        var ids = java.util.Arrays.stream(stationNames).map(SupervisionIT::stationId).toList();
        long total = 0;
        for (var station : get("/api/v1/snapshot").path("stations")) {
            if (ids.contains(station.path("stationId").asString())) {
                total += station.path("today").path("entries").asLong() + station.path("today").path("exits").asLong();
            }
        }
        return total;
    }

    private long historyTotal(String stationName, String step, Instant from, Instant to) throws Exception {
        long total = 0;
        var series = get("/api/v1/stations/%s/history?from=%s&to=%s&step=%s".formatted(stationId(stationName), from, to, step));
        for (var point : series.path("points")) {
            total += point.path("entries").asLong() + point.path("exits").asLong();
        }
        return total;
    }

    private static String stationId(String name) {
        try {
            return Files.readAllLines(Path.of("../referentiel/alias-gares.csv"), StandardCharsets.UTF_8).stream()
                    .filter(l -> l.startsWith(name + ";")).findFirst().orElseThrow().split(";")[1];
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    private JsonNode get(String path) throws Exception {
        var response = http.send(HttpRequest.newBuilder(uri(path)).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return json.readTree(response.body());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }
}
