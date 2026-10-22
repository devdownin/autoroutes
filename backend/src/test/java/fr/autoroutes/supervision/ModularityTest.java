package fr.autoroutes.supervision;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/** Dépendances entre modules : aucun cycle, accès uniquement aux API publiques (ports StreamPublisher, TollEventSink). */
class ModularityTest {

    @Test
    void modulesRespectTheirBoundaries() {
        ApplicationModules.of(SupervisionApplication.class).verify();
    }
}
