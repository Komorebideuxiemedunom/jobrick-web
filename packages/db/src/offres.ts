/**
 * Offres trouvees par la veille.
 *
 * Chaque mutation porte son `user_id` dans le `where` : c'est ce qui remplace
 * les policies RLS de la v1 Supabase. Une offre qui n'appartient pas a
 * l'appelant n'est simplement jamais touchee.
 */
import { SqlClient } from "@effect/sql"
import { JobResult, type JobResultId, type UserId } from "@jobrick/core"
import { Effect, Schema } from "effect"

const decodeOffres = Schema.decodeUnknown(Schema.Array(JobResult))

const CHAMPS = [
  "id", "user_id", "titre", "employeur", "lieu", "url", "score", "raison",
  "conseil_candidature", "source", "vu", "postule", "postule_at", "interet",
  "notified_at", "created_at",
] as const

const COLONNES = CHAMPS.join(", ")
/** Memes colonnes, prefixees, pour les requetes qui joignent `users`. */
const COLONNES_J = CHAMPS.map((c) => `j.${c}`).join(", ")

/** Offre a notifier, accompagnee de l'identifiant Discord du destinataire. */
export const OffreANotifier = Schema.Struct({
  id: Schema.UUID,
  discordId: Schema.String,
  titre: Schema.NullOr(Schema.String),
  employeur: Schema.NullOr(Schema.String),
  lieu: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  score: Schema.NullOr(Schema.Int),
  raison: Schema.NullOr(Schema.String),
})
export type OffreANotifier = typeof OffreANotifier.Type

const decodeANotifier = Schema.decodeUnknown(Schema.Array(OffreANotifier))

export class JobResults extends Effect.Service<JobResults>()("db/JobResults", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      parUtilisateur: (userId: UserId, limite = 100) =>
        sql`
          select ${sql.unsafe(COLONNES)} from job_results
          where user_id = ${userId}
          order by created_at desc
          limit ${limite}
        `.pipe(Effect.flatMap(decodeOffres)),

      marquerVue: (userId: UserId, id: JobResultId) =>
        sql`
          update job_results set vu = true
          where id = ${id} and user_id = ${userId}
        `.pipe(Effect.asVoid),

      definirPostule: (userId: UserId, id: JobResultId, postule: boolean) =>
        sql`
          update job_results set
            postule    = ${postule},
            postule_at = ${postule ? new Date() : null}
          where id = ${id} and user_id = ${userId}
        `.pipe(Effect.asVoid),

      /** Tri facon swipe : marque aussi l'offre comme vue. */
      definirInteret: (userId: UserId, id: JobResultId, interet: boolean) =>
        sql`
          update job_results set interet = ${interet}, vu = true
          where id = ${id} and user_id = ${userId}
        `.pipe(Effect.asVoid),

      // ----------------------------------------------------------------
      // Cote bot
      // ----------------------------------------------------------------

      /**
       * File d'attente des DM : offres jamais notifiees, dont le proprietaire
       * a laisse les DM actives. On borne le lot pour ne pas se faire couper
       * par le rate limit Discord sur un gros passage de veille.
       */
      aNotifier: (lot = 25) =>
        sql`
          select j.id, u.discord_id, j.titre, j.employeur, j.lieu, j.url, j.score, j.raison
          from job_results j
          join users u    on u.id = j.user_id
          join profiles p on p.user_id = j.user_id
          where j.notified_at is null and p.notify_dm = true
          order by j.created_at
          limit ${lot}
        `.pipe(Effect.flatMap(decodeANotifier)),

      marquerNotifiees: (ids: ReadonlyArray<string>) =>
        ids.length === 0
          ? Effect.void
          : sql`
              update job_results set notified_at = now()
              where id in ${sql.in(ids)}
            `.pipe(Effect.asVoid),

      /**
       * Mutation declenchee par un bouton de DM : on passe par l'identifiant
       * Discord, seul element dont le bot dispose.
       */
      definirInteretParDiscord: (
        discordId: string,
        id: string,
        interet: boolean,
      ) =>
        sql`
          update job_results j set interet = ${interet}, vu = true
          from users u
          where j.id = ${id} and j.user_id = u.id and u.discord_id = ${discordId}
        `.pipe(Effect.asVoid),

      definirPostuleParDiscord: (discordId: string, id: string) =>
        sql`
          update job_results j set postule = true, postule_at = now(), vu = true
          from users u
          where j.id = ${id} and j.user_id = u.id and u.discord_id = ${discordId}
        `.pipe(Effect.asVoid),

      dernieresParDiscord: (discordId: string, limite = 5) =>
        sql`
          select ${sql.unsafe(COLONNES_J)}
          from job_results j join users u on u.id = j.user_id
          where u.discord_id = ${discordId} and coalesce(j.interet, true) = true
          order by j.created_at desc
          limit ${limite}
        `.pipe(Effect.flatMap(decodeOffres)),
    }
  }),
}) {}
