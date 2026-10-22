package fr.autoroutes.supervision.history;

import java.time.Clock;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Création anticipée des partitions et purge par rétention : au démarrage puis chaque nuit. */
@Component
class HistoryMaintenance {

    private final PartitionManager partitions;
    private final Clock clock;

    HistoryMaintenance(PartitionManager partitions, Clock clock) {
        this.partitions = partitions;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    void onStartup() {
        run();
    }

    @Scheduled(cron = "0 17 3 * * *", zone = "UTC")
    void run() {
        partitions.prepare(clock.instant());
        partitions.dropExpired(clock.instant());
    }
}
