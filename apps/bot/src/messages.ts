/**
 * Mise en forme des messages prives.
 *
 * C'est ce qui remplace le webhook de la v1 : au lieu d'un texte pousse dans
 * un salon partage (ou tout le monde voyait les offres de tout le monde), un
 * DM personnel, avec des boutons qui repondent directement en base.
 */
import type { OffreANotifier } from "@jobrick/db"
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageCreateOptions,
} from "discord.js"

/** Prefixes des `customId` : c'est la seule donnee que Discord nous rend. */
export const ACTION = {
  garder: "offre:garder",
  ecarter: "offre:ecarter",
  postule: "offre:postule",
} as const

const MAUVE = 0x8c4a94

const couleurScore = (score: number | null): number =>
  score === null ? MAUVE : score >= 75 ? 0x1f8b5c : score >= 45 ? 0xd98324 : MAUVE

export const messageOffre = (
  offre: OffreANotifier,
  publicUrl: string,
): MessageCreateOptions => {
  const embed = new EmbedBuilder()
    .setColor(couleurScore(offre.score))
    .setTitle(offre.titre ?? "Offre sans titre")
    .setDescription(offre.raison ?? "Nouvelle offre reperee par ta veille.")
    .addFields(
      { name: "Employeur", value: offre.employeur ?? "—", inline: true },
      { name: "Lieu", value: offre.lieu ?? "—", inline: true },
      {
        name: "Score",
        value: offre.score === null ? "—" : `${offre.score}/100`,
        inline: true,
      },
    )
    .setFooter({ text: "Jobrick · ta veille tourne deux fois par jour" })
    .setTimestamp(new Date())

  if (offre.url !== null) embed.setURL(offre.url)

  const boutons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ACTION.garder}:${offre.id}`)
      .setLabel("Interessant")
      .setEmoji("💜")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${ACTION.ecarter}:${offre.id}`)
      .setLabel("Passer")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${ACTION.postule}:${offre.id}`)
      .setLabel("J'ai postule")
      .setStyle(ButtonStyle.Primary),
  )

  const liens = new ActionRowBuilder<ButtonBuilder>()
  if (offre.url !== null) {
    liens.addComponents(
      new ButtonBuilder()
        .setLabel("Voir l'offre")
        .setURL(offre.url)
        .setStyle(ButtonStyle.Link),
    )
  }
  liens.addComponents(
    new ButtonBuilder()
      .setLabel("Mon tableau de bord")
      .setURL(`${publicUrl.replace(/\/+$/, "")}/dashboard`)
      .setStyle(ButtonStyle.Link),
  )

  return { embeds: [embed], components: [boutons, liens] }
}
