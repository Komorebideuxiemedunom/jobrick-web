import type { ComponentProps } from "react"
import { cn } from "~/lib/utils.ts"

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive flex field-sizing-content min-h-20 w-full rounded-[10px] border bg-card px-3.5 py-2.5 text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
