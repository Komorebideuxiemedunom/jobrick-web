-- Jobrick est sur invitation.
--
-- La veille est un service personnel rendu a quelques proches : sans filtre,
-- n'importe qui se connectant avec Discord ouvrirait un compte, deposerait un
-- CV et consommerait la clef du modele de langage, qui est unique et payee
-- par l'hote.
--
-- La liste vit en base plutot que dans l'environnement pour que le bot puisse
-- l'ecrire : inviter quelqu'un se fait avec `/inviter`, dans la conversation
-- meme ou il demande l'acces, sans redeploiement.
create table if not exists invitations (
  -- Pas de cle etrangere vers `users` : on invite quelqu'un avant qu'il ait un
  -- compte, c'est tout l'interet.
  discord_id  text primary key,
  -- Qui a invite, et pourquoi : dans six mois la liste n'est qu'une suite de
  -- nombres a dix-huit chiffres.
  invite_par  text,
  note        text,
  created_at  timestamptz not null default now()
);
