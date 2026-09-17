/**
 * Couche Postgres partagee par le site et le bot.
 *
 * `transformQueryNames` / `transformResultNames` font le pont entre le
 * snake_case de la base et le camelCase du code : on ecrit `notifyDm` partout
 * cote TypeScript, la colonne reste `notify_dm`.
 */
import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer, String } from "effect"

// Le type est laisse a l'inference : la couche fournit a la fois `PgClient` et
// le `SqlClient` generique, et c'est ce dernier que les depots consomment.
export const PgLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const url = yield* Config.redacted("DATABASE_URL")
    return PgClient.layer({
      url,
      transformQueryNames: String.camelToSnake,
      transformResultNames: String.snakeToCamel,
    })
  }),
)
