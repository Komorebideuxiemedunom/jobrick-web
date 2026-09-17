/**
 * Dernieres offres : liste triable, mode tri, export CSV, suivi de
 * candidature et aide au reseautage.
 */
import { messageRelance, relanceConseillee } from "@jobrick/core"
import {
  BriefcaseIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LayersIcon,
  UsersIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { cn } from "~/lib/utils.ts"
import type { OffreDto } from "~/server/dto.ts"
import { Badge } from "~/components/ui/badge.tsx"
import { Button } from "~/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card.tsx"
import { Checkbox } from "~/components/ui/checkbox.tsx"
import { Label } from "~/components/ui/label.tsx"
import { Select } from "~/components/ui/select.tsx"
import { Textarea } from "~/components/ui/textarea.tsx"
import { DeckTri } from "./DeckTri.tsx"

type Tri = "date" | "score"

interface Props {
  readonly offres: ReadonlyArray<OffreDto>
  readonly onVue: (id: string) => void
  readonly onPostule: (id: string, postule: boolean) => void
  readonly onInteret: (id: string, interet: boolean) => void
}

const exporterCsv = (offres: ReadonlyArray<OffreDto>): void => {
  const entete = [
    "Titre", "Employeur", "Lieu", "Score", "Raison", "URL", "Vu", "Postule", "Date",
  ]
  const lignes = offres.map((r) => [
    r.titre ?? "", r.employeur ?? "", r.lieu ?? "", r.score ?? "",
    r.raison ?? "", r.url ?? "", r.vu ? "oui" : "non",
    r.postule ? "oui" : "non", r.createdAt.toISOString(),
  ])
  const csv = [entete, ...lignes]
    .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  // Le BOM force Excel a lire l'UTF-8 : sans lui, les accents sortent casses.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "jobrick-offres.csv"
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Le score est un chiffre, pas une pastille de marque : il garde l'aplat
 * lavande par defaut et ne prend une couleur de sens que lorsqu'il tranche.
 */
const classeScore = (score: number | null) =>
  score === null
    ? "bg-muted text-muted-foreground"
    : score >= 75
      ? "bg-success/12 text-success"
      : score >= 45
        ? "bg-warning/14 text-warning"
        : "bg-muted text-muted-foreground"

export function CarteResultats({ offres, onVue, onPostule, onInteret }: Props) {
  const [tri, setTri] = useState<Tri>("date")
  const [masquerVues, setMasquerVues] = useState(false)
  const [modeTri, setModeTri] = useState(false)

  const visibles = useMemo(() => {
    // `interet === false` = ecartee au tri : elle disparait de la liste.
    let liste = offres.filter((r) => r.interet !== false)
    if (masquerVues) liste = liste.filter((r) => !r.vu)
    return [...liste].sort((a, b) =>
      tri === "score"
        ? (b.score ?? -1) - (a.score ?? -1)
        : b.createdAt.getTime() - a.createdAt.getTime(),
    )
  }, [offres, tri, masquerVues])

  const aTrier = useMemo(
    () =>
      offres
        .filter((r) => r.interet === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [offres],
  )

  return (
    <Card id="section-results" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Dernières offres trouvées</CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={modeTri ? "default" : "secondary"}
              size="sm"
              onClick={() => setModeTri((v) => !v)}
            >
              <LayersIcon />
              {modeTri ? "Fermer le tri" : "Mode tri"}
              {!modeTri && aTrier.length > 0 && (
                <Badge variant="secondary" className="ml-1">{aTrier.length}</Badge>
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={offres.length === 0}
              onClick={() => exporterCsv(offres)}
            >
              <DownloadIcon />
              CSV
            </Button>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!modeTri && (
          <div className="flex flex-wrap items-center gap-4">
            <Select value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
              <option value="date">Trier par date</option>
              <option value="score">Trier par score</option>
            </Select>
            <Label className="text-muted-foreground font-normal">
              <Checkbox
                checked={masquerVues}
                onChange={(e) => setMasquerVues(e.target.checked)}
              />
              Masquer les offres vues
            </Label>
          </div>
        )}

        {modeTri ? (
          <DeckTri offres={aTrier} onDecision={onInteret} />
        ) : visibles.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm text-pretty">
            {offres.length > 0
              ? "Rien à afficher avec ce filtre."
              : "Rien pour l'instant : la veille tourne deux fois par jour, reviens un peu plus tard."}
          </p>
        ) : (
          <div className="divide-border -mx-6 divide-y border-y">
            {visibles.map((offre) => (
              <LigneOffre
                key={offre.id}
                offre={offre}
                onVue={onVue}
                onPostule={onPostule}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LigneOffre({
  offre,
  onVue,
  onPostule,
}: {
  readonly offre: OffreDto
  readonly onVue: (id: string) => void
  readonly onPostule: (id: string, postule: boolean) => void
}) {
  const [reseauOuvert, setReseauOuvert] = useState(false)
  const [relanceOuverte, setRelanceOuverte] = useState(false)
  const q = encodeURIComponent(offre.employeur ?? "")

  return (
    <div className={cn("px-6 py-4 transition-colors", !offre.vu && "bg-secondary/45")}>
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold tabular-nums",
            classeScore(offre.score),
          )}
        >
          {offre.score ?? "–"}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={offre.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onVue(offre.id)}
              className="group inline-flex items-center gap-1.5 font-medium hover:underline"
            >
              {offre.titre ?? "Sans titre"}
              <ExternalLinkIcon className="text-muted-foreground size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
            {!offre.vu && <Badge variant="secondary">Nouveau</Badge>}
          </div>

          <p className="text-muted-foreground text-sm">
            {[offre.employeur, offre.lieu].filter(Boolean).join(" · ")}
          </p>

          {offre.raison !== null && (
            <p className="text-muted-foreground mt-1 text-sm text-pretty">{offre.raison}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={offre.postule ? "default" : "secondary"}
              onClick={() => onPostule(offre.id, !offre.postule)}
            >
              <BriefcaseIcon />
              {offre.postule ? "Postulé" : "Marquer postulé"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setReseauOuvert((v) => !v)}
            >
              <UsersIcon />
              Réseautage
            </Button>
            {relanceConseillee(offre) && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="text-warning"
                onClick={() => setRelanceOuverte((v) => !v)}
              >
                <ClockIcon />
                Relance conseillée (J+7)
              </Button>
            )}
          </div>

          {relanceOuverte && (
            <div className="bg-secondary/60 mt-2 flex flex-col gap-2 rounded-xl p-3">
              <span className="text-muted-foreground text-xs">
                Suggestion de message à copier :
              </span>
              <Textarea rows={3} readOnly value={messageRelance(offre)} className="bg-background" />
            </div>
          )}

          {reseauOuvert && (
            <div className="bg-secondary/60 mt-2 flex flex-col gap-1 rounded-xl p-3 text-sm">
              {[
                [`${q}%20CEO`, "Chercher le/la CEO sur LinkedIn"],
                [`${q}%20RH%20recrutement`, "Chercher RH / recrutement sur LinkedIn"],
              ].map(([suffixe, libelle]) => (
                <a
                  key={libelle}
                  href={`https://www.linkedin.com/search/results/people/?keywords=${suffixe}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground text-muted-foreground inline-flex items-center gap-1.5"
                >
                  <ExternalLinkIcon className="size-3.5" />
                  {libelle}
                </a>
              ))}
              <a
                href={`https://www.linkedin.com/search/results/companies/?keywords=${q}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground text-muted-foreground inline-flex items-center gap-1.5"
              >
                <ExternalLinkIcon className="size-3.5" />
                Voir la page entreprise sur LinkedIn
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
