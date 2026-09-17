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
  discord_webhook_url text,
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
  titre text,
  employeur text,
  lieu text,
  url text,
  score integer,
  raison text,
  conseil_candidature text,
  source text,
  vu boolean default false,
  created_at timestamptz default now()
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

-- Cree automatiquement une ligne 'profiles' a la premiere connexion
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
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
