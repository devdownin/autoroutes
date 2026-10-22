package fr.autoroutes.supervision.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import tools.jackson.databind.json.JsonMapper;

class TollEventParserTest {

    private static final Instant NOW = Instant.parse("2026-10-22T08:00:00Z");
    private final TollEventParser parser = new TollEventParser(
            JsonMapper.builder().build(), Clock.fixed(NOW, ZoneOffset.UTC), ZoneId.of("Europe/Paris"));

    @Test
    void parsesExitWithEntryStationAndIgnoresUnknownFields() {
        var result = parser.parse("""
                {"eventId":"e-1","stationName":"La Boisse","type":"EXIT","eventTime":"2026-10-22T09:59:30+02:00",
                 "entryStationName":"Bellegarde Entrée","entryTime":"2026-10-22T09:20:00+02:00",
                 "vehicleCount":2,"vehicleClass":1,"plate":"AB-123-CD","simulated":true}
                """);

        assertThat(result).isInstanceOfSatisfying(ParseResult.Valid.class, valid -> {
            var event = valid.event();
            assertThat(event.eventTime()).isEqualTo(Instant.parse("2026-10-22T07:59:30Z"));
            assertThat(event.entryStation()).contains("Bellegarde Entrée");
            assertThat(event.entryTime()).isEqualTo(Instant.parse("2026-10-22T07:20:00Z"));
            assertThat(event.vehicleCount()).isEqualTo(2);
            assertThat(event.simulated()).isTrue();
            assertThat(event.toString()).doesNotContain("AB-123-CD");
        });
    }

    @Test
    void ignoresEntryStationOnEntryEventAndAppliesDefaults() {
        var result = parser.parse("""
                {"eventId":"e-2","stationName":"Nangy","type":"ENTRY","eventTime":"2026-10-22T07:00:00Z","entryStationName":"X"}
                """);

        assertThat(result).isInstanceOfSatisfying(ParseResult.Valid.class, valid -> {
            assertThat(valid.event().entryStation()).isEmpty();
            assertThat(valid.event().vehicleCount()).isEqualTo(1);
            assertThat(valid.event().vehicleClass()).isNull();
        });
    }

    @Test
    void readsTimeWithoutOffsetAsParisTimeAndPicksFirstOccurrenceOfAmbiguousHour() {
        // 25/10/2026 : 02:30 existe deux fois à Paris (CEST puis CET) ; la première est à 00:30Z.
        var parserAfterDst = new TollEventParser(JsonMapper.builder().build(),
                Clock.fixed(Instant.parse("2026-10-25T03:00:00Z"), ZoneOffset.UTC), ZoneId.of("Europe/Paris"));

        var result = parserAfterDst.parse("""
                {"eventId":"e-3","stationName":"Nangy","type":"ENTRY","eventTime":"2026-10-25T02:30:00"}
                """);

        assertThat(result).isInstanceOfSatisfying(ParseResult.Valid.class,
                valid -> assertThat(valid.event().eventTime()).isEqualTo(Instant.parse("2026-10-25T00:30:00Z")));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "not json                                                                                    | INVALID_JSON      |",
            "[1,2]                                                                                       | INVALID_JSON      |",
            "{\"stationName\":\"A\",\"type\":\"ENTRY\",\"eventTime\":\"2026-10-22T07:00:00Z\"}          | MISSING_FIELD     | eventId",
            "{\"eventId\":\"e\",\"stationName\":\"A\",\"type\":\"PASS\",\"eventTime\":\"2026-10-22T07:00:00Z\"} | INVALID_FIELD | type",
            "{\"eventId\":\"e\",\"stationName\":\" \",\"type\":\"ENTRY\",\"eventTime\":\"2026-10-22T07:00:00Z\"} | INVALID_FIELD | stationName",
            "{\"eventId\":\"e\",\"stationName\":\"A\",\"type\":\"ENTRY\",\"eventTime\":\"hier\"}            | INVALID_FIELD     | eventTime",
            "{\"eventId\":\"e\",\"stationName\":\"A\",\"type\":\"ENTRY\",\"eventTime\":\"2026-10-22T08:06:00Z\"} | FUTURE_EVENT_TIME | eventTime",
            "{\"eventId\":\"e\",\"stationName\":\"A\",\"type\":\"ENTRY\",\"eventTime\":\"2026-10-22T07:00:00Z\",\"vehicleCount\":0} | INVALID_FIELD | vehicleCount",
            "{\"eventId\":\"e\",\"stationName\":\"A\",\"type\":\"ENTRY\",\"eventTime\":\"2026-10-22T07:00:00Z\",\"vehicleCount\":\"2\"} | INVALID_FIELD | vehicleCount"
    })
    void rejectsWithReasonAndFieldButNeverThePayload(String payload, RejectReason reason, String field) {
        assertThat(parser.parse(payload)).isInstanceOfSatisfying(ParseResult.Rejected.class, rejected -> {
            assertThat(rejected.reason()).isEqualTo(reason);
            assertThat(rejected.field()).isEqualTo(field);
        });
    }

    @Test
    void keepsEventIdOnRejectionForTraceability() {
        var result = parser.parse("""
                {"eventId":"e-9","stationName":"A","type":"ENTRY"}
                """);

        assertThat(result).isEqualTo(new ParseResult.Rejected("e-9", RejectReason.MISSING_FIELD, "eventTime"));
    }
}
