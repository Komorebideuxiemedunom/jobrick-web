/**
 * Identite et sessions.
 *
 * L'identite vient de Discord : plus de mot de passe, plus de provider Google.
 * Le jeton de session est un secret aleatoire remis au navigateur ; la base
 * n'en garde que le SHA-256, pour qu'un dump ne permette pas de se faire
 * passer pour quelqu'un.
 */
import { SqlClient } from "@effect/sql"
import { User, type UserId } from "@jobrick/core"
import { Effect, Option, Schema } from "effect"
import * as crypto from "node:crypto"

/** Duree d'une session : 30 jours, prolongee quand il en reste moins de la moitie. */
export const DUREE_SESSION_MS = 30 * 24 * 3600 * 1000

const hacher = (jeton: string): string =>
  crypto.createHash("sha256").update(jeton).digest("hex")

const decodeUser = Schema.decodeUnknown(User)

/** Ce que l'API Discord nous renvoie sur `/users/@me`. */
export const DiscordProfile = Schema.Struct({
  id: Schema.String,
  username: Schema.String,
  global_name: Schema.NullishOr(Schema.String),
  avatar: Schema.NullishOr(Schema.String),
  email: Schema.NullishOr(Schema.String),
})
export type DiscordProfile = typeof DiscordProfile.Type

export class Users extends Effect.Service<Users>()("db/Users", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      /**
       * Cree l'utilisateur a la premiere connexion, sinon rafraichit son
       * pseudo/avatar (ils changent cote Discord). Cree aussi la ligne
       * `profiles` au passage : le dashboard n'a jamais a gerer son absence.
       */
      upsertDepuisDiscord: (p: DiscordProfile) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const lignes = yield* sql`
              insert into users (discord_id, username, global_name, avatar, email)
              values (${p.id}, ${p.username}, ${p.global_name ?? null},
                      ${p.avatar ?? null}, ${p.email ?? null})
              on conflict (discord_id) do update set
                username    = excluded.username,
                global_name = excluded.global_name,
                avatar      = excluded.avatar,
                email       = excluded.email,
                updated_at  = now()
              returning id, discord_id, username, global_name, avatar, email, created_at
            `
            const user = yield* decodeUser(lignes[0])
            yield* sql`
              insert into profiles (user_id) values (${user.id})
              on conflict (user_id) do nothing
            `
            return user
          }),
        ),
    }
  }),
}) {}

export class Sessions extends Effect.Service<Sessions>()("db/Sessions", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      /** Renvoie le jeton en clair : c'est la seule fois ou il existe. */
      creer: (userId: UserId) =>
        Effect.gen(function* () {
          const jeton = crypto.randomBytes(32).toString("base64url")
          const expiresAt = new Date(Date.now() + DUREE_SESSION_MS)
          yield* sql`
            insert into sessions (id, user_id, expires_at)
            values (${hacher(jeton)}, ${userId}, ${expiresAt})
          `
          return { jeton, expiresAt }
        }),

      /**
       * Valide un jeton et renvoie l'utilisateur. Supprime la session si elle
       * a expire, et la prolonge s'il reste moins de la moitie de sa duree.
       */
      valider: (jeton: string) =>
        Effect.gen(function* () {
          const id = hacher(jeton)
          const lignes = yield* sql<{
            expiresAt: Date
            id: string
            discordId: string
            username: string
            globalName: string | null
            avatar: string | null
            email: string | null
            createdAt: Date
          }>`
            select s.expires_at,
                   u.id, u.discord_id, u.username, u.global_name,
                   u.avatar, u.email, u.created_at
            from sessions s join users u on u.id = s.user_id
            where s.id = ${id}
          `
          const ligne = lignes[0]
          if (ligne === undefined) return Option.none<User>()

          if (ligne.expiresAt.getTime() <= Date.now()) {
            yield* sql`delete from sessions where id = ${id}`
            return Option.none<User>()
          }

          if (ligne.expiresAt.getTime() - Date.now() < DUREE_SESSION_MS / 2) {
            yield* sql`
              update sessions set expires_at = ${new Date(Date.now() + DUREE_SESSION_MS)}
              where id = ${id}
            `
          }

          const { expiresAt: _ignore, ...user } = ligne
          return Option.some(yield* decodeUser(user))
        }),

      invalider: (jeton: string) =>
        sql`delete from sessions where id = ${hacher(jeton)}`.pipe(Effect.asVoid),
    }
  }),
}) {}

export class OAuthStates extends Effect.Service<OAuthStates>()("db/OAuthStates", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      creer: (redirectTo: string | null) =>
        Effect.gen(function* () {
          const state = crypto.randomBytes(24).toString("base64url")
          yield* sql`
            insert into oauth_states (state, redirect_to) values (${state}, ${redirectTo})
          `
          // Purge opportuniste : un state non consomme n'a aucune valeur
          // passe 10 minutes, inutile d'ajouter une tache planifiee pour ca.
          yield* sql`delete from oauth_states where created_at < now() - interval '10 minutes'`
          return state
        }),

      /** Un state ne sert qu'une fois : on le supprime en le lisant. */
      consommer: (state: string) =>
        sql<{ redirectTo: string | null }>`
          delete from oauth_states where state = ${state} returning redirect_to
        `.pipe(Effect.map((rows) => Option.fromNullable(rows[0]))),
    }
  }),
}) {}
