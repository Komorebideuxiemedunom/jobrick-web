import type { ZoneDto } from "~/server/dto.ts"

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
  readonly departement: string | null
  readonly lat: number
  readonly lng: number
  readonly rayonKm: number
  readonly active: boolean
}

export const versBrouillon = (z: ZoneDto): ZoneBrouillon => ({
  cle: z.id,
  label: z.label,
  departement: z.departement,
  lat: z.lat,
  lng: z.lng,
  rayonKm: z.rayonKm,
  active: z.active,
})

export const RAYON_MIN = 1
export const RAYON_MAX = 100
export const ZONES_MAX = 8

/**
 * Localise un point : nom de commune et numero de departement.
 *
 * Nominatim ne renvoie pas le numero directement ; on le deduit des deux
 * premiers chiffres du code postal, ce qui est exact en metropole et pour les
 * DOM a trois chiffres.
 */
export const localiser = async (
  lat: number,
  lng: number,
): Promise<{ label: string; departement: string | null }> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
    )
    const data = (await res.json()) as {
      address?: Record<string, string>
      name?: string
    }
    const a = data.address ?? {}
    const cp = a["postcode"] ?? ""
    return {
      label: a["city"] ?? a["town"] ?? a["village"] ?? data.name ?? "Nouveau lieu",
      departement: /^\d{5}$/.test(cp)
        ? cp.startsWith("97") || cp.startsWith("98")
          ? cp.slice(0, 3)
          : cp.slice(0, 2)
        : null,
    }
  } catch {
    return { label: "Nouveau lieu", departement: null }
  }
}

export interface Commune {
  readonly label: string
  readonly departement: string | null
  readonly lat: number
  readonly lng: number
}

/** Recherche une commune francaise par son nom. */
export const chercherCommune = async (
  nom: string,
): Promise<ReadonlyArray<Commune>> => {
  const params = new URLSearchParams({
    q: nom,
    format: "json",
    countrycodes: "fr",
    limit: "5",
    addressdetails: "1",
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
  if (!res.ok) throw new Error(`Nominatim a repondu ${res.status}`)

  const data = (await res.json()) as ReadonlyArray<{
    lat: string
    lon: string
    name?: string
    display_name: string
    address?: Record<string, string>
  }>

  return data.map((r) => {
    const a = r.address ?? {}
    const cp = a["postcode"] ?? ""
    return {
      label: a["city"] ?? a["town"] ?? a["village"] ?? r.name ?? r.display_name,
      departement: /^\d{5}$/.test(cp)
        ? cp.startsWith("97") || cp.startsWith("98")
          ? cp.slice(0, 3)
          : cp.slice(0, 2)
        : null,
      lat: Number(r.lat),
      lng: Number(r.lon),
    }
  })
}
