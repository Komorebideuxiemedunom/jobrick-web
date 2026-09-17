# Jobrick : site web

Tableau de bord pour piloter la veille Jobrick : connexion Discord, depot du
CV, zones de recherche sur carte, preferences, notifications par message prive.

Ce depot est volontairement separe de [Jobrick](https://github.com/Komorebideuxiemedunom/Jobrick)
(prive) : il ne contient que le code, aucune donnee personnelle. Les CV, zones
et profils vivent dans Postgres, pas ici : c'est pour ca qu'il peut etre public
sans risque.

> **Branche `dev`** : refonte complete : TanStack Start + Effect + Postgres,
> connexion Discord, bot a la place du webhook. La v1 (site statique +
> Supabase) reste sur `main`. Voir `CLAUDE.md` pour l'architecture.

## Demarrer en local

```bash
pnpm install
cp .env.example .env     # puis remplir les valeurs Discord (ci-dessous)
pnpm db:up               # Postgres dans Docker, port hote 5434
pnpm db:migrate
pnpm dev                 # http://localhost:3000
pnpm dev:bot             # dans un second terminal
```

Verifier que la couche donnees est saine, contre la vraie base :

```bash
pnpm db:smoke
```

## Creer l'application Discord

Tout se passe sur le [portail developpeur](https://discord.com/developers/applications).
Une seule application porte a la fois la connexion (OAuth2) et le bot.

### 1. OAuth2 : la connexion au site

Onglet **OAuth2** :

- **Redirects** → ajouter l'URI de callback, **au caractere pres** :
  - en local : `http://localhost:3000/api/auth/discord/callback`
  - en production : `https://<ton-domaine>/api/auth/discord/callback`
- **Identifiant du client** → `DISCORD_CLIENT_ID`
- **Cle secrete du client** → `DISCORD_CLIENT_SECRET`

> La cle secrete ne s'affiche qu'a sa creation. Si elle est perdue, il faut la
> reinitialiser : ce qui invalide l'ancienne. Discord demande une
> authentification multi-facteurs pour cette operation.

Les portees demandees sont `identify` et `email`, rien de plus : le site ne lit
aucun de tes serveurs.

### 2. Bot : les messages prives

Onglet **Bot** :

- **Token** → `DISCORD_BOT_TOKEN` (meme remarque : visible une seule fois)
- **Privileged Gateway Intents** → aucun a activer. Le bot n'a besoin ni du
  contenu des messages, ni de la liste des membres, ni des presences.

L'identifiant de l'application (onglet **Informations generales**) va dans
`DISCORD_APPLICATION_ID`.

### 3. Installer le bot sur un serveur

Discord n'autorise un bot a envoyer un message prive que s'il **partage un
serveur** avec le destinataire. Ouvrir ce lien et choisir un serveur :

```
https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot+applications.commands&permissions=0
```

`permissions=0` est voulu : le bot ne poste rien dans les salons, il n'a besoin
d'aucun droit sur le serveur. Sa seule presence suffit a ouvrir le canal de DM.

La commande `/offres` apparait apres quelques minutes (Discord propage les
commandes globales avec un delai pouvant aller jusqu'a une heure la premiere
fois).

## Qui peut se connecter

Jobrick est un service rendu a quelques proches : une clef de modele de langage
unique, payee par l'hote, et des CV en base. L'acces est donc filtre.

`DISCORD_PROPRIETAIRE` decide de tout. Vide, le site est ouvert a n'importe quel
compte Discord : c'est le mode de developpement. Rempli avec ton identifiant, le
site passe sur invitation, et le controle a lieu au moment de la connexion, avant
meme la creation du compte : un inconnu ne laisse aucune trace en base.

La liste se tient depuis Discord, la ou les demandes d'acces arrivent :

```
/inviter ajouter   personne:@copain  note:"vu au boulot"
/inviter retirer   personne:@copain
/inviter liste
```

Seul le proprietaire peut lancer ces commandes, et lui-meme est toujours
autorise : une base vide ne peut pas t'enfermer dehors. Si le selecteur de
personne ne trouve personne en message prive, l'option `identifiant` accepte un
identifiant Discord brut.

`retirer` ferme aussi les sessions ouvertes, sinon la personne resterait
connectee jusqu'a l'expiration de son cookie, soit trente jours. Son compte et
son CV, eux, restent en base : les supprimer est une autre decision.

## Variables d'environnement

Toutes decrites dans `.env.example`. Les trois qui coincent le plus souvent :

| Variable | Piege |
| --- | --- |
| `PUBLIC_URL` | Sans slash final, et identique a l'URI declaree chez Discord |
| `COOKIE_SECURE` | `false` en local (http), `true` en production |
| `DATABASE_URL` | Port **5434** en local, pas 5432 |
| `DISCORD_PROPRIETAIRE` | Vide en production, et le site est ouvert a tous |

## Deploiement (Dokploy)

`docker-compose.dokploy.yml` decrit la pile complete : Postgres, le site, le
bot. Le `Dockerfile` a deux cibles, `web` et `bot`, avec la racine du depot
comme contexte de build.

Cote Dokploy : application de type **Docker Compose**, puis renseigner dans
l'onglet Environment `POSTGRES_PASSWORD`, `PUBLIC_URL`, `DISCORD_CLIENT_ID`,
`DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID` et
`DISCORD_PROPRIETAIRE`.

Les migrations sont jouees par le conteneur web a chaque demarrage : le schema
suit l'image, et un rollback ne laisse pas une base en avance sur le code.

Les commandes slash suivent le meme principe : le conteneur bot les republie a
chaque demarrage. Une commande ajoutee ou renommee n'existe donc chez Discord
qu'apres un redeploiement du bot, et pas seulement du site.

Ne pas oublier d'ajouter l'URI de callback de production dans les **Redirects**
de l'application Discord.

## Reste a faire

Le bot Python de Jobrick ne lit pas encore Postgres : il tourne toujours sur
ses fichiers locaux. Le brancher (lire CV et zones depuis la base, y ecrire les
offres trouvees) est un chantier a part, a faire une fois ce site valide.
