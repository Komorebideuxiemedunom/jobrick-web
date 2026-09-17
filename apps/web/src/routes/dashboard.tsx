import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { CarteCv } from "../components/CarteCv.tsx"
import { CarteResultats } from "../components/CarteResultats.tsx"
import { CarteZones } from "../components/CarteZones.tsx"
import { ShapeField } from "../components/ShapeField.tsx"
import { IconeCible, IconeCloche, IconeGlobe } from "../components/icones.tsx"
import { initMotion } from "../lib/motion.ts"
import { versBrouillon, type ZoneBrouillon } from "../lib/zones.ts"
import type { OffreDto } from "../server/dto.ts"
import {
  chargerDashboard,
  definirInteret,
  definirPostule,
  enregistrerProfil,
  marquerVue,
  moi,
  televerserCv,
} from "../server/fn.ts"

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if ((await moi()) === null) throw redirect({ to: "/" })
  },
  loader: () => chargerDashboard(),
  component: Dashboard,
})

type EtatSauvegarde = "repos" | "encours" | "ok" | "erreur"

function Dashboard() {
  const donnees = Route.useLoaderData()
  const router = useRouter()

  // Formulaire : etat local, confronte au serveur seulement a l'enregistrement.
  const [motsCles, setMotsCles] = useState(donnees.profile.jobKeywords)
  const [notifyDm, setNotifyDm] = useState(donnees.profile.notifyDm)
  const [zones, setZones] = useState<ReadonlyArray<ZoneBrouillon>>(() =>
    donnees.zones.map(versBrouillon),
  )
  const [cvEnAttente, setCvEnAttente] = useState<File | null>(null)
  const [cvEnregistre, setCvEnregistre] = useState(donnees.profile.cvFilename)

  // Les offres bougent a chaque clic (vue, postule, tri) : on les tient en
  // local pour que l'interface reponde tout de suite, sans aller-retour.
  const [offres, setOffres] = useState<ReadonlyArray<OffreDto>>(donnees.offres)

  const [etat, setEtat] = useState<EtatSauvegarde>("repos")
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => initMotion(), [])

  const etapes = useMemo(
    () => [
      { label: "CV ajoute", fait: cvEnAttente !== null || cvEnregistre !== null },
      { label: "Zone de recherche ajoutee", fait: zones.length > 0 },
      { label: "Mots-cles renseignes", fait: motsCles.trim().length > 0 },
      { label: "Messages prives actives", fait: notifyDm },
    ],
    [cvEnAttente, cvEnregistre, zones.length, motsCles, notifyDm],
  )
  const faites = etapes.filter((e) => e.fait).length

  const stats = useMemo(() => {
    const semaine = Date.now() - 7 * 24 * 3600 * 1000
    const gardees = offres.filter((r) => r.interet !== false)
    return {
      nouvelles: gardees.filter((r) => !r.vu).length,
      semaine: gardees.filter(
        (r) => r.vu && r.createdAt.getTime() >= semaine,
      ).length,
      attente: gardees.filter((r) => r.postule).length,
    }
  }, [offres])

  const majOffre = (id: string, patch: Partial<OffreDto>) =>
    setOffres((liste) =>
      liste.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    )

  const enregistrer = async () => {
    setEtat("encours")
    setErreur(null)
    try {
      if (cvEnAttente !== null) {
        const form = new FormData()
        form.append("cv", cvEnAttente)
        const { filename } = await televerserCv({ data: form })
        setCvEnregistre(filename)
        setCvEnAttente(null)
      }
      await enregistrerProfil({
        data: {
          jobKeywords: motsCles,
          notifyDm,
          zones: zones.map((z) => ({
            label: z.label,
            lat: z.lat,
            lng: z.lng,
            rayonKm: z.rayonKm,
          })),
        },
      })
      setEtat("ok")
      window.setTimeout(() => setEtat("repos"), 1800)
      // Les zones reviennent avec leurs identifiants definitifs.
      await router.invalidate()
    } catch (e) {
      console.error(e)
      setErreur(e instanceof Error ? e.message : "Erreur inconnue")
      setEtat("erreur")
    }
  }

  return (
    <div className="dashboard">
      <ShapeField
        blobs={[
          { depth: 0.12, x: "-10%", y: "10%", size: "300px", couleur: "var(--accent)", opacite: ".06" },
          { depth: 0.2, x: "88%", y: "60%", size: "260px", couleur: "var(--ok)", opacite: ".05" },
        ]}
        formes={[
          { type: "ring", depth: 0.2, x: "4%", y: "8%", size: "150px" },
          { type: "triangle", depth: 0.15, x: "90%", y: "6%", size: "95px" },
          { type: "square", depth: 0.24, x: "92%", y: "72%", size: "90px" },
          { type: "diamond", depth: 0.18, x: "2%", y: "80%", size: "110px" },
        ]}
      />

      <nav className="nav-pill">
        <span className="nav-pill-logo">Jobrick</span>
        <span className="nav-pill-links">
          <a href="#section-cv">CV</a>
          <a href="#section-zones">Zones</a>
          <a href="#section-prefs">Prefs</a>
          <a href="#section-results">Offres</a>
        </span>
        <span className="nav-pill-user">
          <img
            className="nav-pill-avatar"
            src={donnees.user.avatarUrl}
            alt=""
            width={24}
            height={24}
          />
          <span>{donnees.user.displayName}</span>
          {/* Un formulaire POST : une deconnexion ne doit pas partir sur un
              simple GET, qu'un prefetch ou un scanner de liens declencherait. */}
          <form method="post" action="/api/auth/logout">
            <button type="submit" className="btn-ghost">
              Se deconnecter
            </button>
          </form>
        </span>
      </nav>

      <main className="dash-main">
        {faites < etapes.length && (
          <div className="onboarding-card anim-hidden" data-anim="">
            <div className="onboarding-head">
              <h3>Mise en route</h3>
              <span className="onboarding-count">
                {faites}/{etapes.length}
              </span>
            </div>
            <div className="onboarding-bar">
              <div
                className="onboarding-bar-fill"
                style={{ width: `${(faites / etapes.length) * 100}%` }}
              />
            </div>
            <div className="onboarding-steps">
              {etapes.map((e) => (
                <span
                  key={e.label}
                  className={`onboarding-step${e.fait ? " is-done" : ""}`}
                >
                  <span className="dot" />
                  {e.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="stats-row anim-hidden" data-anim="">
          <div className="stat-card">
            <div className="stat-value">{stats.nouvelles}</div>
            <div className="stat-label">nouvelles offres</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.semaine}</div>
            <div className="stat-label">vues cette semaine</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.attente}</div>
            <div className="stat-label">en attente de reponse</div>
          </div>
        </div>

        <CarteCv
          cvEnregistre={cvEnregistre}
          fichierEnAttente={cvEnAttente}
          motsCles={motsCles}
          onFichier={setCvEnAttente}
        />

        <section className="card anim-hidden" data-anim="" id="section-zones">
          <div className="card-head">
            <div className="card-icon">
              <IconeGlobe size={17} />
            </div>
            <h2>Zones de recherche</h2>
          </div>
          <p className="card-sub">
            Clique sur la carte pour ajouter un point de recherche.
          </p>

          <CarteZones
            zones={zones}
            onAjout={(z) => setZones((l) => [...l, z])}
            onDeplacement={(cle, lat, lng) =>
              setZones((l) => l.map((z) => (z.cle === cle ? { ...z, lat, lng } : z)))
            }
          />

          <ul className="zones-list">
            {zones.map((z) => (
              <li className="zone-item" key={z.cle}>
                <input
                  type="text"
                  value={z.label}
                  placeholder="Nom du lieu"
                  onChange={(e) =>
                    setZones((l) =>
                      l.map((x) =>
                        x.cle === z.cle ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  className="zone-radius"
                  min={1}
                  max={200}
                  value={z.rayonKm}
                  onChange={(e) =>
                    setZones((l) =>
                      l.map((x) =>
                        x.cle === z.cle
                          ? {
                              ...x,
                              rayonKm: Math.min(
                                200,
                                Math.max(1, Number(e.target.value) || 25),
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                />
                <span className="zone-radius-unit">km</span>
                <button
                  type="button"
                  className="zone-del"
                  onClick={() =>
                    setZones((l) => l.filter((x) => x.cle !== z.cle))
                  }
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card anim-hidden" data-anim="" id="section-prefs">
          <div className="card-head">
            <div className="card-icon">
              <IconeCible />
            </div>
            <h2>Ce que tu cherches</h2>
          </div>
          <p className="card-sub">
            Intitules de poste, mots-cles — texte libre, une idee par ligne.
          </p>
          <textarea
            rows={4}
            value={motsCles}
            placeholder={"Chef de projet numerique\nCharge de communication\nUX/UI designer"}
            onChange={(e) => setMotsCles(e.target.value)}
          />
        </section>

        <section className="card anim-hidden" data-anim="" id="section-notif">
          <div className="card-head">
            <div className="card-icon">
              <IconeCloche size={17} />
            </div>
            <h2>Comment te prevenir</h2>
          </div>

          <label className="switch-row">
            <span>
              <strong>Message prive Discord</strong>
              <span className="switch-row-sub">
                Le bot Jobrick t'ecrit directement, en @{donnees.user.displayName}
              </span>
            </span>
            <input
              type="checkbox"
              checked={notifyDm}
              onChange={(e) => setNotifyDm(e.target.checked)}
            />
          </label>

          <div className="info-note">
            <p>
              <strong>Plus de webhook a configurer.</strong> Depuis que la
              connexion passe par Discord, le bot connait deja ton identifiant :
              il t'ecrit en prive, personne d'autre ne voit tes offres.
            </p>
            <p className="info-note-steps">
              Si tu ne recois rien, verifie que tu acceptes les messages prives
              des membres du serveur partage avec le bot.
            </p>
          </div>

          <label className="switch-row switch-row-static">
            <span>
              <strong>Directement ici</strong>
              <span className="switch-row-sub">
                Les resultats s'affichent toujours plus bas
              </span>
            </span>
            <input type="checkbox" checked disabled readOnly />
          </label>
        </section>

        <div className="save-bar">
          <button
            type="button"
            className={`btn-primary${etat === "encours" ? " is-loading" : ""}${
              etat === "ok" ? " is-success" : ""
            }`}
            disabled={etat === "encours"}
            onClick={() => void enregistrer()}
          >
            <span className="btn-label">
              {etat === "encours" && <span className="spinner" />}
              {etat === "ok" && <span className="check">✓</span>}
              <span className="btn-label-text">
                {etat === "encours"
                  ? "Enregistrement…"
                  : etat === "ok"
                    ? "Enregistre"
                    : "Enregistrer"}
              </span>
            </span>
          </button>
          {erreur !== null && (
            <span className="field-status field-status-error">
              Erreur : {erreur}
            </span>
          )}
        </div>

        <CarteResultats
          offres={offres}
          onVue={(id) => {
            majOffre(id, { vu: true })
            void marquerVue({ data: { id } })
          }}
          onPostule={(id, postule) => {
            majOffre(id, { postule, postuleAt: postule ? new Date() : null })
            void definirPostule({ data: { id, postule } })
          }}
          onInteret={(id, interet) => {
            majOffre(id, { interet, vu: true })
            void definirInteret({ data: { id, interet } })
          }}
        />
      </main>

      <footer className="dash-footer">
        La veille tourne <strong>deux fois par jour</strong>. Chaque offre est
        notee par une IA selon ton CV et tes preferences, puis le bot te
        previent en message prive — les resultats restent aussi consultables ici
        a tout moment.
      </footer>
    </div>
  )
}
