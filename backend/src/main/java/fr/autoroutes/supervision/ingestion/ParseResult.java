package fr.autoroutes.supervision.ingestion;

public sealed interface ParseResult {

    record Valid(TollEvent event) implements ParseResult {
    }

    /**
     * Rejet traçable sans le message brut (RGPD) : identifiant si lisible, motif et champ en cause.
     */
    record Rejected(String eventId, RejectReason reason, String field) implements ParseResult {
    }
}
