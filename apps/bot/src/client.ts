/**
 * Client Discord, expose comme service Effect.
 *
 * La connexion a la passerelle est un `acquireRelease` : elle se ferme
 * proprement quand le programme s'arrete, ce qui evite de laisser une session
 * fantome cote Discord au redemarrage d'un conteneur.
 */
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Interaction,
  type MessageCreateOptions,
} from "discord.js"
import { Effect, Redacted, Stream } from "effect"
import { BotConfig } from "./config.ts"

export class DiscordClient extends Effect.Service<DiscordClient>()(
  "bot/DiscordClient",
  {
    scoped: Effect.gen(function* () {
      const { token } = yield* BotConfig

      const client = yield* Effect.acquireRelease(
        Effect.gen(function* () {
          const c = new Client({
            // `Guilds` seul suffit : le bot n'a pas besoin de lire les
            // messages, juste d'en envoyer en prive. `Partials.Channel` est
            // indispensable pour recevoir les evenements de DM.
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
            partials: [Partials.Channel],
          })
          yield* Effect.tryPromise({
            try: () => c.login(Redacted.value(token)),
            catch: (cause) =>
              new Error(`Connexion Discord impossible : ${String(cause)}`),
          })
          yield* Effect.async<void>((reprendre) => {
            if (c.isReady()) return reprendre(Effect.void)
            c.once(Events.ClientReady, () => reprendre(Effect.void))
          })
          yield* Effect.log(`Bot connecte en tant que ${c.user?.tag ?? "?"}`)
          return c
        }),
        (c) => Effect.promise(() => c.destroy()),
      )

      /** Envoie un message prive ; `false` si l'utilisateur les refuse. */
      const envoyerDm = (discordId: string, message: MessageCreateOptions) =>
        Effect.tryPromise({
          try: async () => {
            const user = await client.users.fetch(discordId)
            await user.send(message)
            return true
          },
          catch: (cause) => cause,
        }).pipe(
          // Un DM refuse (parametres de confidentialite, bot bloque) n'est pas
          // une panne : on le note et on passe a l'offre suivante.
          Effect.catchAll((cause) =>
            Effect.logWarning(
              `DM impossible vers ${discordId} : ${String(cause)}`,
            ).pipe(Effect.as(false)),
          ),
        )

      /** Flux des interactions (boutons, commandes). */
      const interactions = Stream.async<Interaction>((emettre) => {
        const handler = (i: Interaction) => {
          emettre.single(i)
        }
        client.on(Events.InteractionCreate, handler)
        return Effect.sync(() => {
          client.off(Events.InteractionCreate, handler)
        })
      })

      return { client, envoyerDm, interactions }
    }),
  },
) {}
