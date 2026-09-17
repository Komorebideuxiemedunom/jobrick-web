/**
 * Bot Jobrick.
 *
 * Deux boucles concurrentes : l'une annonce les nouvelles offres en message
 * prive, l'autre repond aux boutons et aux commandes. Si l'une s'arrete, le
 * process s'arrete — un bot a moitie vivant est pire qu'un bot mort, le
 * superviseur (Dokploy) le relancera.
 */
import { NodeRuntime } from "@effect/platform-node"
import { DbLive } from "@jobrick/db"
import { Effect, Layer } from "effect"
import { DiscordClient } from "./client.ts"
import { publierCommandes } from "./commandes.ts"
import { boucleInteractions } from "./interactions.ts"
import { boucleNotifications } from "./notifications.ts"

const programme = Effect.gen(function* () {
  yield* publierCommandes
  yield* Effect.log("Jobrick est en ligne")
  yield* Effect.all([boucleNotifications, boucleInteractions], {
    concurrency: "unbounded",
  })
})

NodeRuntime.runMain(
  programme.pipe(
    Effect.provide(Layer.mergeAll(DbLive, DiscordClient.Default)),
    Effect.scoped,
  ),
)
