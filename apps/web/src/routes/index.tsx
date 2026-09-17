import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect } from "react"
import { ShapeField } from "../components/ShapeField.tsx"
import {
  IconeCloche,
  IconeDiscord,
  IconeDocument,
  IconeGlobe,
} from "../components/icones.tsx"
import { initMotion } from "../lib/motion.ts"
import { moi } from "../server/fn.ts"

export const Route = createFileRoute("/")({
  // Deja connecte : on ne montre pas une page de connexion pour rien.
  beforeLoad: async () => {
    if ((await moi()) !== null) throw redirect({ to: "/dashboard" })
  },
  validateSearch: (search: Record<string, unknown>): { erreur?: string } =>
    typeof search["erreur"] === "string" ? { erreur: search["erreur"] } : {},
  component: Accueil,
})

const ETAPES = [
  {
    Icone: IconeDocument,
    titre: "Ton CV pilote tout",
    texte: "Depose-le une fois : il sert a noter chaque offre selon ton profil.",
  },
  {
    Icone: IconeGlobe,
    titre: "Tes zones, sur la carte",
    texte: "Pointe les villes qui t'interessent, avec un rayon a toi.",
  },
  {
    Icone: IconeCloche,
    titre: "Le bot te previent",
    texte: "Un message prive sur Discord des qu'une offre vaut le coup.",
  },
] as const

function Accueil() {
  const { erreur } = Route.useSearch()
  useEffect(() => initMotion(), [])

  return (
    <div className="landing">
      <ShapeField
        blobs={[
          { depth: 0.18, x: "-8%", y: "4%", size: "380px", couleur: "#5A2E63", opacite: ".5" },
          { depth: 0.3, x: "74%", y: "48%", size: "260px", couleur: "var(--accent)", opacite: ".08" },
        ]}
        formes={[
          { type: "ring", depth: 0.22, x: "82%", y: "8%", size: "160px" },
          { type: "triangle", depth: 0.16, x: "6%", y: "64%", size: "100px" },
          { type: "diamond", depth: 0.26, x: "90%", y: "70%", size: "120px" },
          { type: "square", depth: 0.12, x: "14%", y: "90%", size: "90px" },
        ]}
      />

      <nav className="nav-pill">
        <span className="nav-pill-logo">Jobrick</span>
        <span className="nav-pill-user" style={{ fontSize: 12 }}>
          Connexion Discord
        </span>
      </nav>

      <section className="hero-mauve">
        <span className="hero-eyebrow anim-hidden" data-anim="">
          Jobrick
        </span>
        <h1 className="anim-hidden" data-anim="">
          Ta veille d'offres,
          <br />
          pilotee par toi.
        </h1>
        <p className="hero-sub anim-hidden" data-anim="">
          Depose ton CV, pointe tes zones sur la carte. Le bot Jobrick t'envoie
          les bonnes offres en message prive, deux fois par jour.
        </p>

        {/* Un lien et non un bouton : c'est une navigation vers Discord, qui
            doit fonctionner meme si le JavaScript n'a pas encore pris la main. */}
        <a className="btn-discord anim-hidden" data-anim="" href="/api/auth/discord">
          <IconeDiscord />
          Continuer avec Discord
        </a>

        {erreur !== undefined && <p className="auth-error">{erreur}</p>}

        <p className="landing-footnote anim-hidden" data-anim="">
          Connexion Discord uniquement. On ne lit rien de tes serveurs : juste
          ton pseudo, de quoi t'envoyer un message prive.
        </p>
      </section>

      <section className="explainer">
        <p className="explainer-text" data-reveal-text="">
          Trouver les bonnes offres prend des heures chaque semaine. Avec
          Jobrick, ta veille tourne seule, matin et soir, et ne te montre que ce
          qui vaut vraiment le detour.
        </p>
      </section>

      <div className="steps">
        {ETAPES.map(({ Icone, titre, texte }) => (
          <div className="step-card anim-hidden" data-anim="" key={titre}>
            <div className="step-icon">
              <Icone />
            </div>
            <h3>{titre}</h3>
            <p>{texte}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
