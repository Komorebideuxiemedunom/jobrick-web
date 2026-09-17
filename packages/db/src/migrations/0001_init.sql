-- Jobrick v2 — schema initial.
--
-- Difference majeure avec la v1 Supabase : plus de RLS. L'autorisation ne
-- vient plus de la base mais du code serveur, qui est le seul a parler a
-- Postgres (le navigateur n'a aucun acces direct). Chaque requete porte donc
-- explicitement son `user_id`.

create extension if not exists "pgcrypto";

-- Identite : elle vient entierement de Discord depuis la v2.
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  discord_id  text not null unique,
  username    text not null,
  global_name text,
  avatar      text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Sessions : on ne stocke que le SHA-256 du jeton remis au navigateur, pour
-- qu'une fuite de la base ne suffise pas a usurper une session.
create table if not exists sessions (
  id         text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);

-- State OAuth : anti-CSRF, duree de vie courte, purge a chaque callback.
create table if not exists oauth_states (
  state       text primary key,
  redirect_to text,
  created_at  timestamptz not null default now()
);

-- Profil : preferences de veille + le CV lui-meme (bytea).
create table if not exists profiles (
  user_id        uuid primary key references users(id) on delete cascade,
  job_keywords   text not null default '',
  notify_dm      boolean not null default true,
  cv_filename    text,
  cv_mime        text,
  cv_size        integer,
  cv_data        bytea,
  cv_uploaded_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists zones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  label      text not null,
  lat        double precision not null,
  lng        double precision not null,
  rayon_km   integer not null default 25 check (rayon_km between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists zones_user_id_idx on zones (user_id);

create table if not exists job_results (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  titre               text,
  employeur           text,
  lieu                text,
  url                 text,
  score               integer check (score between 0 and 100),
  raison              text,
  conseil_candidature text,
  source              text,
  vu                  boolean not null default false,
  postule             boolean not null default false,
  postule_at          timestamptz,
  interet             boolean,
  notified_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists job_results_user_created_idx
  on job_results (user_id, created_at desc);

-- Index partiel : la file d'attente du bot ("qui n'a pas encore ete notifie ?")
-- ne scanne que les lignes concernees.
create index if not exists job_results_a_notifier_idx
  on job_results (created_at) where notified_at is null;
