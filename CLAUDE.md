# Jobrick : site + bot

Veille d'offres d'emploi personnelle : l'utilisateur depose son CV, pointe ses
zones sur une carte, et le bot Discord lui envoie les bonnes offres en message
prive. Le depot est public et ne contient aucune donnee personnelle.

## Stack

Monorepo **pnpm**. Node 22, TypeScript 5.9, tout en ESM.

| Paquet | Role |
| --- | --- |
| `apps/web` | Site : TanStack Start (React 19, Vite 8), SSR, Tailwind 4 + shadcn |
| `apps/bot` | Bot Discord : discord.js 14 |
| `packages/core` | Modele metier partage (Effect Schema) |
| `packages/db` | Postgres : migrations SQL + depots Effect |

**Effect** est la colonne vertebrale cote serveur : services (`Effect.Service`),
couches (`Layer`), configuration (`Config`), acces SQL (`@effect/sql-pg`).
Postgres est self-hosted (Docker), la production tourne sur **Dokploy**.

## Commandes

```bash
pnpm install
pnpm db:up          # Postgres local (port hote 5434)
pnpm db:migrate     # joue les migrations
pnpm db:smoke       # passage complet de la couche donnees, contre la vraie base
pnpm dev            # site sur http://localhost:3000
pnpm dev:bot        # bot (necessite un token Discord)
pnpm typecheck      # tous les paquets
pnpm test           # garde-fous du depot (typographie, commandes Discord)
pnpm build          # tous les paquets
```

## Ce qui a change depuis la v1 (et pourquoi)

La v1 etait un site statique sur GitHub Pages, adosse a Supabase. Elle vit
toujours sur `main`. La v2 (branche `dev`) change quatre choses :

- **L'identite passe de Google a Discord.** C'est ce qui debloque tout le
  reste : on connait desormais l'identifiant Discord de l'utilisateur sans
  qu'il ait a le chercher dans ses reglages.
- **Le webhook disparait au profit du bot.** La v1 poussait les offres dans un
  salon via un webhook, ou tout le monde voyait les offres de tout le monde -
  d'ou la bidouille de l'ID Discord pour @-mentionner. Le bot envoie un DM, et
  ses boutons ecrivent directement en base.
- **Supabase disparait.** Auth, base et stockage etaient delegues ; ils sont
  maintenant dans le code et dans Postgres. Les CV vivent en `bytea`.
- **Plus de RLS.** La securite ne vient plus de la base mais du code serveur,
  seul a parler a Postgres. Toute requete porte son `user_id`.

## Regles a tenir

**Autorisation.** Le navigateur n'a aucun acces a Postgres. Chaque server
function commence par `exigerUtilisateur()`, et chaque methode de depot porte
le `user_id` dans son `where`. Les deux, pas l'un ou l'autre : c'est ce qui
remplace les policies RLS supprimees. `packages/db/src/smoke.ts` verifie
explicitement qu'un compte ne peut pas toucher les offres d'un autre.

**Rien de serveur dans le bundle client.** `apps/web/src/start.ts` est evalue
des deux cotes : le module d'API y est charge par `await import()`, jamais par
un import statique. Apres un changement touchant `src/server/`, verifier :

```bash
pnpm --filter @jobrick/web build
grep -rl 'postgres\|DATABASE_URL' apps/web/dist/client/assets/*.js   # doit etre vide
```

**Routes HTTP brutes.** TanStack Start n'a pas de fichiers de route serveur ici :
`/api/*` est servi par un *request middleware* declare dans `start.ts`, qui
renvoie une `Response`. C'est necessaire pour le callback OAuth (Discord
redirige le navigateur) et pour `/api/cv` (telechargement binaire).

**Les DTO ne portent que ce que l'interface lit.** `src/server/dto.ts` aplatit
les classes du domaine pour la serialisation. Un champ qu'aucun composant ne
consomme n'a rien a y faire : il ne fait que grossir la charge utile de chaque
chargement de page.

**Pas de cache client.** Les donnees du dashboard arrivent par le loader de
route (`chargerDashboard`), repartent par des server functions, et l'etat qui
bouge au clic (offre vue, postulee, triee) est tenu en local dans le composant
avant un `router.invalidate()`. Il n'y a pas de react-query : un `QueryClient`
etait construit et pose en contexte de routeur sans qu'aucune query ne s'en
serve, il a ete retire. Le remettre suppose de rebrancher le provider, pas
seulement la dependance.

**Le CV ne part jamais ailleurs.** Le scan ATS tourne dans le navigateur
(pdf.js, mammoth), sur un fichier venu du disque ou de `/api/cv`. Ne pas
deplacer cette analyse cote serveur ni vers un service tiers.

**Integration continue.** `.github/workflows/ci.yml` rejoue sur chaque poussee
ce que les regles ci-dessus demandent : typage, garde-fous, migrations et
`db:smoke` contre un vrai Postgres, build, puis la verification que rien de
serveur n'a fuite dans le bundle client. Une regle que la CI ne sait pas
verifier finit toujours par etre oubliee.

**Migrations.** Fichiers `.sql` numerotes dans `packages/db/src/migrations/`,
joues dans l'ordre, une transaction chacun, jamais modifies retroactivement :
on en ajoute un nouveau. Le conteneur web les joue au demarrage.

**Interface.** Tailwind v4 (config dans `src/styles/app.css`, pas de
`tailwind.config`) et composants shadcn dans `src/components/ui/`. La DA est
violette : violet franc sur lavande, encre bleu nuit, Plus Jakarta Sans en 800
pour les titres, angles genereux. Deux regles portent le systeme : les actions
secondaires sont des aplats lavande a texte violet (variante `secondary`),
jamais des contours gris ; et le point de « Jobrick. » est le seul ornement.
Le theme se choisit via `BasculeTheme` (clair / sombre / systeme, retenu dans
`localStorage`) et s'applique avant le premier rendu par un script inline dans
`__root.tsx` : sans lui, la page clignoterait en clair. Les composants sont ecrits a la main plutot que poses par la CLI
shadcn : `switch`, `checkbox` et `select` s'appuient sur les elements natifs,
plus accessibles et sans dependance Radix. Pour en ajouter un que le natif ne
couvre pas (dialogue, menu, combobox), reprendre le code shadcn et lui ajouter
sa dependance Radix : la CLI v4 attend une `components.json` incompatible avec
ce setup.

**Langue.** Code, commentaires et commits en francais, sans accents dans les
identifiants. En revanche **la copie visible par l'utilisateur porte ses
accents** : c'est du francais correct, pas du code. Les commentaires expliquent
*pourquoi*, pas *quoi*.

**Pas de tiret cadratin.** Nulle part, code et documentation comprise : c'est
la signature la plus reconnaissable d'un texte genere. Le deux-points ou la
virgule font le meme travail. `tests/typographie.test.ts` echoue s'il en
reapparait un.

## Pieges connus

- **Les commandes slash vivent chez Discord, pas dans le depot.** Le bot les
  publie au demarrage (`publierCommandes`) : modifier `commandes.ts` ne change
  rien tant que le bot n'a pas redemarre, et en production cela veut dire
  redeployer le conteneur `bot`. Une commande ajoutee n'apparait pas non plus
  dans un client Discord deja ouvert : il garde sa liste en cache, il faut le
  recharger. Discord annonce jusqu'a une heure de propagation pour une commande
  globale toute neuve. Corollaire : un payload invalide ne casse ni le
  typecheck ni le build, il fait echouer le demarrage du bot. C'est ce que
  `tests/commandes.test.ts` verifie a la place.
- Le bot tourne en `node --experimental-strip-types` : imports relatifs avec
  extension `.ts` obligatoire, et pas d'`enum` ni de `namespace`.
- L'image Docker embarque tout `node_modules` (~630 Mo). Le serveur SSR garde
  des imports vers les paquets installes ; un elagage casserait les liens du
  workspace. A retravailler si la taille devient genante.
- Postgres local ecoute sur **5434**, pas 5432 (plusieurs projets en
  parallele sur la machine). Surchargeable avec `POSTGRES_PORT`.
- Un DM refuse (parametres de confidentialite) n'est pas une erreur : l'offre
  reste dans la file et l'utilisateur la voit sur le dashboard.
- Un DM non sollicite exige que le bot partage un serveur avec le destinataire.
  L'installation doit donc demander la portee `bot`, pas seulement
  `applications.commands`.
- Leaflet se charge en asynchrone : les effets qui synchronisent les couches
  dependent d'un drapeau `pret`, sinon ils tournent avant que la carte existe
  et les zones enregistrees restent invisibles.
- Fond de carte : OpenStreetMap, sans clef d'API. CARTO a ete essaye et
  rejete, ses tuiles renvoient un bandeau « API KEY REQUIRED ». En mode sombre
  la carte est assombrie par un filtre CSS, jamais inversee : l'inversion
  virait au vert sale et rendait les libelles illisibles.
- Les marqueurs sont des `divIcon` en HTML et non l'icone PNG de Leaflet :
  ils lisent leurs couleurs dans les tokens CSS, donc suivent le theme.
- L'alias `~` est declare deux fois, dans `tsconfig.json` et dans
  `vite.config.ts` : le serveur de dev ne lit pas les `paths` du tsconfig.
