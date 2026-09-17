import type { ComponentProps } from "react"
import { cn } from "~/lib/utils.ts"

function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "border-input size-4 shrink-0 cursor-pointer rounded-[4px] border shadow-xs transition-shadow outline-none",
        "accent-primary focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Checkbox }
