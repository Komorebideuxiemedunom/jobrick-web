/**
 * Reponses aux boutons des DM et a la commande `/offres`.
 *
 * Toutes les mutations passent par l'identifiant Discord de l'auteur de
 * l'interaction : quelqu'un qui rejouerait un `customId` vu ailleurs ne
 * toucherait que ses propres offres, jamais celles d'un autre.
 */
import { JobResults } from "@jobrick/db"
import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Interaction,
  type RepliableInteraction,
} from "discord.js"
import { Effect, Stream } from "effect"
import { DiscordClient } from "./client.ts"
import { BotConfig } from "./config.ts"
import { ACTION } from "./messages.ts"

const repondre = (interaction: RepliableInteraction, contenu: string) =>
  Effect.tryPromise(() =>
    interaction.reply({ content: contenu, flags: MessageFlags.Ephemeral }),
  ).pipe(Effect.ignore)

const traiterBouton = (
  discordId: string,
  customId: string,
  interaction: RepliableInteraction,
) =>
  Effect.gen(function* () {
    const offres = yield* JobResults
    // `customId` = "offre:<action>:<uuid>" — l'UUID est la fin, pas le 3e champ
    // si jamais un prefixe evolue.
    const separateur = customId.lastIndexOf(":")
    const prefixe = customId.slice(0, separateur)
    const id = customId.slice(separateur + 1)

    switch (prefixe) {
      case ACTION.garder:
        yield* offres.definirInteretParDiscord(discordId, id, true)
        return yield* repondre(interaction, "Gardee 💜 — elle reste en haut de ta liste.")
      case ACTION.ecarter:
        yield* offres.definirInteretParDiscord(discordId, id, false)
        return yield* repondre(interaction, "Ecartee — je ne te la remontrerai pas.")
      case ACTION.postule:
        yield* offres.definirPostuleParDiscord(discordId, id)
        return yield* repondre(
          interaction,
          "Note comme postulee. Je te rappellerai de relancer dans 7 jours.",
        )
      default:
        return yield* repondre(interaction, "Action inconnue.")
    }
  })

const traiterCommande = (interaction: ChatInputCommandInteraction) =>
  Effect.gen(function* () {
    if (interaction.commandName !== "offres") return
    const { publicUrl } = yield* BotConfig
    const offres = yield* JobResults
    const dernieres = yield* offres.dernieresParDiscord(interaction.user.id, 5)

    const contenu =
      dernieres.length === 0
        ? "Rien pour l'instant — la veille tourne deux fois par jour."
        : dernieres
            .map(
              (o) =>
                `**${o.score ?? "–"}** · ${o.titre ?? "Sans titre"} — ` +
                `${o.employeur ?? "?"} (${o.lieu ?? "?"})` +
                (o.url === null ? "" : `\n${o.url}`),
            )
            .join("\n\n") +
          `\n\nTout est sur ${publicUrl.replace(/\/+$/, "")}/dashboard`

    yield* repondre(interaction, contenu)
  })

const traiter = (interaction: Interaction) => {
  if (interaction.isButton()) {
    return traiterBouton(
      interaction.user.id,
      interaction.customId,
      interaction,
    )
  }
  if (interaction.isChatInputCommand()) return traiterCommande(interaction)
  return Effect.void
}

export const boucleInteractions = Effect.gen(function* () {
  const discord = yield* DiscordClient
  yield* discord.interactions.pipe(
    Stream.runForEach((interaction) =>
      traiter(interaction).pipe(
        // Une interaction ratee ne doit pas interrompre le flux des suivantes.
        Effect.catchAllCause((cause) =>
          Effect.logError("Interaction echouee", cause),
        ),
      ),
    ),
  )
})
