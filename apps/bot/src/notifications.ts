/**
 * Boucle d'annonce : va chercher les offres jamais notifiees et les envoie en
 * message prive.
 *
 * Une offre n'est marquee comme notifiee que si le DM est effectivement parti.
 * Si l'utilisateur refuse les messages prives, elle reste en file — il la
 * verra sur le dashboard, et la recevra si un jour il les rouvre.
 */
import { JobResults } from "@jobrick/db"
import { Effect, Schedule } from "effect"
import { DiscordClient } from "./client.ts"
import { BotConfig } from "./config.ts"
import { messageOffre } from "./messages.ts"

const unPassage = Effect.gen(function* () {
  const { publicUrl, lot } = yield* BotConfig
  const offres = yield* JobResults
  const discord = yield* DiscordClient

  const aEnvoyer = yield* offres.aNotifier(lot)
  if (aEnvoyer.length === 0) return

  yield* Effect.log(`${aEnvoyer.length} offre(s) a annoncer`)

  // En serie et non en parallele : Discord limite le rythme des DM, et rien
  // ne presse une veille qui tourne deux fois par jour.
  const envoyees: Array<string> = []
  for (const offre of aEnvoyer) {
    const ok = yield* discord.envoyerDm(
      offre.discordId,
      messageOffre(offre, publicUrl),
    )
    if (ok) envoyees.push(offre.id)
  }

  yield* offres.marquerNotifiees(envoyees)
  yield* Effect.log(`${envoyees.length} DM envoye(s)`)
})

export const boucleNotifications = Effect.gen(function* () {
  const { intervalle } = yield* BotConfig
  yield* unPassage.pipe(
    // Un passage qui echoue (base injoignable, coupure reseau) ne doit pas
    // tuer la boucle : on journalise et on retentera au prochain tour.
    Effect.catchAllCause((cause) =>
      Effect.logError("Passage de notifications echoue", cause),
    ),
    Effect.repeat(Schedule.spaced(intervalle)),
  )
})
