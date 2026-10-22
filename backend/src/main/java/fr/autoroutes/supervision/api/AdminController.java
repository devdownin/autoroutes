package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.aggregation.QuarantineReplayer;
import fr.autoroutes.supervision.referentiel.AliasService;
import fr.autoroutes.supervision.referentiel.AliasesUpdated;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Administration (rôle ADMIN à l'incrément 5 ; profil démonstration sans authentification, Q12). */
@RestController
@RequestMapping("/api/v1/admin")
class AdminController {

    private final AliasService aliases;
    private final QuarantineReplayer replayer;

    AdminController(AliasService aliases, QuarantineReplayer replayer) {
        this.aliases = aliases;
        this.replayer = replayer;
    }

    /** Corps : CSV « name;stationId ». La quarantaine est rejouée automatiquement après activation. */
    @PostMapping(path = "/aliases", consumes = "text/csv")
    AliasesUpdated replaceAliases(@RequestBody String csv) {
        return aliases.replace(csv);
    }

    @PostMapping("/quarantine/replay")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void replayQuarantine() {
        replayer.replayAsync();
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail invalid(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_CONTENT, e.getMessage());
    }
}
