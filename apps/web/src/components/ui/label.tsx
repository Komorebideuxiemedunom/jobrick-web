import type { ComponentProps } from "react"
import { cn } from "~/lib/utils.ts"

function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex cursor-pointer items-center gap-2 text-sm leading-none font-medium select-none has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Label }
