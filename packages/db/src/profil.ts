/** Profil de veille (preferences + CV) et zones geographiques. */
import { SqlClient } from "@effect/sql"
import { Profile, Zone, type UserId, type ZoneInput } from "@jobrick/core"
import { Effect, Option, Schema } from "effect"

const decodeProfile = Schema.decodeUnknown(Profile)
const decodeZones = Schema.decodeUnknown(Schema.Array(Zone))

const COLONNES_PROFIL = "user_id, job_keywords, notify_dm, cv_filename, cv_mime, cv_size, cv_uploaded_at, updated_at"

export class Profiles extends Effect.Service<Profiles>()("db/Profiles", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      /**
       * La ligne est creee a la premiere connexion (cf. `Users`), mais on
       * garde un `insert ... on conflict` ici pour rester robuste si un
       * utilisateur a ete cree autrement (import, script du bot).
       */
      get: (userId: UserId) =>
        Effect.gen(function* () {
          const lignes = yield* sql`
            insert into profiles (user_id) values (${userId})
            on conflict (user_id) do update set user_id = excluded.user_id
            returning ${sql.unsafe(COLONNES_PROFIL)}
          `
          return yield* decodeProfile(lignes[0])
        }),

      enregistrer: (
        userId: UserId,
        prefs: { readonly jobKeywords: string; readonly notifyDm: boolean },
      ) =>
        sql`
          update profiles set
            job_keywords = ${prefs.jobKeywords},
            notify_dm    = ${prefs.notifyDm},
            updated_at   = now()
          where user_id = ${userId}
        `.pipe(Effect.asVoid),

      /**
       * Le CV vit dans Postgres (bytea) : quelques centaines de Ko, une ligne
       * par utilisateur. Une sauvegarde de la base emporte les CV avec elle,
       * et il n'y a ni volume ni bucket a administrer.
       */
      enregistrerCv: (
        userId: UserId,
        cv: {
          readonly filename: string
          readonly mime: string
          readonly data: Uint8Array
        },
      ) =>
        sql`
          update profiles set
            cv_filename    = ${cv.filename},
            cv_mime        = ${cv.mime},
            cv_size        = ${cv.data.byteLength},
            cv_data        = ${Buffer.from(cv.data)},
            cv_uploaded_at = now(),
            updated_at     = now()
          where user_id = ${userId}
        `.pipe(Effect.asVoid),

      lireCv: (userId: UserId) =>
        sql<{
          cvFilename: string | null
          cvMime: string | null
          cvData: Uint8Array | null
        }>`
          select cv_filename, cv_mime, cv_data from profiles where user_id = ${userId}
        `.pipe(
          Effect.map((rows) => {
            const r = rows[0]
            return r === undefined || r.cvData === null || r.cvFilename === null
              ? Option.none()
              : Option.some({
                  filename: r.cvFilename,
                  mime: r.cvMime ?? "application/octet-stream",
                  data: r.cvData,
                })
          }),
        ),
    }
  }),
}) {}

export class Zones extends Effect.Service<Zones>()("db/Zones", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      parUtilisateur: (userId: UserId) =>
        sql`
          select id, user_id, label, lat, lng, rayon_km
          from zones where user_id = ${userId} order by created_at
        `.pipe(Effect.flatMap(decodeZones)),

      /**
       * Remplacement integral, dans une transaction : la carte est la source
       * de verite, et reconcilier zone par zone n'apporterait rien ici (une
       * poignee de lignes, editees d'un bloc depuis le dashboard).
       */
      remplacer: (userId: UserId, zones: ReadonlyArray<ZoneInput>) =>
        sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`delete from zones where user_id = ${userId}`
            if (zones.length === 0) return
            yield* sql`
              insert into zones ${sql.insert(
                zones.map((z) => ({
                  userId,
                  label: z.label,
                  lat: z.lat,
                  lng: z.lng,
                  rayonKm: z.rayonKm,
                })),
              )}
            `
          }),
        ),
    }
  }),
}) {}
