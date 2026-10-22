package fr.autoroutes.supervision.history;

import fr.autoroutes.supervision.SupervisionProperties;
import fr.autoroutes.supervision.aggregation.OdCell;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Lectures de l'historique OBSERVÉ. Plages validées (ordre, durée maximale par résolution) avant toute requête.
 * Les données couvrent jusqu'au dernier point de reprise (≤ 60 s de retard sur le temps réel).
 */
@Component
public class HistoryQueries {

    /** Point de série : début de tranche (secondes epoch), entrées, sorties. */
    public record Point(long t, long entries, long exits) {
    }

    /** Ligne minute de la relecture : gare, minute (secondes epoch), entrées, sorties. */
    public record MinuteRow(String stationId, long t, long entries, long exits) {
    }

    public record StationTotal(String stationId, long entries, long exits) {
    }

    private final JdbcClient jdbc;
    private final Duration maxMinuteSpan;

    HistoryQueries(JdbcClient jdbc, SupervisionProperties properties) {
        this.jdbc = jdbc;
        this.maxMinuteSpan = properties.history().maxMinuteSpan();
    }

    public List<Point> stationSeries(String stationId, Instant from, Instant to, Resolution step) {
        validate(from, to, step.maxSpan());
        return jdbc.sql("""
                        select extract(epoch from bucket)::bigint as t, entries, exits from %s
                        where station_id = :station and bucket >= :from and bucket < :to order by bucket"""
                        .formatted(step.table()))
                .param("station", stationId)
                .param("from", utc(from))
                .param("to", utc(to))
                .query(Point.class)
                .list();
    }

    public List<Point> networkSeries(Instant from, Instant to, Resolution step) {
        validate(from, to, step.maxSpan());
        return jdbc.sql("""
                        select extract(epoch from bucket)::bigint as t, sum(entries) as entries, sum(exits) as exits from %s
                        where bucket >= :from and bucket < :to group by bucket order by bucket"""
                        .formatted(step.table()))
                .param("from", utc(from))
                .param("to", utc(to))
                .query(Point.class)
                .list();
    }

    /** Toutes les gares, minute par minute : données de la relecture, plage bornée. */
    public List<MinuteRow> minutes(Instant from, Instant to) {
        validate(from, to, maxMinuteSpan);
        return jdbc.sql("""
                        select station_id, extract(epoch from bucket)::bigint as t, entries, exits from station_minute
                        where bucket >= :from and bucket < :to order by bucket, station_id""")
                .param("from", utc(from))
                .param("to", utc(to))
                .query(MinuteRow.class)
                .list();
    }

    /** Cumuls par gare sur une plage d'au plus un jour (base « aujourd'hui » de la relecture). */
    public List<StationTotal> totals(Instant from, Instant to) {
        validate(from, to, Duration.ofHours(25));
        return jdbc.sql("""
                        select station_id, sum(entries) as entries, sum(exits) as exits from station_minute
                        where bucket >= :from and bucket < :to group by station_id order by station_id""")
                .param("from", utc(from))
                .param("to", utc(to))
                .query(StationTotal.class)
                .list();
    }

    /**
     * Cellules O/D OBSERVÉES cumulées sur une plage, sans seuil : il s'applique après agrégation (OdQueryService).
     *
     * @param stations gares retenues du côté {@code side} (superset du filtre exact), {@code null} = toutes
     */
    public List<OdCell> odCells(Instant from, Instant to, Side side, Set<String> stations) {
        validate(from, to, Duration.ofDays(93));
        var restriction = stations == null ? "" : switch (side) {
            case ORIGIN -> " and origin_id = any(:stations)";
            case DESTINATION -> " and destination_id = any(:stations)";
            case ANY -> " and (origin_id = any(:stations) or destination_id = any(:stations))";
        };
        var statement = jdbc.sql("""
                select origin_id, destination_id, sum(vehicles) as vehicles from od_hour
                where bucket >= :from and bucket < :to""" + restriction + " group by origin_id, destination_id")
                .param("from", utc(from))
                .param("to", utc(to));
        if (stations != null) {
            statement = statement.param("stations", stations.toArray(String[]::new));
        }
        return statement.query(OdCell.class).list();
    }

    /** Côté du flux auquel s'applique la restriction de gares. */
    public enum Side {
        ORIGIN,
        DESTINATION,
        ANY
    }

    private static void validate(Instant from, Instant to, Duration maxSpan) {
        if (!from.isBefore(to)) {
            throw new IllegalArgumentException("Plage vide : from doit précéder to");
        }
        if (Duration.between(from, to).compareTo(maxSpan) > 0) {
            throw new IllegalArgumentException("Plage trop longue : maximum " + maxSpan);
        }
    }

    private static OffsetDateTime utc(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
