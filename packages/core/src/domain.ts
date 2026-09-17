/**
 * Modele metier partage entre le site et le bot Discord.
 *
 * Les schemas Effect servent a deux choses : typer le code, et decoder les
 * lignes qui sortent de Postgres (les colonnes sont en snake_case cote base,
 * on les expose en camelCase cote applicatif).
 */
import { Schema } from "effect"

export const UserId = Schema.UUID.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export const JobResultId = Schema.UUID.pipe(Schema.brand("JobResultId"))
export type JobResultId = typeof JobResultId.Type

export const ZoneId = Schema.UUID.pipe(Schema.brand("ZoneId"))
export type ZoneId = typeof ZoneId.Type

/** Identifiant numerique Discord (snowflake) : 17 a 20 chiffres. */
export const DiscordId = Schema.String.pipe(
  Schema.pattern(/^\d{17,20}$/),
  Schema.brand("DiscordId"),
)
export type DiscordId = typeof DiscordId.Type

// ---------------------------------------------------------------------------
// Utilisateur — l'identite vient entierement de Discord depuis la v2.
// ---------------------------------------------------------------------------
export class User extends Schema.Class<User>("User")({
  id: UserId,
  discordId: DiscordId,
  username: Schema.String,
  globalName: Schema.NullOr(Schema.String),
  avatar: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  createdAt: Schema.DateFromSelf,
}) {
  /** Nom a afficher : le pseudo "joli" si Discord en fournit un. */
  get displayName(): string {
    return this.globalName ?? this.username
  }

  get avatarUrl(): string {
    return this.avatar === null
      ? `https://cdn.discordapp.com/embed/avatars/${(BigInt(this.discordId) >> 22n) % 6n}.png`
      : `https://cdn.discordapp.com/avatars/${this.discordId}/${this.avatar}.png?size=64`
  }
}

// ---------------------------------------------------------------------------
// Profil — preferences de veille. Plus de webhook ni d'ID Discord a saisir :
// le bot envoie un DM, et on connait deja l'ID via la connexion OAuth.
// ---------------------------------------------------------------------------
export class Profile extends Schema.Class<Profile>("Profile")({
  userId: UserId,
  jobKeywords: Schema.String,
  notifyDm: Schema.Boolean,
  cvFilename: Schema.NullOr(Schema.String),
  cvMime: Schema.NullOr(Schema.String),
  cvSize: Schema.NullOr(Schema.Int),
  cvUploadedAt: Schema.NullOr(Schema.DateFromSelf),
  updatedAt: Schema.DateFromSelf,
}) {
  get hasCv(): boolean {
    return this.cvFilename !== null
  }
}

// ---------------------------------------------------------------------------
// Zone de recherche geographique
// ---------------------------------------------------------------------------
export const Latitude = Schema.Number.pipe(Schema.between(-90, 90))
export const Longitude = Schema.Number.pipe(Schema.between(-180, 180))
export const RayonKm = Schema.Int.pipe(Schema.between(1, 200))

export class Zone extends Schema.Class<Zone>("Zone")({
  id: ZoneId,
  userId: UserId,
  label: Schema.String,
  lat: Latitude,
  lng: Longitude,
  rayonKm: RayonKm,
}) {}

/** Zone telle qu'envoyee par le formulaire : pas encore d'identifiant. */
export const ZoneInput = Schema.Struct({
  label: Schema.String.pipe(Schema.maxLength(120)),
  lat: Latitude,
  lng: Longitude,
  rayonKm: RayonKm,
})
export type ZoneInput = typeof ZoneInput.Type

// ---------------------------------------------------------------------------
// Offre trouvee par la veille
// ---------------------------------------------------------------------------
export const Score = Schema.Int.pipe(Schema.between(0, 100))

export class JobResult extends Schema.Class<JobResult>("JobResult")({
  id: JobResultId,
  userId: UserId,
  titre: Schema.NullOr(Schema.String),
  employeur: Schema.NullOr(Schema.String),
  lieu: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  score: Schema.NullOr(Score),
  raison: Schema.NullOr(Schema.String),
  conseilCandidature: Schema.NullOr(Schema.String),
  source: Schema.NullOr(Schema.String),
  vu: Schema.Boolean,
  postule: Schema.Boolean,
  postuleAt: Schema.NullOr(Schema.DateFromSelf),
  /** Tri facon swipe : null = indecis, true = garde, false = ecarte. */
  interet: Schema.NullOr(Schema.Boolean),
  /** Date du DM envoye par le bot — evite de notifier deux fois. */
  notifiedAt: Schema.NullOr(Schema.DateFromSelf),
  createdAt: Schema.DateFromSelf,
}) {}

/** Delai au-dela duquel on suggere de relancer une candidature. */
export const DELAI_RELANCE_MS = 7 * 24 * 3600 * 1000

export const relanceConseillee = (r: {
  readonly postule: boolean
  readonly postuleAt: Date | null
}): boolean =>
  r.postule &&
  r.postuleAt !== null &&
  Date.now() - r.postuleAt.getTime() >= DELAI_RELANCE_MS

/** Message de relance pre-redige, propose a J+7. */
export const messageRelance = (r: {
  readonly titre: string | null
  readonly employeur: string | null
}): string =>
  `Bonjour, je me permets de relancer suite a ma candidature pour le poste de ` +
  `${r.titre ?? "..."} chez ${r.employeur ?? "..."} — je reste tres interesse(e) ` +
  `et disponible pour en echanger. Bonne journee.`
