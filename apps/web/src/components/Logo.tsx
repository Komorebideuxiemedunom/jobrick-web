import { CrosshairIcon } from "lucide-react"
import { cn } from "~/lib/utils.ts"

/**
 * Marque Jobrick. Le point final en violet est le seul ornement du systeme :
 * il porte l'accent a lui seul, ce qui permet de garder le reste sobre.
 */
export function Logo({
  className,
  taille = "md",
}: {
  readonly className?: string
  readonly taille?: "sm" | "md" | "lg"
}) {
  const tailles = {
    sm: { texte: "text-base", icone: "size-4" },
    md: { texte: "text-lg", icone: "size-5" },
    lg: { texte: "text-xl", icone: "size-6" },
  }[taille]

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CrosshairIcon className={cn("text-primary", tailles.icone)} />
      <span className={cn("font-extrabold tracking-tight", tailles.texte)}>
        Jobrick<span className="text-primary">.</span>
      </span>
    </span>
  )
}
