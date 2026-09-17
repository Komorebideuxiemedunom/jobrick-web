/**
 * Runtime Effect du serveur web.
 *
 * Un seul runtime pour tout le process : il porte le pool Postgres et le
 * client HTTP. Les server functions et le middleware de requete y lancent
 * leurs effets via `run`.
 */
import { FetchHttpClient } from "@effect/platform"
import { DbLive } from "@jobrick/db"
import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect"

const MainLayer = Layer.mergeAll(DbLive, FetchHttpClient.layer)

export const runtime = ManagedRuntime.make(MainLayer)

export type MainServices = Layer.Layer.Success<typeof MainLayer>

/**
 * Execute un effet et transforme un echec en exception rejetee, pour que
 * TanStack Start le remonte comme n'importe quelle erreur de server function.
 * Les erreurs metier attendues sont modelisees dans le canal succes par les
 * appelants ; ce qui arrive ici est un vrai defaut.
 */
export const run = async <A, E>(
  effet: Effect.Effect<A, E, MainServices>,
): Promise<A> => {
  const exit = await runtime.runPromiseExit(effet)
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error(Cause.pretty(exit.cause))
}
