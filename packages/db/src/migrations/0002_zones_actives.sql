-- Les zones gagnent deux notions venues de l'interface :
--
--   `active`      permet de mettre une zone en pause sans la supprimer, ce
--                 qui evite de perdre son rayon et ses coordonnees quand on
--                 veut juste l'ecarter quelques semaines.
--   `departement` est purement informatif, renseigne par le geocodage
--                 inverse. Nullable : l'appel a Nominatim peut echouer, et
--                 un point pose en pleine campagne n'en a pas toujours un.

alter table zones add column if not exists active boolean not null default true;
alter table zones add column if not exists departement text;

-- La veille ne doit regarder que les zones actives : l'index partiel evite
-- de parcourir celles qui sont en pause.
create index if not exists zones_actives_idx on zones (user_id) where active;
