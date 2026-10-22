-- Historique OBSERVÉ multi-résolution, partitionné par période (partitions créées à la demande, purgées par rétention).
-- Écrit par upsert additif dans la transaction du point de reprise : exactement ce que couvrent ses offsets.

create table station_minute (
    station_id text        not null,
    bucket     timestamptz not null,
    entries    bigint      not null,
    exits      bigint      not null,
    primary key (station_id, bucket)
) partition by range (bucket);

create table station_quarter (
    station_id text        not null,
    bucket     timestamptz not null,
    entries    bigint      not null,
    exits      bigint      not null,
    primary key (station_id, bucket)
) partition by range (bucket);

create table station_hour (
    station_id text        not null,
    bucket     timestamptz not null,
    entries    bigint      not null,
    exits      bigint      not null,
    primary key (station_id, bucket)
) partition by range (bucket);

-- Relecture : lecture de toutes les gares sur une plage de minutes.
create index station_minute_bucket on station_minute (bucket);

create table od_hour (
    origin_id      text        not null,
    destination_id text        not null,
    bucket         timestamptz not null,
    vehicles       bigint      not null,
    primary key (origin_id, destination_id, bucket)
) partition by range (bucket);

-- Jour civil Europe/Paris de la sortie.
create table od_day (
    origin_id      text not null,
    destination_id text not null,
    day            date not null,
    vehicles       bigint not null,
    primary key (origin_id, destination_id, day)
) partition by range (day);
