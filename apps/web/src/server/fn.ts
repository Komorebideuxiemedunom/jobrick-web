/**
 * Server functions : tout ce que le dashboard declenche cote serveur.
 *
 * Chacune commence par `exigerUtilisateur()` : l'autorisation est ici, plus
 * dans des policies de base comme en v1. Les depots, eux, portent toujours le
 * `user_id` dans leur `where`, ce qui fait une seconde barriere.
 */
import {
  CvInvalide,
  JobResultId,
  ZoneInput,
  type JobResult,
  type Profile,
  type User,
  type Zone,
} from "@jobrick/core"
import { JobResults, Profiles, Zones } from "@jobrick/db"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Option, Schema } from "effect"
import type { DashboardDto, OffreDto, ProfileDto, UserDto, ZoneDto } from "./dto.ts"
import { run } from "./runtime.ts"
import { exigerUtilisateur, utilisateurCourant } from "./session.ts"

const TAILLE_CV_MAX = 10 * 1024 * 1024
const EXTENSIONS_CV = [".pdf", ".doc", ".docx"]

const versUserDto = (u: User): UserDto => ({
  id: u.id,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
})

const versProfileDto = (p: Profile): ProfileDto => ({
  jobKeywords: p.jobKeywords,
  notifyDm: p.notifyDm,
  cvFilename: p.cvFilename,
})

const versZoneDto = (z: Zone): ZoneDto => ({
  id: z.id,
  label: z.label,
  departement: z.departement,
  lat: z.lat,
  lng: z.lng,
  rayonKm: z.rayonKm,
  active: z.active,
})

const versOffreDto = (o: JobResult): OffreDto => ({
  id: o.id,
  titre: o.titre,
  employeur: o.employeur,
  lieu: o.lieu,
  url: o.url,
  score: o.score,
  raison: o.raison,
  vu: o.vu,
  postule: o.postule,
  postuleAt: o.postuleAt,
  interet: o.interet,
  createdAt: o.createdAt,
})

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Utilise par la page d'accueil pour rediriger si une session existe deja. */
export const moi = createServerFn({ method: "GET" }).handler(
  async (): Promise<UserDto | null> =>
    run(
      utilisateurCourant().pipe(
        Effect.map(Option.match({ onNone: () => null, onSome: versUserDto })),
      ),
    ),
)

export const chargerDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardDto> =>
    run(
      Effect.gen(function* () {
        const user = yield* exigerUtilisateur()
        const profiles = yield* Profiles
        const zones = yield* Zones
        const offres = yield* JobResults

        // Les trois lectures sont independantes : autant les mener de front.
        const [profile, mesZones, mesOffres] = yield* Effect.all(
          [
            profiles.get(user.id),
            zones.parUtilisateur(user.id),
            offres.parUtilisateur(user.id, 100),
          ],
          { concurrency: 3 },
        )

        return {
          user: versUserDto(user),
          profile: versProfileDto(profile),
          zones: mesZones.map(versZoneDto),
          offres: mesOffres.map(versOffreDto),
        }
      }),
    ),
)

// ---------------------------------------------------------------------------
// Ecriture
// ---------------------------------------------------------------------------

const EntreeEnregistrement = Schema.Struct({
  jobKeywords: Schema.String.pipe(Schema.maxLength(4000)),
  notifyDm: Schema.Boolean,
  zones: Schema.Array(ZoneInput).pipe(Schema.maxItems(50)),
})

export const enregistrerProfil = createServerFn({ method: "POST" })
  .validator(Schema.standardSchemaV1(EntreeEnregistrement))
  .handler(async ({ data }): Promise<void> =>
    run(
      Effect.gen(function* () {
        const user = yield* exigerUtilisateur()
        const profiles = yield* Profiles
        const zones = yield* Zones
        yield* profiles.enregistrer(user.id, {
          jobKeywords: data.jobKeywords,
          notifyDm: data.notifyDm,
        })
        yield* zones.remplacer(user.id, data.zones)
      }),
    ),
  )

/**
 * Televersement du CV. Passe par un `FormData` : c'est un fichier binaire,
 * l'encoder en base64 dans du JSON ferait gonfler la requete d'un tiers.
 */
export const televerserCv = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<{ readonly filename: string }> =>
    run(
      Effect.gen(function* () {
        const user = yield* exigerUtilisateur()
        const fichier = data.get("cv")

        if (!(fichier instanceof File)) {
          return yield* new CvInvalide({ raison: "Aucun fichier recu." })
        }
        const nom = fichier.name.toLowerCase()
        if (!EXTENSIONS_CV.some((ext) => nom.endsWith(ext))) {
          return yield* new CvInvalide({
            raison: "Format non reconnu : PDF, DOC ou DOCX uniquement.",
          })
        }
        if (fichier.size > TAILLE_CV_MAX) {
          return yield* new CvInvalide({ raison: "Fichier trop lourd (10 Mo max)." })
        }

        const octets = new Uint8Array(
          yield* Effect.promise(() => fichier.arrayBuffer()),
        )
        const profiles = yield* Profiles
        yield* profiles.enregistrerCv(user.id, {
          filename: fichier.name,
          mime: fichier.type || "application/octet-stream",
          data: octets,
        })
        return { filename: fichier.name }
      }),
    ),
  )

const EntreeOffre = Schema.Struct({ id: JobResultId })

export const marquerVue = createServerFn({ method: "POST" })
  .validator(Schema.standardSchemaV1(EntreeOffre))
  .handler(async ({ data }): Promise<void> =>
    run(
      Effect.gen(function* () {
        const user = yield* exigerUtilisateur()
        const offres = yield* JobResults
        yield* offres.marquerVue(user.id, data.id)
      }),
    ),
  )

const EntreePostule = Schema.Struct({
  id: JobResultId,
  postule: Schema.Boolean,
})

export const definirPostule = createServerFn({ method: "POST" })
  .validator(Schema.standardSchemaV1(EntreePostule))
  .handler(async ({ data }): Promise<void> =>
    run(
      Effect.gen(function* () {
        const user = yield* exigerUtilisateur()
        const offres = yield* JobResults
        yield* offres.definirPostule(user.id, data.id, data.postule)
      }),
    ),
  )

const EntreeInteret = Schema.Struct({
  id: JobResultId,
  interet: Schema.Boolean,
})

export const definirInteret = createServerFn({ method: "POST" })
  .validator(Schema.standardSchemaV1(EntreeInteret))
  .handler(async ({ data }): Promise<void> =>
    run(
      Effect.gen(function* () {
        const user = yield* exigerUtilisateur()
        const offres = yield* JobResults
        yield* offres.definirInteret(user.id, data.id, data.interet)
      }),
    ),
  )
