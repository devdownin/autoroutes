package fr.autoroutes.supervision.aggregation;

import fr.autoroutes.supervision.ingestion.QuarantineStore;

/** Issue d'un rejeu de quarantaine, enregistrée avec le point de reprise qui couvre son effet sur l'état. */
record QuarantineMark(String eventId, QuarantineStore.Status status) {
}
