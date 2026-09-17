import { createFileRoute, redirect } from "@tanstack/react-router"
import { BellIcon, FileTextIcon, MapPinIcon, TriangleAlertIcon } from "lucide-react"
import { LogoDiscord } from "~/components/icones.tsx"
import { Alert, AlertDescription } from "~/components/ui/alert.tsx"
import { buttonVariants } from "~/components/ui/button.tsx"
import { moi } from "~/server/fn.ts"

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
    Icone: FileTextIcon,
    titre: "Ton CV pilote tout",
    texte: "Depose-le une fois : il sert a noter chaque offre selon ton profil.",
  },
  {
    Icone: MapPinIcon,
    titre: "Tes zones, sur la carte",
    texte: "Pointe les villes qui t'interessent, avec un rayon a toi.",
  },
  {
    Icone: BellIcon,
    titre: "Le bot te previent",
    texte: "Un message prive des qu'une offre vaut le coup. Rien de public.",
  },
] as const

function Accueil() {
  const { erreur } = Route.useSearch()

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="font-semibold tracking-tight">Jobrick</span>
          <span className="text-muted-foreground text-sm">Connexion Discord</span>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="flex flex-col items-center gap-6 py-20 text-center sm:py-28">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Ta veille d&apos;offres, pilotee par toi.
          </h1>
          <p className="text-muted-foreground max-w-xl text-base text-pretty sm:text-lg">
            Depose ton CV, pointe tes zones sur la carte. Le bot Jobrick t&apos;envoie
            les bonnes offres en message prive, deux fois par jour.
          </p>

          {/* Un lien et non un bouton : c'est une navigation vers Discord, qui
              doit marcher meme si le JavaScript n'a pas encore pris la main. */}
          <a
            href="/api/auth/discord"
            className={buttonVariants({ variant: "discord", size: "xl", className: "mt-2" })}
          >
            <LogoDiscord className="size-5" />
            Continuer avec Discord
          </a>

          {erreur !== undefined && (
            <Alert variant="destructive" className="max-w-md text-left">
              <TriangleAlertIcon />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          <p className="text-muted-foreground max-w-md text-xs">
            On ne lit rien de tes serveurs : juste ton pseudo, de quoi
            t&apos;envoyer un message prive.
          </p>
        </section>

        <section className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {ETAPES.map(({ Icone, titre, texte }) => (
            <div key={titre} className="bg-background flex flex-col gap-3 p-6">
              <Icone className="text-muted-foreground size-5" />
              <h2 className="font-medium">{titre}</h2>
              <p className="text-muted-foreground text-sm text-pretty">{texte}</p>
            </div>
          ))}
        </section>

        <p className="text-muted-foreground py-16 text-center text-sm text-pretty">
          Trouver les bonnes offres prend des heures chaque semaine. Avec
          Jobrick, ta veille tourne seule, matin et soir, et ne te montre que ce
          qui vaut vraiment le detour.
        </p>
      </main>
    </div>
  )
}
