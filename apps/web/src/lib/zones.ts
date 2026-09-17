import type { ZoneDto } from "../server/dto.ts"

/**
 * Zone en cours d'edition.
 *
 * `cle` est une identite locale et stable : une zone tout juste posee sur la
 * carte n'a pas encore d'`id` en base, et l'enregistrement remplace de toute
 * facon la liste entiere.
 */
export interface ZoneBrouillon {
  readonly cle: string
  readonly label: string
  readonly lat: number
  readonly lng: number
  readonly rayonKm: number
}

export const versBrouillon = (z: ZoneDto): ZoneBrouillon => ({
  cle: z.id,
  label: z.label,
  lat: z.lat,
  lng: z.lng,
  rayonKm: z.rayonKm,
})
