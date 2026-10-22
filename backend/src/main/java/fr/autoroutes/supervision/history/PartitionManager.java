package fr.autoroutes.supervision.history;

import fr.autoroutes.supervision.SupervisionProperties;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Partitions par période, créées à la demande et purgées par rétention (DROP de partition, jamais de DELETE massif).
 * Bornes en UTC (dates civiles pour od_day).
 */
@Component
public class PartitionManager {

    enum Granularity {
        DAY("yyyyMMdd"),
        MONTH("yyyyMM"),
        YEAR("yyyy");

        private final DateTimeFormatter suffix;

        Granularity(String pattern) {
            this.suffix = DateTimeFormatter.ofPattern(pattern);
        }

        LocalDate start(LocalDate day) {
            return switch (this) {
                case DAY -> day;
                case MONTH -> day.withDayOfMonth(1);
                case YEAR -> day.withDayOfYear(1);
            };
        }

        LocalDate end(LocalDate start) {
            return switch (this) {
                case DAY -> start.plusDays(1);
                case MONTH -> start.plusMonths(1);
                case YEAR -> start.plusYears(1);
            };
        }

        LocalDate parse(String suffixText) {
            return switch (this) {
                case DAY -> LocalDate.parse(suffixText, suffix);
                case MONTH -> LocalDate.parse(suffixText + "01", DateTimeFormatter.ofPattern("yyyyMMdd"));
                case YEAR -> LocalDate.of(Integer.parseInt(suffixText), 1, 1);
            };
        }
    }

    record Spec(String table, Granularity granularity, boolean dateColumn, Duration retention) {

        String partitionName(LocalDate start) {
            return table + "_p" + granularity.suffix.format(start);
        }
    }

    private static final Logger LOG = LoggerFactory.getLogger(PartitionManager.class);

    private final JdbcClient jdbc;
    private final List<Spec> specs;
    private final Set<String> known = ConcurrentHashMap.newKeySet();

    PartitionManager(JdbcClient jdbc, SupervisionProperties properties) {
        this.jdbc = jdbc;
        var history = properties.history();
        this.specs = List.of(
                new Spec("station_minute", Granularity.DAY, false, history.minuteRetention()),
                new Spec("station_quarter", Granularity.MONTH, false, history.quarterRetention()),
                new Spec("station_hour", Granularity.YEAR, false, history.hourRetention()),
                new Spec("od_hour", Granularity.MONTH, false, history.odHourRetention()),
                new Spec("od_day", Granularity.YEAR, true, history.odDayRetention()));
    }

    /** Garantit l'existence de la partition couvrant {@code day} ; le cache n'est alimenté qu'après validation de la transaction. */
    public void ensure(String table, LocalDate day) {
        var spec = spec(table);
        var start = spec.granularity().start(day);
        var name = spec.partitionName(start);
        if (known.contains(name)) {
            return;
        }
        jdbc.sql("create table if not exists %s partition of %s for values from (%s) to (%s)"
                .formatted(name, table, bound(spec, start), bound(spec, spec.granularity().end(start)))).update();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    known.add(name);
                }
            });
        } else {
            known.add(name);
        }
    }

    public void ensure(String table, Instant instant) {
        ensure(table, LocalDate.ofInstant(instant, ZoneOffset.UTC));
    }

    /** Partitions d'aujourd'hui et de demain pour toutes les tables : évite le DDL sur le chemin du point de reprise. */
    public void prepare(Instant now) {
        var today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        for (var spec : specs) {
            ensure(spec.table(), today);
            ensure(spec.table(), today.plusDays(1));
        }
    }

    /** @return partitions supprimées, dont la borne haute précède {@code now - rétention} */
    public List<String> dropExpired(Instant now) {
        var dropped = new java.util.ArrayList<String>();
        for (var spec : specs) {
            var limit = LocalDate.ofInstant(now.minus(spec.retention()), ZoneOffset.UTC);
            var partitions = jdbc.sql("""
                            select c.relname from pg_inherits i
                            join pg_class c on c.oid = i.inhrelid
                            join pg_class p on p.oid = i.inhparent
                            where p.relname = :table""")
                    .param("table", spec.table())
                    .query(String.class)
                    .list();
            for (var partition : partitions) {
                var start = spec.granularity().parse(partition.substring((spec.table() + "_p").length()));
                if (!spec.granularity().end(start).isAfter(limit)) {
                    jdbc.sql("drop table if exists " + partition).update();
                    known.remove(partition);
                    dropped.add(partition);
                }
            }
        }
        if (!dropped.isEmpty()) {
            LOG.info("Partitions expirées supprimées : {}", dropped);
        }
        return dropped;
    }

    private Spec spec(String table) {
        return specs.stream().filter(s -> s.table().equals(table)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Table d'historique inconnue : " + table));
    }

    private static String bound(Spec spec, LocalDate day) {
        return spec.dateColumn() ? "'" + day + "'" : "'" + day + " 00:00:00+00'";
    }
}
