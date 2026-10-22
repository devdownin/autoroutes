package fr.autoroutes.supervision.assignment;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Lit {@code graph.json} (sortie de cartographie/prepare_motorways.py) ; la version est l'empreinte du contenu. */
final class GraphLoader {

    private final ObjectMapper json;

    GraphLoader(ObjectMapper json) {
        this.json = json;
    }

    RoadGraph load(Path file) {
        try {
            var bytes = Files.readAllBytes(file);
            var root = json.readTree(bytes);
            var nodes = root.path("nodes");
            var longitude = new double[nodes.size()];
            var latitude = new double[nodes.size()];
            for (var i = 0; i < nodes.size(); i++) {
                longitude[i] = nodes.get(i).get(0).asDouble();
                latitude[i] = nodes.get(i).get(1).asDouble();
            }
            var edges = new ArrayList<RoadGraph.Edge>();
            for (JsonNode edge : root.path("edges")) {
                var refs = new HashSet<String>();
                edge.path("refs").forEach(ref -> refs.add(ref.asString()));
                var speed = Math.max(1, edge.path("speedKmh").asInt(130));
                edges.add(new RoadGraph.Edge(edge.path("id").asString(), edge.path("from").asInt(), edge.path("to").asInt(),
                        edge.path("lengthM").asDouble(), speed, refs, edge.path("link").asBoolean(false)));
            }
            return new RoadGraph("graph-" + fingerprint(bytes), longitude, latitude, edges);
        } catch (IOException e) {
            throw new UncheckedIOException("Graphe routier illisible : " + file, e);
        }
    }

    private static String fingerprint(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content)).substring(0, 12);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
