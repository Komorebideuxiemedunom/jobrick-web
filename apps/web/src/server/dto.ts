/**
 * Formes envoyees au navigateur.
 *
 * Les classes `Schema.Class` du domaine ne traversent pas la serialisation
 * (leurs getters seraient perdus) : on aplatit explicitement, en incluant les
 * champs calcules dont l'interface a besoin.
 */
export interface UserDto {
  readonly id: string
  readonly discordId: string
  readonly displayName: string
  readonly avatarUrl: string
  readonly email: string | null
}

export interface ProfileDto {
  readonly jobKeywords: string
  readonly notifyDm: boolean
  readonly cvFilename: string | null
  readonly cvUploadedAt: Date | null
}

export interface ZoneDto {
  readonly id: string
  readonly label: string
  readonly departement: string | null
  readonly lat: number
  readonly lng: number
  readonly rayonKm: number
  readonly active: boolean
}

export interface OffreDto {
  readonly id: string
  readonly titre: string | null
  readonly employeur: string | null
  readonly lieu: string | null
  readonly url: string | null
  readonly score: number | null
  readonly raison: string | null
  readonly vu: boolean
  readonly postule: boolean
  readonly postuleAt: Date | null
  readonly interet: boolean | null
  readonly createdAt: Date
}

export interface DashboardDto {
  readonly user: UserDto
  readonly profile: ProfileDto
  readonly zones: ReadonlyArray<ZoneDto>
  readonly offres: ReadonlyArray<OffreDto>
}
