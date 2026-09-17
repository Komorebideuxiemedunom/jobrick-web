/**
 * Liste d'invitations : qui a le droit d'ouvrir un compte.
 *
 * Le controle se fait a la connexion, avant meme la creation de la ligne
 * `users` : un inconnu ne laisse donc aucune trace. Corollaire, retirer
 * quelqu'un de la liste ne le deconnecte pas tout seul, sa session vit sa
 * vie ; `retirer` s'en charge explicitement.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export interface Invitation {
  readonly discordId: string
  readonly invitePar: string | null
  readonly note: string | null
  readonly createdAt: Date
}

export class Invitations extends Effect.Service<Invitations>()("db/Invitations", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      autorise: (discordId: string) =>
        sql<{ discordId: string }>`
          select discord_id from invitations where discord_id = ${discordId}
        `.pipe(Effect.map((lignes) => lignes.length > 0)),

      /** Renvoie `false` si la personne etait deja invitee. */
      ajouter: (
        discordId: string,
        details: { readonly invitePar: string | null; readonly note: string | null },
      ) =>
        sql<{ discordId: string }>`
          insert into invitations (discord_id, invite_par, note)
          values (${discordId}, ${details.invitePar}, ${details.note})
          on conflict (discord_id) do nothing
          returning discord_id
        `.pipe(Effect.map((lignes) => lignes.length > 0)),

      /**
       * Retire l'invitation et coupe les sessions ouvertes, sinon la personne
       * resterait connectee jusqu'a l'expiration du cookie, soit trente jours.
       * Le compte et ses donnees restent en base : les supprimer est une autre
       * decision, qui se prend a la main.
       */
      retirer: (discordId: string) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const lignes = yield* sql<{ discordId: string }>`
              delete from invitations where discord_id = ${discordId}
              returning discord_id
            `
            yield* sql`
              delete from sessions
              where user_id in (select id from users where discord_id = ${discordId})
            `
            return lignes.length > 0
          }),
        ),

      lister: () =>
        sql<Invitation>`
          select discord_id, invite_par, note, created_at
          from invitations order by created_at
        `,
    }
  }),
}) {}
