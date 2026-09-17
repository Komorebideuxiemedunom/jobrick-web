/**
 * Publication des commandes slash.
 *
 * Publiees globalement (et non par serveur) : le bot parle surtout en message
 * prive, ou seules les commandes globales existent. Discord met jusqu'a une
 * heure a les propager la premiere fois.
 */
import {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js"
import { Effect, Redacted } from "effect"
import { BotConfig } from "./config.ts"

const COMMANDES = [
  new SlashCommandBuilder()
    .setName("offres")
    .setDescription("Affiche tes 5 dernieres offres Jobrick")
    // Les deux modes d'installation. `UserInstall` permet d'utiliser la
    // commande en message prive sans passer par un serveur ; `GuildInstall`
    // reste necessaire pour que le bot puisse envoyer un DM de lui-meme.
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ])
    // Sans `BotDM`, la commande n'existe pas dans la conversation privee avec
    // le bot — c'est pourtant la que tout se passe.
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
      InteractionContextType.Guild,
    ])
    .toJSON(),
]

export const publierCommandes = Effect.gen(function* () {
  const { token, applicationId } = yield* BotConfig
  const rest = new REST().setToken(Redacted.value(token))
  yield* Effect.tryPromise({
    try: () =>
      rest.put(Routes.applicationCommands(applicationId), { body: COMMANDES }),
    catch: (cause) =>
      new Error(`Publication des commandes impossible : ${String(cause)}`),
  })
  yield* Effect.log(`${COMMANDES.length} commande(s) publiee(s)`)
})
