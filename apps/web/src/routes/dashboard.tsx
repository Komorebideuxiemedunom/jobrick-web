import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import {
  CheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MessageSquareIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { CarteCv } from "~/components/CarteCv.tsx"
import { CarteResultats } from "~/components/CarteResultats.tsx"
import { PanneauZones } from "~/components/PanneauZones.tsx"
import { Logo } from "~/components/Logo.tsx"
import { MenuProfil } from "~/components/MenuProfil.tsx"
import { Button, buttonVariants } from "~/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card.tsx"
import { Label } from "~/components/ui/label.tsx"
import { Switch } from "~/components/ui/switch.tsx"
import { Textarea } from "~/components/ui/textarea.tsx"
import { cn } from "~/lib/utils.ts"
import { versBrouillon, type ZoneBrouillon } from "~/lib/zones.ts"
import type { OffreDto } from "~/server/dto.ts"
import {
  chargerDashboard,
  definirInteret,
  definirPostule,
  enregistrerProfil,
  marquerVue,
  moi,
  televerserCv,
} from "~/server/fn.ts"

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

  // Le succes s'efface tout seul ; on annule le minuteur si le composant part.
  useEffect(() => {
    if (etat !== "ok") return
    const t = window.setTimeout(() => setEtat("repos"), 1800)
    return () => window.clearTimeout(t)
  }, [etat])

  const etapes = useMemo(
    () => [
      { label: "CV ajouté", fait: cvEnAttente !== null || cvEnregistre !== null },
      { label: "Zone de recherche active", fait: zones.some((z) => z.active) },
      { label: "Mots-clés renseignés", fait: motsCles.trim().length > 0 },
      { label: "Messages privés activés", fait: notifyDm },
    ],
    [cvEnAttente, cvEnregistre, zones.length, motsCles, notifyDm],
  )
  const faites = etapes.filter((e) => e.fait).length

  const stats = useMemo(() => {
    const semaine = Date.now() - 7 * 24 * 3600 * 1000
    const gardees = offres.filter((r) => r.interet !== false)
    return [
      { valeur: gardees.filter((r) => !r.vu).length, label: "nouvelles offres" },
      {
        valeur: gardees.filter((r) => r.vu && r.createdAt.getTime() >= semaine).length,
        label: "vues cette semaine",
      },
      { valeur: gardees.filter((r) => r.postule).length, label: "en attente de réponse" },
    ]
  }, [offres])

  const majOffre = (id: string, patch: Partial<OffreDto>) =>
    setOffres((liste) => liste.map((o) => (o.id === id ? { ...o, ...patch } : o)))

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
            departement: z.departement,
            lat: z.lat,
            lng: z.lng,
            rayonKm: z.rayonKm,
            active: z.active,
          })),
        },
      })
      setEtat("ok")
      // Les zones reviennent avec leurs identifiants definitifs.
      await router.invalidate()
    } catch (e) {
      console.error(e)
      setErreur(e instanceof Error ? e.message : "Erreur inconnue")
      setEtat("erreur")
    }
  }

  return (
    <div className="min-h-svh">
      {/* Barre pleine largeur : le contenu reste en colonne etroite pour la
          lecture, mais une navbar centree sur 768px laisserait l'ecran vide
          des deux cotes sur un poste de travail. */}
      <header className="bg-card/80 sticky top-0 z-10 border-b backdrop-blur-sm">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="bg-border hidden h-5 w-px sm:block" />
            <span className="text-muted-foreground hidden text-sm font-medium sm:inline">
              Mon espace de recherche
            </span>
          </div>

          <div className="flex items-center">
            <MenuProfil
              displayName={donnees.user.displayName}
              avatarUrl={donnees.user.avatarUrl}
            />
          </div>
        </nav>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl">Ta veille</h1>
            <p className="text-muted-foreground text-sm">
              Ton CV, tes zones, et ce qu&apos;elles ont rapporté.
            </p>
          </div>
        </div>

        {faites < etapes.length && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Mise en route
                <span className="text-muted-foreground text-sm font-semibold tabular-nums">
                  {faites}/{etapes.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Une liste ordonnee, pas une grille de cases : les etapes se
                  font dans cet ordre, et le trait qui les relie le dit. */}
              <ol className="flex flex-col gap-0 sm:flex-row">
                {etapes.map((e, i) => {
                  const courante = !e.fait && etapes.slice(0, i).every((p) => p.fait)
                  return (
                    <li
                      key={e.label}
                      className="relative flex flex-1 items-center gap-3 pb-5 last:pb-0 sm:flex-col sm:items-start sm:gap-2 sm:pb-0"
                    >
                      {/* Le trait de liaison : vertical en colonne, horizontal
                          des que les etapes s'alignent. */}
                      {i < etapes.length - 1 && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 sm:top-[13px] sm:left-7 sm:h-0.5 sm:w-[calc(100%-1.75rem)]",
                            e.fait ? "bg-primary" : "bg-border",
                          )}
                        />
                      )}
                      <span
                        className={cn(
                          "relative z-1 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums transition-colors",
                          e.fait
                            ? "bg-primary border-primary text-primary-foreground"
                            : courante
                              ? "border-primary text-primary bg-card"
                              : "border-border text-muted-foreground bg-card",
                        )}
                      >
                        {e.fait ? <CheckIcon className="size-4" /> : i + 1}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-medium sm:pr-4",
                          e.fait || courante ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {e.label}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-card flex flex-col gap-1 rounded-2xl border px-5 py-4"
            >
              <span className="text-primary text-3xl font-extrabold tracking-tight tabular-nums">
                {s.valeur}
              </span>
              <span className="text-muted-foreground text-sm font-medium">{s.label}</span>
            </div>
          ))}
        </div>

        <CarteCv
          cvEnregistre={cvEnregistre}
          fichierEnAttente={cvEnAttente}
          motsCles={motsCles}
          onFichier={setCvEnAttente}
        />

        <PanneauZones zones={zones} onChange={setZones} />

        <Card id="section-prefs" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Ce que tu cherches</CardTitle>
            <CardDescription>
              Intitulés de poste, mots-clés : texte libre, une idée par ligne.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              value={motsCles}
              placeholder={"Chef de projet numérique\nChargé de communication\nUX/UI designer"}
              onChange={(e) => setMotsCles(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comment te prévenir</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Label className="flex items-center justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <MessageSquareIcon className="size-4" />
                  Message privé Discord
                </span>
                <span className="text-muted-foreground text-sm font-normal">
                  Le bot Jobrick t&apos;écrit directement, en privé
                </span>
              </span>
              <Switch
                checked={notifyDm}
                onChange={(e) => setNotifyDm(e.target.checked)}
              />
            </Label>

            {/*
              Discord n'ouvre pas une conversation sur commande : le lien mene
              au profil du bot, d'ou le bouton "Envoyer un message" existe
              deja. C'est aussi la qu'on verifie qu'il n'est pas bloque.
            */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={donnees.urlBot}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
              >
                <ExternalLinkIcon />
                Ouvrir la conversation avec le bot
              </a>
              <span className="text-muted-foreground text-sm">
                Il ne peut t&apos;écrire que s&apos;il partage un serveur avec toi.
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {erreur !== null && (
            <span className="text-destructive text-sm">Erreur : {erreur}</span>
          )}
          <Button
            type="button"
            size="lg"
            disabled={etat === "encours"}
            onClick={() => void enregistrer()}
          >
            {etat === "encours" && <Loader2Icon className="animate-spin" />}
            {etat === "ok" && <CheckIcon />}
            {etat === "encours" ? "Enregistrement…" : etat === "ok" ? "Enregistré" : "Enregistrer"}
          </Button>
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

        <p className="text-muted-foreground py-4 text-center text-sm text-pretty">
          La veille tourne <span className="text-foreground font-medium">deux fois par jour</span>.
          Chaque offre est notée par une IA selon ton CV et tes préférences, puis
          le bot te prévient en message privé.
        </p>
      </main>
    </div>
  )
}
