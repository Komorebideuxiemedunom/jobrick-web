/**
 * Carte des zones de recherche (Leaflet).
 *
 * Leaflet manipule le DOM directement et ne sait pas vivre dans un rendu
 * serveur : la librairie est importee dynamiquement dans un effet, et React
 * ne possede que le conteneur vide.
 */
import type { Circle, Map as LeafletMap, Marker } from "leaflet"
import { useEffect, useRef, useState } from "react"
import { localiser, type ZoneBrouillon } from "~/lib/zones.ts"

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/**
 * Fond de carte OpenStreetMap : pas de clef d'API, pas de compte a creer.
 * CARTO a ete essaye et rejete, ses tuiles renvoient desormais un bandeau
 * "API KEY REQUIRED".
 *
 * En mode sombre, la carte est simplement assombrie par une regle CSS plutot
 * qu'inversee : l'inversion virait au vert sale et rendait les libelles
 * illisibles.
 */
const URL_TUILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

/** Les couleurs viennent des tokens CSS : elles suivent le theme. */
const jeton = (nom: string, repli: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || repli

/**
 * Marqueur en cible : anneau colore, halo clair, point central. Dessine en
 * HTML plutot qu'avec l'icone PNG de Leaflet, pour qu'il suive le theme et se
 * distingue selon que la zone est active ou en pause.
 */
const marqueurCible = (active: boolean): string => {
  const violet = jeton("--primary", "#5B3FD4")
  const fond = jeton("--card", "#FFFFFF")
  const couleur = active ? violet : jeton("--muted-foreground", "#6E7288")
  return `
    <span style="
      display:block; width:26px; height:26px; border-radius:999px;
      background:${fond}; border:2px solid ${couleur};
      box-shadow: 0 1px 4px rgb(0 0 0 / .25);
      display:grid; place-items:center;
    ">
      <span style="
        width:9px; height:9px; border-radius:999px; background:${couleur};
      "></span>
    </span>`
}

interface Props {
  readonly zones: ReadonlyArray<ZoneBrouillon>
  readonly onAjout: (zone: ZoneBrouillon) => void
  readonly onDeplacement: (cle: string, lat: number, lng: number) => void
  /** Demande de recadrage, incrementee par le bouton "Tout voir". */
  readonly cadrageDemande: number
  /** Point sur lequel se centrer, renouvele a chaque demande. */
  readonly centrageSur: { lat: number; lng: number; n: number } | null
}

export function CarteZones({
  zones,
  onAjout,
  onDeplacement,
  cadrageDemande,
  centrageSur,
}: Props) {
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<LeafletMap | null>(null)
  const couches = useRef(new Map<string, { marker: Marker; circle: Circle }>())
  // Leaflet est charge en asynchrone : sans ce drapeau, les effets de
  // synchronisation s'executeraient une fois, avant que la carte existe, et
  // ne se relanceraient jamais : les zones deja enregistrees resteraient
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

      const map = L.map(conteneur.current, { zoomControl: false }).setView(
        [46.6, 2.5],
        5,
      ) // France
      L.control.zoom({ position: "topleft" }).addTo(map)

      L.tileLayer(URL_TUILES, {
        attribution: ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map)

      map.on("click", (e) => {
        void (async () => {
          const { lat, lng } = e.latlng
          const { label, departement } = await localiser(lat, lng)
          cb.current.onAjout({
            cle: crypto.randomUUID(),
            label,
            departement,
            lat,
            lng,
            rayonKm: 25,
            active: true,
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

      const violet = jeton("--primary", "#5B3FD4")
      const gris = jeton("--muted-foreground", "#6E7288")
      const vues = new Set<string>()

      for (const zone of zones) {
        vues.add(zone.cle)
        const icone = L.divIcon({
          html: marqueurCible(zone.active),
          className: "",
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        })
        // Une zone en pause garde un cercle en pointilles : on voit qu'elle
        // existe sans la confondre avec un perimetre surveille.
        const style = {
          color: zone.active ? violet : gris,
          weight: 2,
          dashArray: zone.active ? undefined : "5 5",
          fillOpacity: zone.active ? 0.12 : 0.04,
        }
        const existant = couches.current.get(zone.cle)

        if (existant === undefined) {
          const marker = L.marker([zone.lat, zone.lng], {
            draggable: true,
            icon: icone,
          }).addTo(map)
          const circle = L.circle([zone.lat, zone.lng], {
            radius: zone.rayonKm * 1000,
            ...style,
          }).addTo(map)
          marker.on("drag", (e) => {
            const pos = (e.target as Marker).getLatLng()
            circle.setLatLng(pos)
            cb.current.onDeplacement(zone.cle, pos.lat, pos.lng)
          })
          couches.current.set(zone.cle, { marker, circle })
        } else {
          existant.marker.setIcon(icone)
          existant.circle.setRadius(zone.rayonKm * 1000)
          existant.circle.setStyle(style)
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

  // --- Suivi du theme : les reperes lisent leurs couleurs dans les tokens ---
  useEffect(() => {
    if (!pret) return
    const majTheme = () => {
      for (const { circle } of couches.current.values()) {
        circle.setStyle({ color: jeton("--primary", "#5B3FD4") })
      }
    }
    // La bascule pose ou retire la classe `dark` sur <html> : c'est le seul
    // signal disponible, le composant n'a pas acces a l'etat du theme.
    const observateur = new MutationObserver(majTheme)
    observateur.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observateur.disconnect()
  }, [pret])

  // --- Cadrage : au premier chargement, puis a la demande ---
  const cadre = useRef(false)
  useEffect(() => {
    const map = carte.current
    if (map === null || zones.length === 0) return
    // Au chargement on ne cadre qu'une fois, sinon poser un point rejouerait
    // le cadrage et deplacerait la carte sous le curseur.
    if (cadre.current && cadrageDemande === 0) return
    cadre.current = true
    map.fitBounds(
      zones.map((z) => [z.lat, z.lng] as [number, number]),
      { maxZoom: 9, padding: [48, 48] },
    )
  }, [zones, pret, cadrageDemande])

  // --- Centrage sur un point precis (geolocalisation) ---
  useEffect(() => {
    const map = carte.current
    if (map === null || centrageSur === null) return
    // Le cadrage "tout voir" ne doit pas reprendre la main juste apres.
    cadre.current = true
    map.flyTo([centrageSur.lat, centrageSur.lng], 10, { duration: 1 })
  }, [centrageSur, pret])

  return (
    <div
      ref={conteneur}
      className="h-[22rem] w-full overflow-hidden rounded-xl border"
    />
  )
}
