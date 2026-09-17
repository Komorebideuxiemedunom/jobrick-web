/**
 * Reponses aux boutons des DM et aux commandes slash.
 *
 * Toutes les mutations passent par l'identifiant Discord de l'auteur de
 * l'interaction : quelqu'un qui rejouerait un `customId` vu ailleurs ne
 * toucherait que ses propres offres, jamais celles d'un autre.
 */
import { Invitations, JobResults } from "@jobrick/db"
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
    // `customId` = "offre:<action>:<uuid>" : l'UUID est la fin, pas le 3e champ
    // si jamais un prefixe evolue.
    const separateur = customId.lastIndexOf(":")
    const prefixe = customId.slice(0, separateur)
    const id = customId.slice(separateur + 1)

    switch (prefixe) {
      case ACTION.garder:
        yield* offres.definirInteretParDiscord(discordId, id, true)
        return yield* repondre(interaction, "Gardee 💜 : elle reste en haut de ta liste.")
      case ACTION.ecarter:
        yield* offres.definirInteretParDiscord(discordId, id, false)
        return yield* repondre(interaction, "Ecartee : je ne te la remontrerai pas.")
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

/**
 * `/inviter` : la liste des personnes autorisees se tient depuis Discord,
 * c'est-a-dire la ou la demande d'acces arrive. Une mention porte deja
 * l'identifiant, donc personne n'a a aller le chercher dans ses reglages.
 */
const traiterInvitation = (interaction: ChatInputCommandInteraction) =>
  Effect.gen(function* () {
    const { proprietaire } = yield* BotConfig
    if (proprietaire === null) {
      return yield* repondre(
        interaction,
        "Personne n'est déclaré propriétaire : renseigne `DISCORD_PROPRIETAIRE`.",
      )
    }
    if (interaction.user.id !== proprietaire) {
      return yield* repondre(interaction, "Cette commande n'est pas pour toi.")
    }

    const invitations = yield* Invitations
    const sous = interaction.options.getSubcommand()

    if (sous === "liste") {
      const lignes = yield* invitations.lister()
      return yield* repondre(
        interaction,
        lignes.length === 0
          ? "Personne d'autre que toi pour l'instant."
          : lignes
              .map(
                (i) =>
                  `<@${i.discordId}> (\`${i.discordId}\`)` +
                  (i.note === null ? "" : ` : ${i.note}`),
              )
              .join("\n"),
      )
    }

    const cible =
      interaction.options.getUser("personne")?.id ??
      interaction.options.getString("identifiant")?.trim() ??
      null
    if (cible === null || !/^\d{17,20}$/.test(cible)) {
      return yield* repondre(
        interaction,
        "Il me faut une personne ou un identifiant Discord valide.",
      )
    }
    if (cible === proprietaire) {
      return yield* repondre(interaction, "Tu es déjà autorisé, par construction.")
    }

    if (sous === "ajouter") {
      const nouveau = yield* invitations.ajouter(cible, {
        invitePar: interaction.user.id,
        note: interaction.options.getString("note"),
      })
      return yield* repondre(
        interaction,
        nouveau
          ? `<@${cible}> peut maintenant se connecter à Jobrick.`
          : `<@${cible}> était déjà sur la liste.`,
      )
    }

    const retire = yield* invitations.retirer(cible)
    return yield* repondre(
      interaction,
      retire
        ? `<@${cible}> n'a plus accès, et ses sessions sont fermées. ` +
            "Son compte et son CV restent en base."
        : `<@${cible}> n'était pas sur la liste.`,
    )
  })

const traiterOffres = (interaction: ChatInputCommandInteraction) =>
  Effect.gen(function* () {
    const { publicUrl } = yield* BotConfig
    const offres = yield* JobResults
    const dernieres = yield* offres.dernieresParDiscord(interaction.user.id, 5)

    const contenu =
      dernieres.length === 0
        ? "Rien pour l'instant : la veille tourne deux fois par jour."
        : dernieres
            .map(
              (o) =>
                `**${o.score ?? "–"}** · ${o.titre ?? "Sans titre"} : ` +
                `${o.employeur ?? "?"} (${o.lieu ?? "?"})` +
                (o.url === null ? "" : `\n${o.url}`),
            )
            .join("\n\n") +
          `\n\nTout est sur ${publicUrl.replace(/\/+$/, "")}/dashboard`

    yield* repondre(interaction, contenu)
  })

// `Effect.gen` plutot qu'une suite de `return` : il unifie les erreurs et les
// services des branches, la ou un union d'effets bloquerait l'inference.
const traiter = (interaction: Interaction) =>
  Effect.gen(function* () {
    if (interaction.isButton()) {
      return yield* traiterBouton(
        interaction.user.id,
        interaction.customId,
        interaction,
      )
    }
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case "offres":
          return yield* traiterOffres(interaction)
        case "inviter":
          return yield* traiterInvitation(interaction)
      }
    }
  })

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
