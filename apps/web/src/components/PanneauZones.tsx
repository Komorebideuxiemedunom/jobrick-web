/**
 * Zones de recherche : carte, liste des points de depart, ajout par nom de
 * commune.
 *
 * Une zone en pause est conservee telle quelle mais ignoree par la veille :
 * on ne perd ni son rayon ni ses coordonnees en l'ecartant quelques semaines.
 */
import {
  CrosshairIcon,
  Loader2Icon,
  LocateFixedIcon,
  MapPinIcon,
  MaximizeIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { CarteZones } from "~/components/CarteZones.tsx"
import { Button } from "~/components/ui/button.tsx"
import { Checkbox } from "~/components/ui/checkbox.tsx"
import { Input } from "~/components/ui/input.tsx"
import { Label } from "~/components/ui/label.tsx"
import {
  chercherCommune,
  localiser,
  RAYON_MAX,
  RAYON_MIN,
  ZONES_MAX,
  type Commune,
  type ZoneBrouillon,
} from "~/lib/zones.ts"
import { cn } from "~/lib/utils.ts"

interface Props {
  readonly zones: ReadonlyArray<ZoneBrouillon>
  readonly onChange: (zones: ReadonlyArray<ZoneBrouillon>) => void
}

/** Distance a vol d'oiseau entre deux points, en kilometres (haversine). */
const distanceKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function PanneauZones({ zones, onChange }: Props) {
  const [cadrageDemande, setCadrageDemande] = useState(0)
  const [centrageSur, setCentrageSur] = useState<{
    lat: number
    lng: number
    n: number
  } | null>(null)
  const [localisation, setLocalisation] = useState<"repos" | "encours">("repos")
  const [erreurPosition, setErreurPosition] = useState<string | null>(null)

  /**
   * Centre la carte sur la position du navigateur, et propose le point comme
   * zone s'il n'y en a pas deja une a moins de 10 km : recentrer sans rien
   * pouvoir en faire ne servirait a rien.
   */
  const allerAMaPosition = () => {
    if (!("geolocation" in navigator)) {
      setErreurPosition("Ton navigateur ne sait pas te localiser.")
      return
    }
    setLocalisation("encours")
    setErreurPosition(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setCentrageSur({ lat, lng, n: Date.now() })
        setLocalisation("repos")

        const dejaCouvert = zones.some(
          (z) => distanceKm(z.lat, z.lng, lat, lng) < 10,
        )
        if (dejaCouvert || complet) return

        void (async () => {
          const { label, departement } = await localiser(lat, lng)
          onChange([
            ...zones,
            {
              cle: crypto.randomUUID(),
              label,
              departement,
              lat,
              lng,
              rayonKm: 25,
              active: true,
            },
          ])
        })()
      },
      (err) => {
        setLocalisation("repos")
        setErreurPosition(
          err.code === err.PERMISSION_DENIED
            ? "Localisation refusée. Tu peux toujours cliquer sur la carte."
            : "Position indisponible pour le moment.",
        )
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const majZone = (cle: string, patch: Partial<ZoneBrouillon>) =>
    onChange(zones.map((z) => (z.cle === cle ? { ...z, ...patch } : z)))

  const complet = zones.length >= ZONES_MAX

  return (
    <div className="flex flex-col gap-4" id="section-zones">
      {/* --- Carte --- */}
      <div className="bg-card flex flex-col gap-4 rounded-2xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base">Ton périmètre, en un regard</h2>
            <p className="text-muted-foreground text-sm">
              Clique sur la carte pour poser un point, glisse un repère pour
              l’ajuster.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={localisation === "encours"}
              onClick={allerAMaPosition}
            >
              {localisation === "encours" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <LocateFixedIcon />
              )}
              Ma position
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={zones.length === 0}
              onClick={() => setCadrageDemande((n) => n + 1)}
            >
              <MaximizeIcon />
              Tout voir
            </Button>
          </div>
        </div>

        {erreurPosition !== null && (
          <p className="text-destructive text-sm">{erreurPosition}</p>
        )}

        <CarteZones
          zones={zones}
          cadrageDemande={cadrageDemande}
          centrageSur={centrageSur}
          onAjout={(z) => !complet && onChange([...zones, z])}
          onDeplacement={(cle, lat, lng) => majZone(cle, { lat, lng })}
        />

        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs font-medium">
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="border-primary size-2.5 rounded-full border-2" />
              Zone active
            </span>
            <span className="flex items-center gap-1.5">
              <span className="border-muted-foreground size-2.5 rounded-full border-2 border-dashed" />
              Zone en pause
            </span>
          </span>
          <span>Rayons à vol d’oiseau</span>
        </div>
      </div>

      {/* --- Liste et ajout --- */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="bg-card flex flex-col rounded-2xl border">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <h2 className="text-base">Tes points de départ</h2>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                complet ? "text-warning" : "text-muted-foreground",
              )}
            >
              {zones.length} / {ZONES_MAX}
            </span>
          </div>

          {zones.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 px-5 pb-6 text-sm">
              <MapPinIcon className="size-4" />
              Aucun point pour l’instant.
            </p>
          ) : (
            <ul className="divide-border divide-y border-t">
              {zones.map((z) => (
                <LigneZone
                  key={z.cle}
                  zone={z}
                  onChange={(patch) => majZone(z.cle, patch)}
                  onSuppression={() =>
                    onChange(zones.filter((x) => x.cle !== z.cle))
                  }
                />
              ))}
            </ul>
          )}
        </div>

        <AjoutCommune
          desactive={complet}
          onAjout={(c) =>
            onChange([
              ...zones,
              {
                cle: crypto.randomUUID(),
                label: c.label,
                departement: c.departement,
                lat: c.lat,
                lng: c.lng,
                rayonKm: 25,
                active: true,
              },
            ])
          }
        />
      </div>
    </div>
  )
}

function LigneZone({
  zone,
  onChange,
  onSuppression,
}: {
  readonly zone: ZoneBrouillon
  readonly onChange: (patch: Partial<ZoneBrouillon>) => void
  readonly onSuppression: () => void
}) {
  const [renommer, setRenommer] = useState(false)

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
            zone.active
              ? "bg-secondary text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          <MapPinIcon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{zone.label}</p>
          <p className="text-muted-foreground text-xs font-medium">
            {zone.departement === null
              ? "Département inconnu"
              : `Département ${zone.departement}`}
          </p>
        </div>

        <Label className="text-muted-foreground shrink-0 text-xs">
          <Checkbox
            checked={zone.active}
            onChange={(e) => onChange({ active: e.target.checked })}
          />
          Active
        </Label>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-9 shrink-0"
          title={`Supprimer ${zone.label}`}
          onClick={onSuppression}
        >
          <Trash2Icon />
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">Rayon de recherche</span>
          <span className="text-primary text-xl font-extrabold tabular-nums">
            {zone.rayonKm}
            <span className="text-muted-foreground ml-0.5 text-xs font-semibold">
              km
            </span>
          </span>
        </div>

        <input
          type="range"
          min={RAYON_MIN}
          max={RAYON_MAX}
          value={zone.rayonKm}
          aria-label={`Rayon de recherche autour de ${zone.label}, en kilomètres`}
          onChange={(e) => onChange({ rayonKm: Number(e.target.value) })}
          className="accent-primary h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[image:linear-gradient(var(--primary),var(--primary))] bg-no-repeat"
          style={{
            // Le remplissage suit la valeur : un `input[type=range]` natif ne
            // sait pas colorer sa partie gauche de maniere portable.
            backgroundColor: "var(--muted)",
            backgroundSize: `${((zone.rayonKm - RAYON_MIN) / (RAYON_MAX - RAYON_MIN)) * 100}% 100%`,
          }}
        />

        <div className="text-muted-foreground flex justify-between text-[11px] font-medium">
          <span>{RAYON_MIN} km</span>
          <span>{RAYON_MAX} km</span>
        </div>
      </div>

      {renommer ? (
        <div className="flex flex-col gap-2">
          <Input
            value={zone.label}
            aria-label="Nom du lieu"
            placeholder="Nom du lieu"
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setRenommer(false)}
          >
            Terminé
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRenommer(true)}
          className="text-primary hover:underline cursor-pointer self-start text-xs font-semibold"
        >
          Modifier le nom
        </button>
      )}
    </li>
  )
}

function AjoutCommune({
  desactive,
  onAjout,
}: {
  readonly desactive: boolean
  readonly onAjout: (c: Commune) => void
}) {
  const [nom, setNom] = useState("")
  const [recherche, setRecherche] = useState(false)
  const [resultats, setResultats] = useState<ReadonlyArray<Commune> | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const lancer = async () => {
    if (nom.trim().length < 2) return
    setRecherche(true)
    setErreur(null)
    setResultats(null)
    try {
      const trouves = await chercherCommune(nom.trim())
      setResultats(trouves)
      if (trouves.length === 0) setErreur("Aucune commune de ce nom.")
    } catch {
      setErreur("Recherche indisponible pour le moment.")
    } finally {
      setRecherche(false)
    }
  }

  return (
    <div className="bg-secondary flex h-fit flex-col gap-3 rounded-2xl p-5">
      <span className="bg-card text-primary flex size-9 items-center justify-center rounded-[10px]">
        <PlusIcon className="size-4" />
      </span>

      <div className="flex flex-col gap-1">
        <h2 className="text-base">Ajouter une ville</h2>
        <p className="text-muted-foreground text-sm text-pretty">
          {desactive
            ? `Tu as atteint ${ZONES_MAX} points de départ. Supprime-en un pour en ajouter un autre.`
            : "Choisis une commune française. Tu pourras ajuster son rayon ensuite."}
        </p>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void lancer()
        }}
      >
        <Label htmlFor="commune" className="text-xs">
          Nom de la commune
        </Label>
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            id="commune"
            value={nom}
            disabled={desactive}
            placeholder="Par exemple, Montpellier"
            className="pl-9"
            onChange={(e) => setNom(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={desactive || recherche || nom.trim().length < 2}
        >
          {recherche ? <Loader2Icon className="animate-spin" /> : <CrosshairIcon />}
          Rechercher une ville
        </Button>
      </form>

      {erreur !== null && <p className="text-destructive text-sm">{erreur}</p>}

      {resultats !== null && resultats.length > 0 && (
        <ul className="flex flex-col gap-1">
          {resultats.map((c) => (
            <li key={`${c.lat},${c.lng}`}>
              <button
                type="button"
                className="hover:bg-card flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-sm transition-colors"
                onClick={() => {
                  onAjout(c)
                  setResultats(null)
                  setNom("")
                }}
              >
                <MapPinIcon className="text-primary size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {c.label}
                </span>
                {c.departement !== null && (
                  <span className="text-muted-foreground text-xs">
                    {c.departement}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground border-border mt-1 border-t pt-3 text-xs text-pretty">
        <span className="text-foreground font-semibold">
          Un rayon, pas un trajet.
        </span>{" "}
        Les distances sont mesurées à vol d’oiseau depuis le point, pas en temps
        de transport.
      </p>
    </div>
  )
}
