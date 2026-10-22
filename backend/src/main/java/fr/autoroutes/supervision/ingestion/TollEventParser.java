package fr.autoroutes.supervision.ingestion;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Optional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Parseur à liste d'autorisation : seuls les champs du contrat sont lus, tout le reste est ignoré
 * et n'est jamais journalisé. Sans état, utilisable depuis plusieurs threads de consommation.
 */
public class TollEventParser {

    static final int MAX_ID_LENGTH = 128;
    static final int MAX_VEHICLE_COUNT = 1000;
    static final Duration MAX_CLOCK_AHEAD = Duration.ofMinutes(5);

    private final JsonMapper mapper;
    private final Clock clock;
    private final ZoneId localZone;

    public TollEventParser(JsonMapper mapper, Clock clock, ZoneId localZone) {
        this.mapper = mapper;
        this.clock = clock;
        this.localZone = localZone;
    }

    public ParseResult parse(String payload) {
        if (payload == null) {
            return new ParseResult.Rejected(null, RejectReason.INVALID_JSON, null);
        }
        JsonNode root;
        try {
            root = mapper.readTree(payload);
        } catch (JacksonException e) {
            return new ParseResult.Rejected(null, RejectReason.INVALID_JSON, null);
        }
        if (root == null || !root.isObject()) {
            return new ParseResult.Rejected(null, RejectReason.INVALID_JSON, null);
        }
        try {
            return new ParseResult.Valid(toEvent(root));
        } catch (FieldException e) {
            var eventId = text(root, "eventId").orElse(null);
            return new ParseResult.Rejected(eventId, e.reason, e.field);
        }
    }

    private TollEvent toEvent(JsonNode root) {
        var eventId = requiredText(root, "eventId");
        var stationName = requiredText(root, "stationName");
        var type = parseType(requiredText(root, "type"));
        var eventTime = parseInstant(requiredText(root, "eventTime"), "eventTime");
        if (eventTime.isAfter(clock.instant().plus(MAX_CLOCK_AHEAD))) {
            throw new FieldException(RejectReason.FUTURE_EVENT_TIME, "eventTime");
        }
        // Gare et heure d'entrée n'ont de sens que sur une sortie : ignorées sur une entrée.
        var entryStation = type == EventType.EXIT ? optionalText(root, "entryStationName") : null;
        var entryTimeText = type == EventType.EXIT ? optionalText(root, "entryTime") : null;
        var entryTime = entryTimeText == null ? null : parseInstant(entryTimeText, "entryTime");
        return new TollEvent(
                eventId,
                stationName,
                type,
                eventTime,
                entryStation,
                entryTime,
                intField(root, "vehicleCount", 1, MAX_VEHICLE_COUNT).orElse(1),
                intField(root, "vehicleClass", 1, 5).orElse(null),
                root.path("simulated").asBoolean(false));
    }

    private static String requiredText(JsonNode root, String field) {
        var node = root.get(field);
        if (node == null || node.isNull()) {
            throw new FieldException(RejectReason.MISSING_FIELD, field);
        }
        return validText(node, field);
    }

    private static String optionalText(JsonNode root, String field) {
        var node = root.get(field);
        return node == null || node.isNull() ? null : validText(node, field);
    }

    private static String validText(JsonNode node, String field) {
        if (!node.isString() || node.stringValue().isBlank() || node.stringValue().length() > MAX_ID_LENGTH) {
            throw new FieldException(RejectReason.INVALID_FIELD, field);
        }
        return node.stringValue().strip();
    }

    private static Optional<String> text(JsonNode root, String field) {
        var node = root.get(field);
        return node != null && node.isString() && node.stringValue().length() <= MAX_ID_LENGTH
                ? Optional.of(node.stringValue())
                : Optional.empty();
    }

    private static Optional<Integer> intField(JsonNode root, String field, int min, int max) {
        var node = root.get(field);
        if (node == null || node.isNull()) {
            return Optional.empty();
        }
        if (!node.isIntegralNumber() || !node.canConvertToInt() || node.intValue() < min || node.intValue() > max) {
            throw new FieldException(RejectReason.INVALID_FIELD, field);
        }
        return Optional.of(node.intValue());
    }

    private static EventType parseType(String value) {
        try {
            return EventType.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new FieldException(RejectReason.INVALID_FIELD, "type");
        }
    }

    /** Sans décalage horaire, l'heure est lue en heure locale ; en cas d'heure ambiguë (passage à l'heure d'hiver), le premier passage est retenu. */
    private Instant parseInstant(String value, String field) {
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException withoutOffset) {
            try {
                return LocalDateTime.parse(value).atZone(localZone).toInstant();
            } catch (DateTimeParseException e) {
                throw new FieldException(RejectReason.INVALID_FIELD, field);
            }
        }
    }

    private static final class FieldException extends RuntimeException {

        private final RejectReason reason;
        private final String field;

        FieldException(RejectReason reason, String field) {
            super(reason + " " + field, null, false, false);
            this.reason = reason;
            this.field = field;
        }
    }
}
