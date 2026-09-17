# Jobrick — site web

Tableau de bord pour piloter la veille Jobrick : connexion Google, dépôt du
CV, zones de recherche sur carte, préférences, notifications.

Ce dépôt est volontairement séparé de [Jobrick](https://github.com/Komorebideuxiemedunom/Jobrick)
(privé) : il ne contient que le code du site, aucune donnée personnelle. Les
données (CV, zones, profils) vivent dans Supabase, pas ici — c'est pour ça
qu'il peut être public sans risque.

## État actuel

- ✅ Projet Supabase créé et configuré (tables, sécurité par ligne, bucket
  CV) — `assets/js/config.js` pointe déjà dessus.
- ✅ Hébergement GitHub Pages sur ce dépôt.
- ⏳ Connexion Google : à activer (voir ci-dessous).

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

## Prochaine étape (plus tard)

Le bot Python de Jobrick ne lit pas encore Supabase : il continue de
tourner sur ses fichiers locaux. Le brancher (lire le CV/zones depuis
Supabase, écrire les résultats dedans, notifier sur Discord) est un
chantier à part, à faire une fois le site validé.
