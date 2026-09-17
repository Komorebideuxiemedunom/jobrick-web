import { ChevronDownIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { cn } from "~/lib/utils.ts"

/**
 * Select natif, habille aux couleurs shadcn. Suffisant ici (une liste courte,
 * pas de recherche ni de groupes), et il herite du selecteur natif du systeme
 * sur mobile.
 */
function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative inline-flex w-fit items-center">
      <select
        data-slot="select"
        className={cn(
          "border-input h-9 w-full cursor-pointer appearance-none rounded-md border bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute right-2.5 size-4" />
    </div>
  )
}

export { Select }
