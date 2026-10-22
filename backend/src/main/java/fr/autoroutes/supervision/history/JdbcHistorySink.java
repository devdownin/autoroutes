package fr.autoroutes.supervision.history;

import fr.autoroutes.supervision.aggregation.HistoryBatch;
import fr.autoroutes.supervision.aggregation.HistorySink;
import fr.autoroutes.supervision.aggregation.WindowCounts;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Upserts ADDITIFS en lots dans les trois résolutions (minute, quart d'heure, heure) et les deux tables O/D.
 * Les agrégats grossiers sont calculés ici à partir des minutes : pas de recalcul planifié, pas de dérive entre résolutions.
 */
@Component
class JdbcHistorySink implements HistorySink {

    private record Bucket(String stationId, long epochSecond) {
    }

    private static final String STATION_UPSERT = """
            insert into %1$s (station_id, bucket, entries, exits) values (?, ?, ?, ?)
            on conflict (station_id, bucket) do update
            set entries = %1$s.entries + excluded.entries, exits = %1$s.exits + excluded.exits""";

    private final JdbcTemplate jdbc;
    private final PartitionManager partitions;

    JdbcHistorySink(JdbcTemplate jdbc, PartitionManager partitions) {
        this.jdbc = jdbc;
        this.partitions = partitions;
    }

    @Override
    public void write(HistoryBatch batch) {
        if (batch.isEmpty()) {
            return;
        }
        writeStations("station_minute", rollup(batch.minutes(), 60));
        writeStations("station_quarter", rollup(batch.minutes(), 15 * 60));
        writeStations("station_hour", rollup(batch.minutes(), 3600));

        var hours = new ArrayList<Object[]>();
        batch.odHours().forEach((key, vehicles) -> {
            var bucket = Instant.ofEpochSecond(key.epochHour() * 3600);
            partitions.ensure("od_hour", bucket);
            hours.add(new Object[] {key.originId(), key.destinationId(), OffsetDateTime.ofInstant(bucket, ZoneOffset.UTC), vehicles});
        });
        jdbc.batchUpdate("""
                insert into od_hour (origin_id, destination_id, bucket, vehicles) values (?, ?, ?, ?)
                on conflict (origin_id, destination_id, bucket) do update set vehicles = od_hour.vehicles + excluded.vehicles""", hours);

        var days = new ArrayList<Object[]>();
        batch.odDays().forEach((key, vehicles) -> {
            partitions.ensure("od_day", key.day());
            days.add(new Object[] {key.originId(), key.destinationId(), key.day(), vehicles});
        });
        jdbc.batchUpdate("""
                insert into od_day (origin_id, destination_id, day, vehicles) values (?, ?, ?, ?)
                on conflict (origin_id, destination_id, day) do update set vehicles = od_day.vehicles + excluded.vehicles""", days);
    }

    private void writeStations(String table, Map<Bucket, long[]> counts) {
        var rows = new ArrayList<Object[]>(counts.size());
        counts.forEach((bucket, value) -> {
            var instant = Instant.ofEpochSecond(bucket.epochSecond());
            partitions.ensure(table, instant);
            rows.add(new Object[] {bucket.stationId(), OffsetDateTime.ofInstant(instant, ZoneOffset.UTC), value[0], value[1]});
        });
        jdbc.batchUpdate(STATION_UPSERT.formatted(table), rows);
    }

    /** Regroupe les minutes par tranche de {@code seconds} (UTC ; les tranches de 15 min et 1 h coïncident avec l'heure de Paris). */
    static Map<Bucket, long[]> rollup(Map<HistoryBatch.StationMinute, WindowCounts> minutes, long seconds) {
        var result = new HashMap<Bucket, long[]>();
        minutes.forEach((key, counts) -> {
            var start = Math.floorDiv(key.epochMinute() * 60, seconds) * seconds;
            var total = result.computeIfAbsent(new Bucket(key.stationId(), start), k -> new long[2]);
            total[0] += counts.entries();
            total[1] += counts.exits();
        });
        return result;
    }

}
