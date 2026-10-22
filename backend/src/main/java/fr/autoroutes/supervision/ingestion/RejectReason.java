package fr.autoroutes.supervision.ingestion;

public enum RejectReason {
    INVALID_JSON,
    MISSING_FIELD,
    INVALID_FIELD,
    FUTURE_EVENT_TIME,
    TOO_LATE
}
