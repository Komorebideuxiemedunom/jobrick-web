import { useState } from "react"
import { cn } from "~/lib/utils.ts"

function Avatar({
  src,
  alt,
  fallback,
  className,
}: {
  readonly src: string
  readonly alt: string
  readonly fallback: string
  readonly className?: string
}) {
  const [echec, setEchec] = useState(false)

  return (
    <span
      data-slot="avatar"
      className={cn(
        "bg-muted text-muted-foreground relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-medium",
        className,
      )}
    >
      {echec ? (
        fallback
      ) : (
        <img
          src={src}
          alt={alt}
          className="aspect-square size-full object-cover"
          onError={() => setEchec(true)}
        />
      )}
    </span>
  )
}

export { Avatar }
