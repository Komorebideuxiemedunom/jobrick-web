import type { ComponentProps } from "react"
import { cn } from "~/lib/utils.ts"

/**
 * Interrupteur bati sur une vraie case a cocher plutot que sur Radix : le
 * comportement clavier, le focus et l'annonce aux lecteurs d'ecran viennent
 * alors du navigateur, gratuitement et sans bibliotheque.
 */
function Switch({ className, ...props }: ComponentProps<"input">) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <input
        type="checkbox"
        role="switch"
        data-slot="switch"
        className={cn(
          "peer h-5 w-9 cursor-pointer appearance-none rounded-full border border-transparent bg-input transition-colors outline-none",
          "checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          className,
        )}
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-4"
      />
    </span>
  )
}

export { Switch }
