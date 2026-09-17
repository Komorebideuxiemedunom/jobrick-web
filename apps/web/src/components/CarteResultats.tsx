/**
 * Dernieres offres : liste triable, mode tri facon swipe, export CSV,
 * suivi de candidature et aide au reseautage.
 */
import { messageRelance, relanceConseillee } from "@jobrick/core"
import { useMemo, useState } from "react"
import type { OffreDto } from "../server/dto.ts"
import { IconeMallette } from "./icones.tsx"
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
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "jobrick-offres.csv"
  a.click()
  URL.revokeObjectURL(url)
}

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
    <section className="card anim-hidden" data-anim="" id="section-results">
      <div className="card-head">
        <div className="card-icon">
          <IconeMallette />
        </div>
        <h2>Dernieres offres trouvees</h2>
      </div>

      <div className="results-toolbar">
        <div className="results-filters">
          <select value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
            <option value="date">Trier par date</option>
            <option value="score">Trier par score</option>
          </select>
          <label className="results-toggle">
            <input
              type="checkbox"
              checked={masquerVues}
              onChange={(e) => setMasquerVues(e.target.checked)}
            />
            Masquer les offres vues
          </label>
        </div>
        <button
          type="button"
          className="btn-export"
          onClick={() => setModeTri((v) => !v)}
        >
          {modeTri ? "Fermer le tri" : "Mode tri"}
        </button>
        <button
          type="button"
          className="btn-export"
          disabled={offres.length === 0}
          onClick={() => exporterCsv(offres)}
        >
          Exporter en CSV
        </button>
      </div>

      {modeTri ? (
        <DeckTri offres={aTrier} onDecision={onInteret} />
      ) : (
        <div id="results-list">
          {visibles.length === 0 ? (
            <p className="empty-state">
              {offres.length > 0
                ? "Rien a afficher avec ce filtre."
                : "Rien pour l'instant — la veille tourne deux fois par jour, reviens un peu plus tard."}
            </p>
          ) : (
            visibles.map((offre) => (
              <LigneOffre
                key={offre.id}
                offre={offre}
                onVue={onVue}
                onPostule={onPostule}
              />
            ))
          )}
        </div>
      )}
    </section>
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
    <div className={`result-item${offre.vu ? "" : " is-new"}`}>
      <a
        className="result-link"
        href={offre.url ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onVue(offre.id)}
      >
        <div className="result-score">{offre.score ?? "–"}</div>
        <div className="result-body">
          <div className="result-title-row">
            <div className="result-title">{offre.titre ?? "Sans titre"}</div>
            {!offre.vu && <span className="result-new-badge">Nouveau</span>}
          </div>
          <div className="result-meta">
            {offre.employeur ?? ""} · {offre.lieu ?? ""}
          </div>
          {offre.raison !== null && (
            <div className="result-reason">{offre.raison}</div>
          )}
        </div>
      </a>

      <div className="result-actions">
        <button
          type="button"
          className={`chip-btn${offre.postule ? " is-active" : ""}`}
          onClick={() => onPostule(offre.id, !offre.postule)}
        >
          {offre.postule ? "Postule ✓" : "Marquer postule"}
        </button>
        <button
          type="button"
          className="chip-btn"
          onClick={() => setReseauOuvert((v) => !v)}
        >
          Reseautage
        </button>
        {relanceConseillee(offre) && (
          <button
            type="button"
            className="chip-relance"
            onClick={() => setRelanceOuverte((v) => !v)}
          >
            Relance conseillee (J+7)
          </button>
        )}
      </div>

      {relanceOuverte && (
        <div className="relance-panel">
          Suggestion de message a copier :
          <textarea rows={3} readOnly value={messageRelance(offre)} />
        </div>
      )}

      {reseauOuvert && (
        <div className="reseau-panel">
          <a
            href={`https://www.linkedin.com/search/results/people/?keywords=${q}%20CEO`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chercher le/la CEO sur LinkedIn →
          </a>
          <a
            href={`https://www.linkedin.com/search/results/people/?keywords=${q}%20RH%20recrutement`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chercher RH / recrutement sur LinkedIn →
          </a>
          <a
            href={`https://www.linkedin.com/search/results/companies/?keywords=${q}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir la page entreprise sur LinkedIn →
          </a>
        </div>
      )}
    </div>
  )
}
