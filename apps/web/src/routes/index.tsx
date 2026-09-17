import { createFileRoute, redirect } from "@tanstack/react-router"
import { BellIcon, FileTextIcon, MapPinIcon, TriangleAlertIcon } from "lucide-react"
import { LogoDiscord } from "~/components/icones.tsx"
import { Logo } from "~/components/Logo.tsx"
import { BasculeTheme } from "~/components/BasculeTheme.tsx"
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

const ARGUMENTS = [
  { Icone: FileTextIcon, texte: "Ton CV note chaque offre à ta place." },
  { Icone: MapPinIcon, texte: "Tes villes, avec le rayon que tu choisis." },
  { Icone: BellIcon, texte: "Le bot t’écrit en privé, deux fois par jour." },
] as const

function Accueil() {
  const { erreur } = Route.useSearch()

  return (
    /* Deux volets a parts egales : la promesse a gauche sur lavande, l'action
       a droite sur le fond de page. En dessous de lg, ils s'empilent. */
    <div className="grid min-h-svh lg:grid-cols-2">
      <section className="bg-secondary flex flex-col justify-between gap-12 px-8 py-10 sm:px-14">
        <Logo taille="lg" />

        <div className="flex max-w-lg flex-col gap-6">
          <MapPinIcon className="text-primary size-7" />
          {/* Pas de `text-balance` ici : la coupure est imposee, les deux
              phrases doivent tomber l'une sous l'autre. */}
          <h1 className="text-4xl leading-[1.1] sm:text-5xl">
            Ton prochain poste.
            <br />
            À ta portée.
          </h1>
          <p className="text-muted-foreground max-w-sm text-pretty">
            Dépose ton CV, pointe tes villes sur la carte. Jobrick surveille
            pour toi et ne te dérange que quand ça vaut le coup.
          </p>

          <ul className="mt-2 flex flex-col gap-3">
            {ARGUMENTS.map(({ Icone, texte }) => (
              <li key={texte} className="flex items-center gap-3 text-sm font-medium">
                <span className="bg-card text-primary flex size-8 shrink-0 items-center justify-center rounded-[10px]">
                  <Icone className="size-4" />
                </span>
                {texte}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground text-xs">
          Tes données restent dans ton espace, visibles de toi seul.
        </p>
      </section>

      <section className="relative flex items-center justify-center px-8 py-16 sm:px-14">
        <div className="absolute top-6 right-6">
          <BasculeTheme />
        </div>

        <div className="flex w-full max-w-sm flex-col gap-6">
          <span className="bg-secondary text-primary flex size-11 items-center justify-center rounded-xl">
            <LogoDiscord className="size-5" />
          </span>

          <div className="flex flex-col gap-2">
            <h2 className="text-2xl">Heureux de te retrouver</h2>
            <p className="text-muted-foreground text-sm text-pretty">
              Connecte-toi avec Discord pour retrouver tes zones de recherche.
              C’est aussi par là que le bot t’écrira.
            </p>
          </div>

          {erreur !== undefined && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          {/* Un lien et non un bouton : c'est une navigation vers Discord, qui
              doit marcher meme si le JavaScript n'a pas encore pris la main. */}
          <a
            href="/api/auth/discord"
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            <LogoDiscord className="size-4" />
            Continuer avec Discord
          </a>

          <p className="text-muted-foreground text-center text-xs text-pretty">
            Aucun mot de passe à retenir. On ne lit rien de tes serveurs : juste
            ton pseudo, de quoi t’envoyer un message privé.
          </p>
        </div>
      </section>
    </div>
  )
}
