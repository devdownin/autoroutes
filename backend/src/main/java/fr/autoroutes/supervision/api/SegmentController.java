package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.assignment.AssignmentRunner;
import fr.autoroutes.supervision.assignment.SegmentLoads;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
class SegmentController {

    private final ObjectProvider<AssignmentRunner> runner;

    SegmentController(ObjectProvider<AssignmentRunner> runner) {
        this.runner = runner;
    }

    /** Charge ESTIMÉE des tronçons sur la dernière fenêtre O/D (affectation tout-ou-rien) ; jamais une mesure. */
    @GetMapping("/segments/load")
    SegmentLoads load() {
        var assignment = runner.getIfAvailable();
        if (assignment == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Graphe routier non configuré (ASSIGNMENT_GRAPH_FILE)");
        }
        return assignment.latest().orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Premier calcul en cours"));
    }
}
