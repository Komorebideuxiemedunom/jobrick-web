/**
 * Migrateur minimal : joue les fichiers `migrations/*.sql` par ordre
 * alphabetique, un par transaction, et note ceux deja appliques.
 *
 * Volontairement ecrit a la main plutot qu'avec un outil : le schema est
 * petit, et un `.sql` lisible vaut mieux qu'une couche de plus a comprendre
 * quand le deploiement Dokploy le rejoue au demarrage.
 */
import { FileSystem } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { SqlClient } from "@effect/sql"
import { Effect, Layer } from "effect"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { PgLive } from "./sql.ts"

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
)

const program = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const fs = yield* FileSystem.FileSystem

  yield* sql`
    create table if not exists _migrations (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )
  `

  const appliquees = yield* sql<{ name: string }>`select name from _migrations`
  const deja = new Set(appliquees.map((r) => r.name))

  const fichiers = (yield* fs.readDirectory(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort()

  const aJouer = fichiers.filter((f) => !deja.has(f))
  if (aJouer.length === 0) {
    yield* Effect.log("Base deja a jour, rien a jouer.")
    return
  }

  for (const fichier of aJouer) {
    const contenu = yield* fs.readFileString(path.join(migrationsDir, fichier))
    yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql.unsafe(contenu)
          yield* sql`insert into _migrations ${sql.insert({ name: fichier })}`
        }),
      )
      .pipe(
        Effect.tap(() => Effect.log(`Migration appliquee : ${fichier}`)),
        Effect.tapError((e) =>
          Effect.logError(`Echec de ${fichier} : ${String(e)}`),
        ),
      )
  }
})

NodeRuntime.runMain(
  program.pipe(Effect.provide(Layer.mergeAll(PgLive, NodeContext.layer))),
)
