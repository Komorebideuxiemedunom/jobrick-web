import { ChevronDownIcon, LogOutIcon } from "lucide-react"
import { useRef } from "react"
import {
  ICONE_THEME,
  LIBELLE_COURT,
  THEMES,
  useTheme,
  type Theme,
} from "~/components/BasculeTheme.tsx"
import { Avatar } from "~/components/ui/avatar.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu.tsx"
import { cn } from "~/lib/utils.ts"

/**
 * Avatar cliquable de la navbar : la deconnexion vit dans son menu plutot
 * qu'a cote de lui, pour qu'une action rare ne prenne pas la place d'un
 * bouton permanent.
 */
export function MenuProfil({
  displayName,
  avatarUrl,
}: {
  readonly displayName: string
  readonly avatarUrl: string
}) {
  const formulaire = useRef<HTMLFormElement>(null)
  const { theme, choisir } = useTheme()

  return (
    <>
      {/* Un formulaire POST : une deconnexion ne doit pas partir sur un simple
          GET, qu'un prefetch declencherait. Il reste hors du menu, que Radix
          demonte a la fermeture, et que l'item soumet par requestSubmit. */}
      <form ref={formulaire} method="post" action="/api/auth/logout" className="hidden" />

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Ouvrir le menu du profil"
          className={cn(
            "group hover:bg-secondary data-[state=open]:bg-secondary flex cursor-pointer items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm font-semibold transition-colors outline-none",
            "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          )}
        >
          <Avatar
            src={avatarUrl}
            alt=""
            fallback={displayName.slice(0, 2).toUpperCase()}
          />
          <span className="hidden sm:inline">{displayName}</span>
          <ChevronDownIcon className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-180" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            {displayName}
            <span className="text-muted-foreground text-xs font-normal">
              Connecté via Discord
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
            Thème
          </DropdownMenuLabel>
          {/* Le menu reste ouvert pendant qu'on essaie les trois themes :
              fermer a chaque choix obligerait a le rouvrir pour comparer. */}
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => choisir(v as Theme)}
          >
            {THEMES.map((t) => {
              const Icone = ICONE_THEME[t]
              return (
                <DropdownMenuRadioItem
                  key={t}
                  value={t}
                  onSelect={(e) => e.preventDefault()}
                >
                  <Icone className="text-muted-foreground" />
                  {LIBELLE_COURT[t]}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => formulaire.current?.requestSubmit()}
          >
            <LogOutIcon />
            Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
