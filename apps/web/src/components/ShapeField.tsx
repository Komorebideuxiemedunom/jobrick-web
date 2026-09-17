/**
 * Fond decoratif : blobs et formes geometriques animes par `motion.ts`.
 * Purement ornemental, donc masque aux lecteurs d'ecran.
 *
 * Les attributs sont poses directement sur le `<svg>` : la regle `.shape`
 * compte sur le ratio intrinseque du viewBox pour sa hauteur automatique.
 */
import type { CSSProperties, ReactNode } from "react"

export type TypeForme = "ring" | "triangle" | "diamond" | "square"

export interface Forme {
  readonly type: TypeForme
  readonly depth: number
  readonly x: string
  readonly y: string
  readonly size: string
}

export interface Blob {
  readonly depth: number
  readonly x: string
  readonly y: string
  readonly size: string
  readonly couleur: string
  readonly opacite: string
}

const DESSINS: Record<TypeForme, { viewBox: string; contenu: ReactNode }> = {
  ring: {
    viewBox: "0 0 263 263",
    contenu: (
      <>
        <path
          d="M131.7 262.6C59.6 263.1.5 204.7 0 132.4-.5 60.1 57.8 1 130 .5c72.1-.5 131.2 57.9 131.7 130.2.5 72.3-57.8 131.5-130 132z"
          fill="currentColor"
        />
        <path
          d="M131.4 217.9c47.5-.3 85.9-39.3 85.6-86.9-.3-47.6-39.2-86.1-86.8-85.8-47.5.3-85.9 39.3-85.6 86.9.3 47.6 39.2 86.1 86.8 85.8z"
          fill="var(--shape-cutout)"
        />
      </>
    ),
  },
  triangle: {
    viewBox: "0 0 132 67",
    contenu: (
      <path d="M132.07 66.14 66.03 0 0 66.14h132.07Z" fill="currentColor" />
    ),
  },
  diamond: {
    viewBox: "0 0 283 284",
    contenu: (
      <path
        d="M142.9 283.5.9 143.2 141.1.9l142 140.4-140.2 142.2Z"
        fill="currentColor"
      />
    ),
  },
  square: {
    viewBox: "0 0 200 200",
    contenu: (
      <rect x="4" y="4" width="192" height="192" rx="22" fill="currentColor" />
    ),
  },
}

export function ShapeField({
  formes,
  blobs,
}: {
  readonly formes: ReadonlyArray<Forme>
  readonly blobs: ReadonlyArray<Blob>
}) {
  return (
    <div className="shape-field" aria-hidden="true">
      {blobs.map((b, i) => (
        <div
          key={`blob-${i}`}
          className="blob"
          data-blob=""
          data-depth={b.depth}
          style={
            {
              "--x": b.x,
              "--y": b.y,
              "--size": b.size,
              "--blob-color": b.couleur,
              "--blob-opacity": b.opacite,
            } as CSSProperties
          }
        />
      ))}
      {formes.map((f, i) => (
        <svg
          key={`shape-${i}`}
          className={`shape shape--${f.type}`}
          data-shape=""
          data-depth={f.depth}
          viewBox={DESSINS[f.type].viewBox}
          style={
            { "--x": f.x, "--y": f.y, "--size": f.size } as CSSProperties
          }
        >
          {DESSINS[f.type].contenu}
        </svg>
      ))}
    </div>
  )
}
