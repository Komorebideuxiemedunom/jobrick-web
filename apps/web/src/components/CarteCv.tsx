/**
 * Depot du CV et scanner ATS.
 *
 * Le scan tourne entierement dans le navigateur : soit sur le fichier que
 * l'utilisateur vient de deposer, soit sur celui recupere via `/api/cv`. Le
 * contenu du CV ne part jamais vers un service tiers.
 */
import { useRef, useState } from "react"
import { LIBELLE_NIVEAU, scanCV, type AtsResultat } from "../lib/ats.ts"
import { IconeDocument } from "./icones.tsx"

const EXTENSIONS = [".pdf", ".doc", ".docx"]
const TAILLE_MAX = 10 * 1024 * 1024

interface Props {
  /** Nom du CV deja enregistre, s'il y en a un. */
  readonly cvEnregistre: string | null
  readonly fichierEnAttente: File | null
  readonly motsCles: string
  readonly onFichier: (f: File | null) => void
}

export function CarteCv({
  cvEnregistre,
  fichierEnAttente,
  motsCles,
  onFichier,
}: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [scanEnCours, setScanEnCours] = useState(false)
  const [erreurScan, setErreurScan] = useState<string | null>(null)
  const [resultat, setResultat] = useState<AtsResultat | null>(null)

  const traiter = (fichier: File) => {
    const nom = fichier.name.toLowerCase()
    if (!EXTENSIONS.some((ext) => nom.endsWith(ext))) {
      setErreur("Format non reconnu — PDF, DOC ou DOCX uniquement.")
      return
    }
    if (fichier.size > TAILLE_MAX) {
      setErreur("Fichier trop lourd (10 Mo max).")
      return
    }
    setErreur(null)
    setResultat(null)
    onFichier(fichier)
  }

  const lancerScan = async () => {
    setScanEnCours(true)
    setErreurScan(null)
    setResultat(null)
    try {
      let blob: Blob
      let nom: string
      if (fichierEnAttente !== null) {
        blob = fichierEnAttente
        nom = fichierEnAttente.name
      } else {
        const res = await fetch("/api/cv")
        if (!res.ok) throw new Error(`/api/cv a repondu ${res.status}`)
        blob = await res.blob()
        nom = cvEnregistre ?? "cv.pdf"
      }
      setResultat(await scanCV(blob, nom, motsCles))
    } catch (e) {
      console.error("scan ATS:", e)
      setErreurScan("Erreur pendant l'analyse.")
    } finally {
      setScanEnCours(false)
    }
  }

  const nomAffiche =
    fichierEnAttente !== null
      ? `${fichierEnAttente.name} (pas encore enregistre)`
      : cvEnregistre

  return (
    <section className="card anim-hidden" data-anim="" id="section-cv">
      <div className="card-head">
        <div className="card-icon">
          <IconeDocument size={17} />
        </div>
        <h2>Ton CV</h2>
      </div>
      <p className="card-sub">
        Il pilote la veille : c'est lui qui determine si une offre te correspond.
      </p>

      <div
        className={`dropzone${survol ? " dropzone-over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setSurvol(true)
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault()
          setSurvol(false)
          const f = e.dataTransfer.files[0]
          if (f !== undefined) traiter(f)
        }}
      >
        <input
          ref={input}
          type="file"
          accept=".pdf,.doc,.docx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f !== undefined) traiter(f)
          }}
        />
        {nomAffiche === null ? (
          <div>
            <p>
              <strong>Glisse ton CV ici</strong> ou clique pour choisir un fichier
            </p>
            <p className="dropzone-hint">PDF, DOC ou DOCX — 10 Mo max</p>
          </div>
        ) : (
          <div>
            <p className="cv-filename">📄 {nomAffiche}</p>
            <p className="dropzone-hint">Depose un autre fichier pour le remplacer</p>
          </div>
        )}
      </div>
      {erreur !== null && (
        <p className="field-status field-status-error">{erreur}</p>
      )}

      <div className="cv-actions">
        <button
          type="button"
          className="btn-scan"
          disabled={nomAffiche === null || scanEnCours}
          onClick={() => void lancerScan()}
        >
          Scanner mon CV (ATS)
        </button>
        <span
          className={`field-status${erreurScan !== null ? " field-status-error" : ""}`}
        >
          {scanEnCours ? "Analyse en cours…" : (erreurScan ?? "")}
        </span>
      </div>

      {resultat !== null && <PanneauAts resultat={resultat} />}
    </section>
  )
}

function PanneauAts({ resultat }: { readonly resultat: AtsResultat }) {
  if (resultat.score === null) {
    const premier = resultat.checks[0]
    return (
      <div className="ats-panel">
        <p className="ats-note">{premier?.detail ?? premier?.label}</p>
      </div>
    )
  }

  return (
    <div className="ats-panel">
      <div className="ats-score-row">
        <div className={`ats-score-badge is-${resultat.niveau}`}>
          {resultat.score}
        </div>
        <div className="ats-score-label">
          <strong>{LIBELLE_NIVEAU[resultat.niveau]}</strong>
          <br />
          Score indicatif sur 100
        </div>
      </div>
      <ul className="ats-checks">
        {resultat.checks.map((c, i) => (
          <li key={i} className={c.pass ? "" : "is-fail"}>
            <span className="ats-icon">{c.pass ? "✓" : "✕"}</span>
            {c.label}
          </li>
        ))}
      </ul>
      <p className="ats-note">
        Analyse indicative, executee dans ton navigateur — aucun contenu du CV
        n'est envoye a un serveur externe. Elle ne garantit pas le passage d'un
        ATS reel, mais repere les blocages les plus frequents.
      </p>
    </div>
  )
}
