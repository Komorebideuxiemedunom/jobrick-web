import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import {
  CheckIcon,
  Loader2Icon,
  LogOutIcon,
  MapPinIcon,
  MessageSquareIcon,
  TrashIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { CarteCv } from "~/components/CarteCv.tsx"
import { CarteResultats } from "~/components/CarteResultats.tsx"
import { CarteZones } from "~/components/CarteZones.tsx"
import { Alert, AlertDescription } from "~/components/ui/alert.tsx"
import { Avatar } from "~/components/ui/avatar.tsx"
import { Button } from "~/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card.tsx"
import { Input } from "~/components/ui/input.tsx"
import { Label } from "~/components/ui/label.tsx"
import { Progress } from "~/components/ui/progress.tsx"
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

const ANCRES = [
  ["section-cv", "CV"],
  ["section-zones", "Zones"],
  ["section-prefs", "Prefs"],
  ["section-results", "Offres"],
] as const

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
    return [
      { valeur: gardees.filter((r) => !r.vu).length, label: "nouvelles offres" },
      {
        valeur: gardees.filter((r) => r.vu && r.createdAt.getTime() >= semaine).length,
        label: "vues cette semaine",
      },
      { valeur: gardees.filter((r) => r.postule).length, label: "en attente de reponse" },
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
            lat: z.lat,
            lng: z.lng,
            rayonKm: z.rayonKm,
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
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-6">
          <span className="font-semibold tracking-tight">Jobrick</span>

          <div className="text-muted-foreground hidden items-center gap-1 text-sm sm:flex">
            {ANCRES.map(([id, libelle]) => (
              <a
                key={id}
                href={`#${id}`}
                className="hover:bg-accent hover:text-foreground rounded-md px-2.5 py-1.5 transition-colors"
              >
                {libelle}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Avatar
              src={donnees.user.avatarUrl}
              alt=""
              fallback={donnees.user.displayName.slice(0, 2).toUpperCase()}
            />
            <span className="hidden text-sm font-medium sm:inline">
              {donnees.user.displayName}
            </span>
            {/* Un formulaire POST : une deconnexion ne doit pas partir sur un
                simple GET, qu'un prefetch declencherait. */}
            <form method="post" action="/api/auth/logout">
              <Button type="submit" variant="ghost" size="icon" title="Se deconnecter">
                <LogOutIcon />
              </Button>
            </form>
          </div>
        </nav>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        {faites < etapes.length && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Mise en route
                <span className="text-muted-foreground text-sm font-normal tabular-nums">
                  {faites}/{etapes.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Progress value={(faites / etapes.length) * 100} />
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {etapes.map((e) => (
                  <li
                    key={e.label}
                    className={cn(
                      "flex items-center gap-1.5 text-sm",
                      e.fait ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-full border",
                        e.fait && "bg-success border-success text-success-foreground",
                      )}
                    >
                      {e.fait && <CheckIcon className="size-3" />}
                    </span>
                    {e.label}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-card flex flex-col gap-1 px-6 py-5">
              <span className="text-2xl font-semibold tabular-nums">{s.valeur}</span>
              <span className="text-muted-foreground text-sm">{s.label}</span>
            </div>
          ))}
        </div>

        <CarteCv
          cvEnregistre={cvEnregistre}
          fichierEnAttente={cvEnAttente}
          motsCles={motsCles}
          onFichier={setCvEnAttente}
        />

        <Card id="section-zones" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Zones de recherche</CardTitle>
            <CardDescription>
              Clique sur la carte pour ajouter un point de recherche.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CarteZones
              zones={zones}
              onAjout={(z) => setZones((l) => [...l, z])}
              onDeplacement={(cle, lat, lng) =>
                setZones((l) => l.map((z) => (z.cle === cle ? { ...z, lat, lng } : z)))
              }
            />

            {zones.length === 0 ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <MapPinIcon className="size-4" />
                Aucune zone pour l&apos;instant.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {zones.map((z) => (
                  <li key={z.cle} className="flex items-center gap-2">
                    <Input
                      value={z.label}
                      placeholder="Nom du lieu"
                      onChange={(e) =>
                        setZones((l) =>
                          l.map((x) => (x.cle === z.cle ? { ...x, label: e.target.value } : x)),
                        )
                      }
                    />
                    <div className="relative shrink-0">
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={z.rayonKm}
                        className="w-24 pr-8 tabular-nums"
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
                      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                        km
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      title="Supprimer cette zone"
                      onClick={() => setZones((l) => l.filter((x) => x.cle !== z.cle))}
                    >
                      <TrashIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card id="section-prefs" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Ce que tu cherches</CardTitle>
            <CardDescription>
              Intitules de poste, mots-cles — texte libre, une idee par ligne.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={4}
              value={motsCles}
              placeholder={"Chef de projet numerique\nCharge de communication\nUX/UI designer"}
              onChange={(e) => setMotsCles(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comment te prevenir</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Label className="flex items-center justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <MessageSquareIcon className="size-4" />
                  Message prive Discord
                </span>
                <span className="text-muted-foreground text-sm font-normal">
                  Le bot Jobrick t&apos;ecrit directement, en prive
                </span>
              </span>
              <Switch
                checked={notifyDm}
                onChange={(e) => setNotifyDm(e.target.checked)}
              />
            </Label>

            <Alert variant="muted">
              <AlertDescription>
                <p className="text-pretty">
                  <span className="text-foreground font-medium">
                    Plus de webhook a configurer.
                  </span>{" "}
                  Depuis que la connexion passe par Discord, le bot connait deja
                  ton identifiant : il t&apos;ecrit en prive, personne d&apos;autre
                  ne voit tes offres.
                </p>
                <p className="text-pretty">
                  Si tu ne recois rien, verifie que tu acceptes les messages
                  prives des membres du serveur partage avec le bot.
                </p>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {erreur !== null && (
            <span className="text-destructive text-sm">Erreur : {erreur}</span>
          )}
          <Button type="button" disabled={etat === "encours"} onClick={() => void enregistrer()}>
            {etat === "encours" && <Loader2Icon className="animate-spin" />}
            {etat === "ok" && <CheckIcon />}
            {etat === "encours" ? "Enregistrement…" : etat === "ok" ? "Enregistre" : "Enregistrer"}
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
          Chaque offre est notee par une IA selon ton CV et tes preferences, puis
          le bot te previent en message prive.
        </p>
      </main>
    </div>
  )
}
