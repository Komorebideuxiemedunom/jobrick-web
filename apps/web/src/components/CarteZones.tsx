/**
 * Carte des zones de recherche (Leaflet + tuiles OpenStreetMap).
 *
 * Leaflet manipule le DOM directement et ne sait pas vivre dans un rendu
 * serveur : la librairie est importee dynamiquement dans un effet, et React
 * ne possede que le conteneur vide.
 */
import type { Circle, Map as LeafletMap, Marker } from "leaflet"
import { useEffect, useRef, useState } from "react"
import type { ZoneBrouillon } from "~/lib/zones.ts"

interface Props {
  readonly zones: ReadonlyArray<ZoneBrouillon>
  readonly onAjout: (zone: ZoneBrouillon) => void
  readonly onDeplacement: (cle: string, lat: number, lng: number) => void
}

/** Cherche le nom de la commune cliquee ; l'echec n'est pas bloquant. */
const nomDuLieu = async (lat: number, lng: number): Promise<string> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
    )
    const data = (await res.json()) as {
      address?: Record<string, string>
      name?: string
    }
    return (
      data.address?.["city"] ??
      data.address?.["town"] ??
      data.address?.["village"] ??
      data.name ??
      "Nouveau lieu"
    )
  } catch {
    return "Nouveau lieu"
  }
}

export function CarteZones({ zones, onAjout, onDeplacement }: Props) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<LeafletMap | null>(null)
  const couches = useRef(new Map<string, { marker: Marker; circle: Circle }>())
  // Leaflet est charge en asynchrone : sans ce drapeau, les effets de
  // synchronisation s'executeraient une fois, avant que la carte existe, et
  // ne se relanceraient jamais — les zones deja enregistrees resteraient
  // invisibles.
  const [pret, setPret] = useState(false)

  // Les callbacks changent a chaque rendu ; on les lit via une ref pour que
  // les handlers Leaflet, eux, ne soient poses qu'une fois.
  const cb = useRef({ onAjout, onDeplacement })
  cb.current = { onAjout, onDeplacement }

  // --- Initialisation (une seule fois) ---
  useEffect(() => {
    let annule = false
    let nettoyer: (() => void) | undefined

    void (async () => {
      const L = await import("leaflet")
      await import("leaflet/dist/leaflet.css")
      if (annule || conteneur.current === null) return

      // Les icones par defaut pointent vers des chemins relatifs qui ne
      // survivent pas au bundling : on les rebranche sur les assets resolus.
      const [icon, icon2x, shadow] = await Promise.all([
        import("leaflet/dist/images/marker-icon.png?url"),
        import("leaflet/dist/images/marker-icon-2x.png?url"),
        import("leaflet/dist/images/marker-shadow.png?url"),
      ])
      // `_getIconUrl` reconstruit l'URL en la prefixant de l'`imagePath` que
      // Leaflet devine tout seul : nos URLs deja resolues se retrouveraient
      // doublees. Le supprimer force Leaflet a lire les options telles quelles.
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)[
        "_getIconUrl"
      ]
      L.Icon.Default.mergeOptions({
        iconUrl: icon.default,
        iconRetinaUrl: icon2x.default,
        shadowUrl: shadow.default,
      })

      const map = L.map(conteneur.current).setView([46.6, 2.5], 5) // France
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map)

      map.on("click", (e) => {
        void (async () => {
          const { lat, lng } = e.latlng
          cb.current.onAjout({
            cle: crypto.randomUUID(),
            label: await nomDuLieu(lat, lng),
            lat,
            lng,
            rayonKm: 25,
          })
        })()
      })

      carte.current = map
      setPret(true)
      nettoyer = () => {
        map.remove()
        carte.current = null
        couches.current.clear()
        setPret(false)
      }
    })()

    return () => {
      annule = true
      nettoyer?.()
    }
  }, [])

  // --- Synchronisation des couches avec l'etat React ---
  useEffect(() => {
    const map = carte.current
    if (map === null) return
    let actif = true

    void (async () => {
      const L = await import("leaflet")
      if (!actif || carte.current === null) return

      const vues = new Set<string>()

      for (const zone of zones) {
        vues.add(zone.cle)
        const existant = couches.current.get(zone.cle)

        if (existant === undefined) {
          const marker = L.marker([zone.lat, zone.lng], { draggable: true }).addTo(map)
          const circle = L.circle([zone.lat, zone.lng], {
            radius: zone.rayonKm * 1000,
            color: "#8C4A94",
            fillOpacity: 0.08,
          }).addTo(map)
          marker.on("drag", (e) => {
            const pos = (e.target as Marker).getLatLng()
            circle.setLatLng(pos)
            cb.current.onDeplacement(zone.cle, pos.lat, pos.lng)
          })
          couches.current.set(zone.cle, { marker, circle })
        } else {
          existant.circle.setRadius(zone.rayonKm * 1000)
          // Ne pas repositionner pendant un glisser : Leaflet est deja a jour,
          // et le faire ferait sauter le marqueur sous le curseur.
          const pos = existant.marker.getLatLng()
          if (pos.lat !== zone.lat || pos.lng !== zone.lng) {
            existant.marker.setLatLng([zone.lat, zone.lng])
            existant.circle.setLatLng([zone.lat, zone.lng])
          }
        }
      }

      for (const [cle, couche] of couches.current) {
        if (!vues.has(cle)) {
          couche.marker.remove()
          couche.circle.remove()
          couches.current.delete(cle)
        }
      }
    })()

    return () => {
      actif = false
    }
  }, [zones, pret])

  // --- Cadrage initial sur les zones existantes ---
  const cadre = useRef(false)
  useEffect(() => {
    if (cadre.current || zones.length === 0) return
    const map = carte.current
    if (map === null) return
    cadre.current = true
    map.fitBounds(
      zones.map((z) => [z.lat, z.lng] as [number, number]),
      { maxZoom: 9, padding: [40, 40] },
    )
  }, [zones, pret])

  return (
    <div
      ref={conteneur}
      className="h-80 w-full overflow-hidden rounded-lg border"
    />
  )
}
