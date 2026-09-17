/**
 * Session cote serveur : lecture du cookie, resolution de l'utilisateur.
 *
 * Le cookie ne contient qu'un secret opaque ; tout l'etat est en base. Pas de
 * JWT : une deconnexion doit pouvoir invalider immediatement, ce qu'un jeton
 * auto-porte ne permet pas.
 */
import { NonAutorise, type User } from "@jobrick/core"
import { Sessions } from "@jobrick/db"
import { getCookie } from "@tanstack/react-start/server"
import { Effect, Option } from "effect"

export const NOM_COOKIE = "jobrick_session"

/** Attributs communs au cookie de session, poses et effaces a l'identique. */
export const optionsCookie = (secure: boolean) => ({
  httpOnly: true,
  secure,
  // `lax` et non `strict` : le retour de Discord est une navigation
  // cross-site, un cookie `strict` ne serait pas renvoye sur ce hop.
  sameSite: "lax" as const,
  path: "/",
})

/** L'utilisateur connecte, ou `None` si le cookie est absent/perime. */
export const utilisateurCourant = (): Effect.Effect<
  Option.Option<User>,
  never,
  Sessions
> =>
  Effect.gen(function* () {
    const jeton = getCookie(NOM_COOKIE)
    if (jeton === undefined) return Option.none<User>()
    const sessions = yield* Sessions
    return yield* sessions.valider(jeton)
  }).pipe(
    // Une panne de session ne doit pas casser la page : on deconnecte.
    Effect.catchAll(() => Effect.succeed(Option.none<User>())),
  )

/** Idem, mais echoue si personne n'est connecte : pour les actions protegees. */
export const exigerUtilisateur = (): Effect.Effect<
  User,
  NonAutorise,
  Sessions
> =>
  utilisateurCourant().pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(new NonAutorise({ raison: "Session absente ou expiree" })),
        onSome: Effect.succeed,
      }),
    ),
  )
