import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "~/components/ui/button.tsx"

export type Theme = "clair" | "sombre" | "systeme"

export const CLE_THEME = "jobrick-theme"

const SUIVANT: Record<Theme, Theme> = {
  systeme: "clair",
  clair: "sombre",
  sombre: "systeme",
}

const LIBELLE: Record<Theme, string> = {
  systeme: "Thème : système",
  clair: "Thème : clair",
  sombre: "Thème : sombre",
}

/** Libelles courts, pour une liste ou le mot « Thème » est deja pose. */
export const LIBELLE_COURT: Record<Theme, string> = {
  systeme: "Système",
  clair: "Clair",
  sombre: "Sombre",
}

export const ICONE_THEME = {
  systeme: MonitorIcon,
  clair: SunIcon,
  sombre: MoonIcon,
}

export const THEMES: readonly Theme[] = ["clair", "sombre", "systeme"]

/** Applique le theme au document. Duplique dans le script inline de
 *  `__root.tsx`, qui doit s'executer avant le premier rendu. */
const appliquer = (theme: Theme): void => {
  const sombre =
    theme === "sombre" ||
    (theme === "systeme" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", sombre)
}

const lire = (): Theme => {
  try {
    const brut = localStorage.getItem(CLE_THEME)
    return brut === "clair" || brut === "sombre" ? brut : "systeme"
  } catch {
    // Navigation privee, stockage bloque : on retombe sur le systeme.
    return "systeme"
  }
}

/**
 * Etat du theme, partage par le bouton de la page d'accueil et par le menu du
 * profil : deux presentations, une seule source de verite.
 */
export function useTheme() {
  // Le serveur ne connait pas la preference : on rend l'icone "systeme" au
  // premier passage, puis on corrige apres montage. Sans ca, l'hydratation
  // signalerait une difference entre le HTML et le client.
  const [theme, setTheme] = useState<Theme>("systeme")
  const [monte, setMonte] = useState(false)

  useEffect(() => {
    setTheme(lire())
    setMonte(true)
  }, [])

  // En mode "systeme", on suit les changements de preference a chaud.
  useEffect(() => {
    if (!monte || theme !== "systeme") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const suivre = () => appliquer("systeme")
    media.addEventListener("change", suivre)
    return () => media.removeEventListener("change", suivre)
  }, [monte, theme])

  const choisir = (cible: Theme) => {
    setTheme(cible)
    appliquer(cible)
    try {
      if (cible === "systeme") localStorage.removeItem(CLE_THEME)
      else localStorage.setItem(CLE_THEME, cible)
    } catch {
      // Le theme reste applique pour cette session, simplement pas retenu.
    }
  }

  // Avant montage, le theme affiche est "systeme" : voir plus haut.
  return { theme: monte ? theme : ("systeme" as Theme), choisir }
}

/** Bouton qui fait tourner les trois themes. Utilise hors session, ou il n'y
 *  a pas de menu de profil pour les presenter en liste. */
export function BasculeTheme() {
  const { theme, choisir } = useTheme()
  const Icone = ICONE_THEME[theme]

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={() => choisir(SUIVANT[theme])}
      title={LIBELLE[theme]}
      aria-label={LIBELLE[theme]}
    >
      <Icone />
    </Button>
  )
}
