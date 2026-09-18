-- Jobrick — schema Supabase
-- A coller dans Supabase > SQL Editor > New query > Run

-- Profil utilisateur (1 ligne par utilisateur connecte)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  cv_path text,                    -- chemin dans le bucket 'cvs'
  cv_filename text,
  cv_uploaded_at timestamptz,
  job_keywords text,               -- intitules de poste recherches, texte libre
  notify_email boolean default true,
  notify_discord boolean default false,
  discord_user_id text,            -- identifiant numerique Discord, pour le DM du bot
  discord_username text,           -- pseudo Discord, affichage seul
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Zones geographiques pinnees sur la carte (plusieurs par utilisateur)
create table if not exists zones (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  label text not null,             -- nom affiche, ex. "Valence"
  lat double precision not null,
  lng double precision not null,
  rayon_km integer default 25,
  created_at timestamptz default now()
);

-- Offres trouvees par le bot, a afficher sur le site
create table if not exists job_results (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  reference text,                  -- identifiant de la source (prefixe "csp:", "adzuna:fr:"...)
                                    -- sert au bot a ne jamais renvoyer deux fois la meme offre
                                    -- au meme utilisateur ; url seule n'est pas fiable pour ca
  titre text,
  employeur text,
  lieu text,
  url text,
  score integer,
  raison text,
  conseil_candidature text,
  source text,
  vu boolean default false,
  postule boolean default false,   -- suivi de candidature, coche par l'utilisateur
  postule_at timestamptz,          -- date de candidature, pour la relance a J+7
  interet boolean,                 -- tri façon swipe : null=indecis, true=garde, false=ecarte
  created_at timestamptz default now(),
  unique (user_id, reference)
);

-- Row Level Security : chacun ne voit/modifie que ses propres donnees
alter table profiles enable row level security;
alter table zones enable row level security;
alter table job_results enable row level security;

create policy "profiles_self" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "zones_self" on zones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "job_results_select_self" on job_results
  for select using (auth.uid() = user_id);

-- Le bot (service_role) ecrit les offres ; l'utilisateur ne peut que les
-- marquer comme vues depuis le dashboard, jamais en creer/supprimer lui-meme.
create policy "job_results_update_self" on job_results
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cree automatiquement une ligne 'profiles' a la premiere connexion.
-- Si la connexion se fait via Discord, l'identifiant numerique et le pseudo
-- sont recuperes directement depuis les metadonnees renvoyees par Discord
-- (provider_id / full_name) : pas besoin que l'utilisateur les recopie a la
-- main pour que le bot puisse lui envoyer un message prive.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, discord_user_id, discord_username)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    case when new.raw_app_meta_data->>'provider' = 'discord'
      then new.raw_user_meta_data->>'provider_id' end,
    case when new.raw_app_meta_data->>'provider' = 'discord'
      then coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name') end
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Bucket de stockage pour les CV (a creer aussi via Storage > New bucket,
-- nom exact "cvs", prive/non-public — ce bloc ajoute juste les policies)
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

create policy "cvs_upload_own" on storage.objects
  for insert with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cvs_read_own" on storage.objects
  for select using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cvs_delete_own" on storage.objects
  for delete using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Migration : projet deja cree avant le passage au DM Discord direct
-- (webhook remplace par un bot qui ecrit en prive). A coller une seule fois
-- si `profiles` existe deja sans `discord_username` ou avec l'ancienne
-- colonne `discord_webhook_url` — sans effet si deja applique.
alter table profiles add column if not exists discord_username text;
alter table profiles drop column if exists discord_webhook_url;

-- Migration : projet deja cree avant le passage du bot Jobrick au
-- multi-utilisateur (il lit desormais directement les comptes d'ici, au lieu
-- de tourner sur un profil fige d'une seule personne). A coller une seule
-- fois si `job_results` existe deja sans `reference` — sans effet si deja
-- applique. Les lignes deja presentes gardent `reference` a NULL : elles ne
-- gaspillent pas la contrainte unique tant qu'aucune nouvelle ligne pour ce
-- meme (user_id, reference) n'est inseree.
alter table job_results add column if not exists reference text;
-- Postgres ne supporte pas "ADD CONSTRAINT IF NOT EXISTS" : ce bloc verifie
-- lui-meme avant d'ajouter, pour rester rejouable sans erreur.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'job_results_user_id_reference_key'
  ) then
    alter table job_results
      add constraint job_results_user_id_reference_key unique (user_id, reference);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Migration : deux regles qui ne tenaient pas ce qu'elles annonçaient.
-- A coller une seule fois dans le SQL Editor. Rejouable sans effet.
-- ---------------------------------------------------------------------

-- 1. La policy "profiles_self" laisse l'utilisateur ecrire n'importe quoi
--    dans sa colonne `email`, y compris l'adresse de quelqu'un d'autre. Or
--    c'est cette colonne que le bot lit pour envoyer les notifications : on
--    pouvait donc faire expedier des mails Jobrick a un tiers. L'adresse est
--    desormais recopiee d'office depuis auth.users, quoi qu'envoie le client.
create or replace function public.pin_profile_email()
returns trigger as $$
begin
  select email into new.email from auth.users where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists profiles_pin_email on public.profiles;
create trigger profiles_pin_email
  before insert or update on public.profiles
  for each row execute procedure public.pin_profile_email();

-- 2. Le commentaire de "job_results_update_self" dit que l'utilisateur ne
--    peut que marquer ses offres, mais la policy autorise la reecriture de
--    tout : titre, url, score, raison. Un compte pouvait donc maquiller ses
--    propres offres, et le score affiche ne voulait plus rien dire. On borne
--    l'update aux seules colonnes de suivi.
create or replace function public.job_results_suivi_seulement()
returns trigger as $$
begin
  if new.user_id is distinct from old.user_id
     or new.reference is distinct from old.reference
     or new.titre is distinct from old.titre
     or new.employeur is distinct from old.employeur
     or new.lieu is distinct from old.lieu
     or new.url is distinct from old.url
     or new.score is distinct from old.score
     or new.raison is distinct from old.raison
     or new.conseil_candidature is distinct from old.conseil_candidature
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at then
    raise exception 'job_results : seules les colonnes de suivi (vu, postule, postule_at, interet) sont modifiables';
  end if;
  return new;
end;
$$ language plpgsql;

-- Le trigger ne porte que sur UPDATE : les INSERT du bot (service_role)
-- passent sans changement. S'il doit un jour corriger une offre deja
-- inseree, il faudra l'exempter explicitement.
drop trigger if exists job_results_suivi on public.job_results;
create trigger job_results_suivi
  before update on public.job_results
  for each row execute procedure public.job_results_suivi_seulement();

-- 3. Le rayon est borne cote navigateur (1 a 200 km) ; la base l'ignorait et
--    acceptait n'importe quel entier.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'zones_rayon_km_check') then
    alter table zones add constraint zones_rayon_km_check
      check (rayon_km between 1 and 200);
  end if;
end $$;
