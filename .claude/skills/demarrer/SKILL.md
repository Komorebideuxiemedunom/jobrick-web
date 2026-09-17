---
name: demarrer
description: "Lance le site Jobrick en local et l'amene jusqu'a une page visible : Postgres dans Docker, migrations, serveur de dev Vite sur le port 3000, puis verification dans le navigateur. Declencher pour « demarre le site », « lance l'app », « fais tourner Jobrick », « montre-moi la page », « verifie dans le navigateur », « screenshot du dashboard », « ca donne quoi a l'ecran », ou avant toute verification visuelle d'un changement d'interface. Couvre aussi le bot Discord et le serveur de production."
argument-hint: "[site | bot | prod]"
allowed-tools: Bash, Read, Glob
---

# Demarrer Jobrick en local

Sans argument, demarre le site. `bot` et `prod` sont traites en fin de fichier.

## 1. Postgres et configuration

```bash
docker ps --format '{{.Names}}' | grep jobrick   # conteneur deja la ?
pnpm db:up                                       # sinon : port hote 5434
pnpm db:migrate                                  # idempotent, note ce qui est deja joue
```

`.env` doit exister a la racine du depot : sans lui, `DATABASE_URL` manque et le
serveur tombe au premier acces aux donnees. S'il est absent, `cp .env.example .env`
puis signaler a l'utilisateur que les variables `DISCORD_*` restent a remplir :
les pages s'affichent sans elles, la connexion non.

## 2. Le port 3000 n'est pas negociable

```bash
lsof -ti tcp:3000
```

S'il est pris, liberer le port ou demander a l'utilisateur. NE PAS basculer sur un
autre port : `PUBLIC_URL` et la redirect URI declaree chez Discord pointent tous
deux sur `http://localhost:3000`, et l'OAuth casse des qu'ils divergent.

## 3. Lancer, puis attendre le port

`pnpm dev` en tache de fond, sortie redirigee vers un fichier de log du
scratchpad. Attendre ensuite que le port reponde plutot que de dormir un temps
arbitraire :

```bash
for i in $(seq 1 30); do
  curl -sf -o /dev/null http://localhost:3000/ && break
  /bin/sleep 1
done
```

## 4. Conduire l'app, et lire ce qu'on voit

Prendre une capture et **la regarder** : une page blanche est un echec de
demarrage, pas une reussite.

Deux etats normaux a ne pas confondre avec un bug :

- **Page de connexion en deux volets** sur `/` : visiteur sans session.
- **Redirection vers `/dashboard`** : une session valide traine dans le
  navigateur. C'est `beforeLoad` de la route `/` qui redirige.

La connexion ne s'automatise pas (OAuth Discord, et saisir des identifiants est
hors limites). Pour voir le dashboard, passer par le Chrome de l'utilisateur
(`mcp__claude-in-chrome__*`), qui porte deja son cookie de session, plutot que
par le profil vierge de Playwright.

## 5. Deux angles morts

- **La barre d'onglets n'est pas dans une capture.** Pour verifier un favicon ou
  un titre, lire le `<head>` servi (`curl -s http://localhost:3000/ | head -c 2000`)
  et ouvrir la page dans le Chrome de l'utilisateur pour qu'il la voie lui-meme.
  Attention : le `grep` de macOS ignore `\|`, une alternative non trouvee ne
  prouve rien.
- **Les fichiers de `apps/web/public/`** sont servis a la racine du site : par
  Vite en dev, par `serve.js` en production. Un fichier absent de `dist/client`
  apres un build ne sera pas servi.

## 6. Arreter

Tuer la tache de fond. Laisser Postgres tourner : d'autres sessions s'en servent,
et `pnpm db:up` le reprend tel quel.

## Variante `bot`

`pnpm dev:bot`, qui exige `DISCORD_BOT_TOKEN` et `DISCORD_APPLICATION_ID` dans
`.env`. Le bot tourne en `node --experimental-strip-types` : une erreur
d'`enum`, de `namespace` ou d'import sans extension `.ts` vient de la, pas de
la configuration.

## Variante `prod`

```bash
pnpm --filter @jobrick/web build
node apps/web/serve.js          # port 3000, ou $PORT
```

C'est exactement ce que lance l'image Docker. A utiliser pour tout ce que le
mode dev ne montre pas : bundle client, cache des assets, service des fichiers
statiques.
