-- Jeu de données de performance (SYNTHÉTIQUE) : 13 mois au quart d'heure et 3 ans à l'heure pour toutes les gares.
-- Usage : scripts/perf_history.sh (crée perf_station à partir du référentiel puis exécute ce fichier).
-- Les valeurs sont aléatoires : à n'utiliser que sur une base de test initialisée par Flyway.

do $$
declare
    m date;
    y int;
begin
    for m in select generate_series(date_trunc('month', now() - interval '13 months'), date_trunc('month', now()), interval '1 month')::date loop
        execute format('create table if not exists station_quarter_p%s partition of station_quarter for values from (%L) to (%L)',
            to_char(m, 'YYYYMM'), m::text || ' 00:00:00+00', (m + interval '1 month')::date::text || ' 00:00:00+00');
    end loop;
    for y in select generate_series(extract(year from now())::int - 3, extract(year from now())::int) loop
        execute format('create table if not exists station_hour_p%s partition of station_hour for values from (%L) to (%L)',
            y, y || '-01-01 00:00:00+00', (y + 1) || '-01-01 00:00:00+00');
    end loop;
end $$;


insert into station_quarter (station_id, bucket, entries, exits)
select s.station_id, b, (random() * 120)::int, (random() * 120)::int
from perf_station s
cross join generate_series(date_trunc('hour', now() - interval '400 days'), date_trunc('hour', now() - interval '1 hour'), interval '15 minutes') b
on conflict do nothing;

insert into station_hour (station_id, bucket, entries, exits)
select s.station_id, b, (random() * 480)::int, (random() * 480)::int
from perf_station s
cross join generate_series(date_trunc('hour', now() - interval '1100 days'), date_trunc('hour', now() - interval '1 hour'), interval '1 hour') b
on conflict do nothing;

analyze station_quarter;
analyze station_hour;
select 'station_quarter' as table_name, count(*) from station_quarter
union all select 'station_hour', count(*) from station_hour;
