create table checkpoint (
    id          bigserial primary key,
    created_at  timestamptz not null default now(),
    epoch       text        not null,
    size_bytes  integer     not null,
    payload     bytea       not null
);

-- Champs autorisés uniquement (contrat 0.1) : jamais le message brut.
create table quarantined_event (
    event_id           text primary key,
    station_name       text        not null,
    type               text        not null,
    event_time         timestamptz not null,
    entry_station_name text,
    entry_time         timestamptz,
    vehicle_count      integer     not null,
    vehicle_class      integer,
    simulated          boolean     not null,
    received_at        timestamptz not null default now(),
    status             text        not null default 'PENDING',
    processed_at       timestamptz
);

create index quarantined_event_pending on quarantined_event (received_at) where status = 'PENDING';

create table alias_version (
    version     text primary key,
    imported_at timestamptz not null default now(),
    content     text        not null
);
