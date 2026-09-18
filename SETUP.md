# Jobrick, le site web

Tableau de bord pour piloter la veille Jobrick : connexion Google, dépôt du
CV, zones de recherche sur carte, préférences, notifications.

Ce dépôt est volontairement séparé de [Jobrick](https://github.com/Komorebideuxiemedunom/Jobrick)
(privé) : il ne contient que le code du site, aucune donnée personnelle. Les
données (CV, zones, profils) vivent dans Supabase, pas ici, c'est pour ça
qu'il peut être public sans risque.

## État actuel

- ✅ Projet Supabase créé et configuré (tables, sécurité par ligne, bucket
  CV). `assets/js/config.js` pointe déjà dessus.
- ✅ Hébergement GitHub Pages sur ce dépôt.
- ⏳ Connexion Google : à activer (voir ci-dessous).
- ⏳ Connexion Discord : à activer (voir ci-dessous).

## Activer la connexion Google

1. Dans [Supabase](https://supabase.com/dashboard/project/ihomzzwnmrraklvadtlp) :
   **Authentication** → **Providers** → **Google** → active-le, copie la
   **Callback URL** affichée.
2. Sur [Google Cloud Console](https://console.cloud.google.com/apis/credentials) :
   **Create Credentials** → **OAuth client ID** → type **Web application**.
   Dans **Authorized redirect URIs**, colle la Callback URL de Supabase.
3. Google donne un **Client ID** et un **Client Secret** → colle-les dans
   Supabase (provider Google) → **Save**.
4. Dans Supabase : **Authentication** → **URL Configuration** → ajoute
   l'URL du site (celle de GitHub Pages) dans **Redirect URLs**.

## Activer la connexion Discord

Même principe que Google, côté Discord Developer Portal :

1. Dans [Supabase](https://supabase.com/dashboard/project/ihomzzwnmrraklvadtlp) :
   **Authentication** → **Providers** → **Discord** → active-le, copie la
   **Callback URL** affichée (garde l'onglet ouvert, elle sert à l'étape 3).
2. Sur le [Discord Developer Portal](https://discord.com/developers/applications) :
   **New Application** → nomme-la (ex. `Jobrick`) → onglet **OAuth2**.
3. Dans **Redirects**, ajoute la Callback URL copiée à l'étape 1, puis
   **Save Changes**.
4. Toujours sur l'onglet **OAuth2** : copie le **Client ID** et le
   **Client Secret** (bouton *Reset Secret* s'il n'est pas encore affiché)
   → colle-les dans Supabase (provider Discord) → **Save**.

Se connecter avec Discord ne suffit pas à lui seul pour recevoir les offres
en message privé : il faut en plus que le bot et toi partagiez un serveur
Discord (contrainte de l'API Discord, pas de Jobrick). Ce dernier point,
ainsi que la création du bot lui-même, est documenté dans le dépôt privé
[Jobrick](https://github.com/Komorebideuxiemedunom/Jobrick) (§10 du
README) : c'est lui qui envoie réellement les messages, deux fois par jour,
en même temps que le mail.

Une fois connecté via Discord, ton identifiant numérique est récupéré
automatiquement (voir `supabase-schema.sql`, déclencheur
`handle_new_user`) : rien à recopier à la main. Si tu préfères te connecter
avec Google mais recevoir quand même les offres sur Discord, le dashboard
te laisse coller ton identifiant Discord manuellement dans ce cas précis.

## État du bot (Jobrick, privé)

Depuis le 18 septembre 2026, le bot Python de
[Jobrick](https://github.com/Komorebideuxiemedunom/Jobrick) lit directement
les comptes créés ici (CV, zones, mots-clés, préférences), au lieu de
tourner sur un profil unique figé dans son propre code. Chaque compte actif
(qui a coché mail et/ou Discord) est cherché et prévenu individuellement,
deux fois par jour, voir le `README.md` de Jobrick, **§0** et **§8**.

Pour recevoir tes offres, ton compte doit avoir : un CV déposé (sinon la
notation se fait sur tes mots-clés seuls, moins précise), au moins une zone
pointée sur la carte, et au moins un canal de notification activé.
