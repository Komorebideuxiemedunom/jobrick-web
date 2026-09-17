/**
 * Routes HTTP brutes (`/api/*`).
 *
 * Elles ne peuvent pas etre des server functions : Discord redirige le
 * navigateur vers le callback, et le scan ATS telecharge le CV comme un
 * fichier. On les branche via un middleware de requete, qui peut renvoyer une
 * `Response` directement.
 */
import { OAuthStates, Profiles, Sessions, Users } from "@jobrick/db"
import { Effect, Option } from "effect"
import { AppConfig } from "./config.ts"
import { profilDepuisCode, urlAutorisation } from "./discord.ts"
import { NOM_COOKIE } from "./session.ts"
import { run } from "./runtime.ts"

const serialiserCookie = (
  nom: string,
  valeur: string,
  opts: { readonly secure: boolean; readonly expires?: Date; readonly maxAge?: number },
): string => {
  const parts = [`${nom}=${valeur}`, "Path=/", "HttpOnly", "SameSite=Lax"]
  if (opts.secure) parts.push("Secure")
  if (opts.expires !== undefined) parts.push(`Expires=${opts.expires.toUTCString()}`)
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`)
  return parts.join("; ")
}

const redirection = (vers: string, setCookie?: string): Response => {
  const headers = new Headers({ Location: vers })
  if (setCookie !== undefined) headers.append("Set-Cookie", setCookie)
  return new Response(null, { status: 302, headers })
}

/** Page d'erreur minimale : on ne renvoie jamais le detail technique au navigateur. */
const erreurAuth = (message: string): Response =>
  redirection(`/?erreur=${encodeURIComponent(message)}`)

// ---------------------------------------------------------------------------
// GET /api/auth/discord — demarre la connexion
// ---------------------------------------------------------------------------
const demarrerConnexion = (url: URL) =>
  Effect.gen(function* () {
    const states = yield* OAuthStates
    const redirectTo = url.searchParams.get("redirectTo")
    // On n'accepte qu'un chemin interne : sinon le parametre devient un
    // redirecteur ouvert vers n'importe quel domaine.
    const cible =
      redirectTo !== null && /^\/(?!\/)/.test(redirectTo) ? redirectTo : null
    const state = yield* states.creer(cible)
    return redirection(yield* urlAutorisation(state))
  })

// ---------------------------------------------------------------------------
// GET /api/auth/discord/callback — Discord nous renvoie ici
// ---------------------------------------------------------------------------
const terminerConnexion = (url: URL) =>
  Effect.gen(function* () {
    const { cookieSecure } = yield* AppConfig

    if (url.searchParams.get("error") !== null) {
      return erreurAuth("Connexion Discord refusee.")
    }

    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (code === null || state === null) {
      return erreurAuth("Reponse Discord incomplete.")
    }

    const states = yield* OAuthStates
    const enregistre = yield* states.consommer(state)
    if (Option.isNone(enregistre)) {
      return erreurAuth("Lien de connexion expire — reessaie.")
    }

    const profil = yield* profilDepuisCode(code)
    const users = yield* Users
    const sessions = yield* Sessions
    const user = yield* users.upsertDepuisDiscord(profil)
    const { jeton, expiresAt } = yield* sessions.creer(user.id)

    return redirection(
      enregistre.value.redirectTo ?? "/dashboard",
      serialiserCookie(NOM_COOKIE, jeton, { secure: cookieSecure, expires: expiresAt }),
    )
  }).pipe(
    Effect.catchTags({
      OAuthError: (e) =>
        Effect.logWarning(`OAuth Discord echoue (${e.etape}) : ${e.detail}`).pipe(
          Effect.as(erreurAuth("Connexion impossible pour le moment.")),
        ),
    }),
  )

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
const deconnexion = (request: Request) =>
  Effect.gen(function* () {
    const { cookieSecure } = yield* AppConfig
    const jeton = lireCookie(request, NOM_COOKIE)
    if (jeton !== undefined) {
      const sessions = yield* Sessions
      yield* sessions.invalider(jeton)
    }
    return redirection(
      "/",
      serialiserCookie(NOM_COOKIE, "", { secure: cookieSecure, maxAge: 0 }),
    )
  })

// ---------------------------------------------------------------------------
// GET /api/cv — renvoie le CV de l'utilisateur connecte
//
// Le scan ATS tourne dans le navigateur : il lui faut le fichier, pas une
// analyse faite ailleurs. Le contenu du CV ne quitte donc jamais le couple
// "notre serveur / ton navigateur".
// ---------------------------------------------------------------------------
const telechargerCv = (request: Request) =>
  Effect.gen(function* () {
    const jeton = lireCookie(request, NOM_COOKIE)
    if (jeton === undefined) return new Response("Non autorise", { status: 401 })

    const sessions = yield* Sessions
    const user = yield* sessions.valider(jeton)
    if (Option.isNone(user)) return new Response("Non autorise", { status: 401 })

    const profiles = yield* Profiles
    const cv = yield* profiles.lireCv(user.value.id)
    if (Option.isNone(cv)) return new Response("Aucun CV", { status: 404 })

    return new Response(new Uint8Array(cv.value.data), {
      headers: {
        "Content-Type": cv.value.mime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(cv.value.filename)}"`,
        "Cache-Control": "private, no-store",
      },
    })
  })

const lireCookie = (request: Request, nom: string): string | undefined => {
  const brut = request.headers.get("cookie")
  if (brut === null) return undefined
  for (const morceau of brut.split(";")) {
    const [cle, ...reste] = morceau.trim().split("=")
    if (cle === nom) return reste.join("=")
  }
  return undefined
}

/**
 * Aiguillage des routes `/api/*`. Renvoie `undefined` si le chemin ne nous
 * concerne pas, pour que le middleware passe la main au routeur.
 */
export const traiterApi = (
  request: Request,
  pathname: string,
): Promise<Response> | undefined => {
  const url = new URL(request.url)

  if (pathname === "/api/auth/discord" && request.method === "GET") {
    return run(demarrerConnexion(url))
  }
  if (pathname === "/api/auth/discord/callback" && request.method === "GET") {
    return run(terminerConnexion(url))
  }
  if (pathname === "/api/auth/logout") {
    return run(deconnexion(request))
  }
  if (pathname === "/api/cv" && request.method === "GET") {
    return run(telechargerCv(request))
  }
  return undefined
}
