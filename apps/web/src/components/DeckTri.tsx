/**
 * Mode tri : une offre a la fois, qu'on pousse a droite (interessant) ou a
 * gauche (ecarte), a la souris/au doigt ou avec les deux boutons.
 */
import { useEffect, useRef, useState } from "react"
import type { OffreDto } from "../server/dto.ts"

/** Distance a partir de laquelle un glisser vaut decision. */
const SEUIL_PX = 100

export function DeckTri({
  offres,
  onDecision,
}: {
  readonly offres: ReadonlyArray<OffreDto>
  readonly onDecision: (id: string, interet: boolean) => void
}) {
  const carte = useRef<HTMLDivElement>(null)
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
      <div id="swipe-section">
        <div className="swipe-deck">
          <div className="swipe-empty">
            Tout est trie ! Reviens plus tard pour de nouvelles offres.
          </div>
        </div>
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
      ? `translateX(${partante ? 600 : -600}px) rotate(${partante ? 20 : -20}deg)`
      : `translateX(${dx}px) rotate(${dx / 18}deg)`

  return (
    <div id="swipe-section">
      <div className="swipe-deck">
        <div
          ref={carte}
          className="swipe-card"
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
            className="swipe-stamp swipe-stamp--like"
            style={{ opacity: Math.max(0, Math.min(1, dx / 80)) }}
          >
            INTERESSE
          </span>
          <span
            className="swipe-stamp swipe-stamp--nope"
            style={{ opacity: Math.max(0, Math.min(1, -dx / 80)) }}
          >
            PASSE
          </span>
          <div className="result-score">{courante.score ?? "–"}</div>
          <div className="result-title">{courante.titre ?? "Sans titre"}</div>
          <div className="result-meta">
            {courante.employeur ?? ""} · {courante.lieu ?? ""}
          </div>
          {courante.raison !== null && (
            <div className="result-reason">{courante.raison}</div>
          )}
        </div>
      </div>

      <div className="swipe-actions">
        <button
          type="button"
          className="swipe-btn swipe-btn--no"
          title="Pas interesse"
          onClick={() => valider(false)}
        >
          ✕
        </button>
        <button
          type="button"
          className="swipe-btn swipe-btn--yes"
          title="Interessant"
          onClick={() => valider(true)}
        >
          ♥
        </button>
      </div>
    </div>
  )
}
