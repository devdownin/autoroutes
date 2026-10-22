package fr.autoroutes.supervision.referentiel;

/** Publié après l'activation d'une nouvelle table d'alias : déclenche le rejeu de la quarantaine. */
public record AliasesUpdated(String version, int aliases) {
}
