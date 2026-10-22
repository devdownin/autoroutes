package fr.autoroutes.supervision.assignment;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class GraphLoaderTest {

    private static final String GRAPH = """
            {"nodes":[[5.0,45.0],[5.02,45.0]],
             "edges":[{"id":"w1-0","from":0,"to":1,"lengthM":1570.0,"speedKmh":130,"refs":["A7"],"link":false}]}""";

    @Test
    void readsTheGraphProducedByTheCartographyPipelineAndVersionsItByContent(@TempDir Path dir) throws Exception {
        var file = Files.writeString(dir.resolve("graph.json"), GRAPH);
        var loader = new GraphLoader(JsonMapper.builder().build());

        var graph = loader.load(file);

        assertThat(graph.nodeCount()).isEqualTo(2);
        assertThat(graph.edges()).singleElement().satisfies(edge -> {
            assertThat(edge.id()).isEqualTo("w1-0");
            assertThat(edge.refs()).containsExactly("A7");
            assertThat(edge.seconds()).isEqualTo(1570.0 / (130 / 3.6));
        });
        assertThat(graph.refsOf(1)).containsExactly("A7");
        assertThat(graph.version()).startsWith("graph-").isEqualTo(loader.load(file).version());
        Files.writeString(file, GRAPH.replace("1570.0", "1571.0"));
        assertThat(loader.load(file).version()).isNotEqualTo(graph.version());
    }
}
