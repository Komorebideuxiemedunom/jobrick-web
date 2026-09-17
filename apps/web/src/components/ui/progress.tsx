import { cn } from "~/lib/utils.ts"

function Progress({
  value,
  className,
}: {
  readonly value: number
  readonly className?: string
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      data-slot="progress"
      className={cn("bg-secondary relative h-1.5 w-full overflow-hidden rounded-full", className)}
    >
      <div
        className="bg-primary h-full transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export { Progress }
