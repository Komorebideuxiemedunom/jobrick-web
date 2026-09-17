import type { ComponentProps } from "react"
import { cn } from "~/lib/utils.ts"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: ComponentProps<"div"> & { readonly orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      data-slot="separator"
      className={cn(
        "bg-border shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
