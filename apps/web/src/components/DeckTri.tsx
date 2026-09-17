/**
 * Mode tri : une offre a la fois, qu'on pousse a droite (interessant) ou a
 * gauche (ecarte), a la souris/au doigt ou avec les deux boutons.
 */
import { HeartIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "~/lib/utils.ts"
import type { OffreDto } from "~/server/dto.ts"
import { Button } from "~/components/ui/button.tsx"

/** Distance a partir de laquelle un glisser vaut decision. */
const SEUIL_PX = 100

export function DeckTri({
  offres,
  onDecision,
}: {
  readonly offres: ReadonlyArray<OffreDto>
  readonly onDecision: (id: string, interet: boolean) => void
}) {
  const [dx, setDx] = useState(0)
  const [partante, setPartante] = useState<boolean | null>(null)
  const depart = useRef<number | null>(null)

  const courante = offres[0]

  // Nouvelle carte en tete de pile : on remet l'animation a zero.
  useEffect(() => {
    setDx(0)
    setPartante(null)
  }, [courante?.id])

  if (courante === undefined) {
    return (
      <div className="text-muted-foreground flex min-h-64 items-center justify-center rounded-2xl border border-dashed text-sm text-pretty">
        Tout est trié ! Reviens plus tard pour de nouvelles offres.
      </div>
    )
  }

  const valider = (interet: boolean) => {
    setPartante(interet)
    // On laisse la carte sortir de l'ecran avant de retirer l'offre de la pile.
    window.setTimeout(() => onDecision(courante.id, interet), 260)
  }

  const relacher = () => {
    if (depart.current === null) return
    depart.current = null
    if (Math.abs(dx) > SEUIL_PX) valider(dx > 0)
    else setDx(0)
  }

  const transform =
    partante !== null
      ? `translateX(${partante ? 600 : -600}px) rotate(${partante ? 16 : -16}deg)`
      : `translateX(${dx}px) rotate(${dx / 22}deg)`

  return (
    <div className="flex flex-col items-center gap-6 py-2">
      <div className="flex w-full max-w-md justify-center">
        <div
          className="bg-card relative w-full cursor-grab touch-none rounded-2xl border p-6 select-none active:cursor-grabbing"
          style={{
            transform,
            opacity: partante !== null ? 0 : 1,
            transition:
              partante !== null || depart.current === null
                ? "transform .3s ease, opacity .3s ease"
                : undefined,
          }}
          onPointerDown={(e) => {
            depart.current = e.clientX
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (depart.current === null) return
            setDx(e.clientX - depart.current)
          }}
          onPointerUp={relacher}
          onPointerCancel={relacher}
        >
          <span
            className="text-success absolute top-5 left-5 rotate-[-12deg] rounded-md border-2 border-current px-2 py-0.5 text-sm font-bold"
            style={{ opacity: Math.max(0, Math.min(1, dx / 80)) }}
          >
            INTERESSE
          </span>
          <span
            className="text-destructive absolute top-5 right-5 rotate-12 rounded-md border-2 border-current px-2 py-0.5 text-sm font-bold"
            style={{ opacity: Math.max(0, Math.min(1, -dx / 80)) }}
          >
            PASSE
          </span>

          <div className="flex flex-col gap-3 pt-10">
            <span className="bg-secondary text-primary flex size-12 items-center justify-center rounded-xl text-base font-extrabold tabular-nums">
              {courante.score ?? "–"}
            </span>
            <h3 className="text-lg font-medium text-pretty">
              {courante.titre ?? "Sans titre"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {[courante.employeur, courante.lieu].filter(Boolean).join(" · ")}
            </p>
            {courante.raison !== null && (
              <p className="text-muted-foreground text-sm text-pretty">{courante.raison}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className={cn("size-12 rounded-full", "hover:text-destructive")}
          title="Pas intéressé"
          onClick={() => valider(false)}
        >
          <XIcon className="size-5" />
        </Button>
        <span className="text-muted-foreground text-xs tabular-nums">
          {offres.length} à trier
        </span>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className={cn("size-12 rounded-full", "hover:text-success")}
          title="Intéressant"
          onClick={() => valider(true)}
        >
          <HeartIcon className="size-5" />
        </Button>
      </div>
    </div>
  )
}
