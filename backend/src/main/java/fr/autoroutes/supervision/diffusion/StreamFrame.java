package fr.autoroutes.supervision.diffusion;

/** Message déjà sérialisé (une fois pour tous les clients). {@code id} : « epoch:seq » pour snapshot et delta, sinon null. */
record StreamFrame(String event, String id, String data) {
}
