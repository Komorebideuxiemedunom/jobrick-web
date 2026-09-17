/**
 * Depot du CV et scanner ATS.
 *
 * Le scan tourne entierement dans le navigateur : soit sur le fichier que
 * l'utilisateur vient de deposer, soit sur celui recupere via `/api/cv`. Le
 * contenu du CV ne part jamais vers un service tiers.
 */
import {
  CheckIcon,
  FileTextIcon,
  Loader2Icon,
  ScanLineIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { useRef, useState } from "react"
import { LIBELLE_NIVEAU, scanCV, type AtsResultat } from "~/lib/ats.ts"
import { cn } from "~/lib/utils.ts"
import { Badge } from "~/components/ui/badge.tsx"
import { Button } from "~/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card.tsx"
import { Separator } from "~/components/ui/separator.tsx"

const EXTENSIONS = [".pdf", ".doc", ".docx"]
const TAILLE_MAX = 10 * 1024 * 1024

interface Props {
  readonly cvEnregistre: string | null
  readonly fichierEnAttente: File | null
  readonly motsCles: string
  readonly onFichier: (f: File | null) => void
}

export function CarteCv({ cvEnregistre, fichierEnAttente, motsCles, onFichier }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [scanEnCours, setScanEnCours] = useState(false)
  const [erreurScan, setErreurScan] = useState<string | null>(null)
  const [resultat, setResultat] = useState<AtsResultat | null>(null)

  const traiter = (fichier: File) => {
    const nom = fichier.name.toLowerCase()
    if (!EXTENSIONS.some((ext) => nom.endsWith(ext))) {
      setErreur("Format non reconnu : PDF, DOC ou DOCX uniquement.")
      return
    }
    if (fichier.size > TAILLE_MAX) {
      setErreur("Fichier trop lourd (10 Mo max).")
      return
    }
    setErreur(null)
    setResultat(null)
    onFichier(fichier)
  }

  const lancerScan = async () => {
    setScanEnCours(true)
    setErreurScan(null)
    setResultat(null)
    try {
      let blob: Blob
      let nom: string
      if (fichierEnAttente !== null) {
        blob = fichierEnAttente
        nom = fichierEnAttente.name
      } else {
        const res = await fetch("/api/cv")
        if (!res.ok) throw new Error(`/api/cv a repondu ${res.status}`)
        blob = await res.blob()
        nom = cvEnregistre ?? "cv.pdf"
      }
      setResultat(await scanCV(blob, nom, motsCles))
    } catch (e) {
      console.error("scan ATS:", e)
      setErreurScan("Erreur pendant l'analyse.")
    } finally {
      setScanEnCours(false)
    }
  }

  const aUnCv = fichierEnAttente !== null || cvEnregistre !== null

  return (
    <Card id="section-cv" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Ton CV</CardTitle>
        <CardDescription>
          Il pilote la veille : c&apos;est lui qui détermine si une offre te correspond.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setSurvol(true)
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault()
            setSurvol(false)
            const f = e.dataTransfer.files[0]
            if (f !== undefined) traiter(f)
          }}
          className={cn(
            "flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
            "hover:bg-secondary/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none",
            survol && "border-primary bg-secondary",
          )}
        >
          <input
            ref={input}
            type="file"
            accept=".pdf,.doc,.docx"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f !== undefined) traiter(f)
            }}
          />
          {aUnCv ? (
            <>
              <FileTextIcon className="text-primary size-5" />
              <span className="flex items-center gap-2 text-sm font-medium">
                {fichierEnAttente?.name ?? cvEnregistre}
                {fichierEnAttente !== null && (
                  <Badge variant="secondary">pas encore enregistre</Badge>
                )}
              </span>
              <span className="text-muted-foreground text-xs">
                Dépose un autre fichier pour le remplacer
              </span>
            </>
          ) : (
            <>
              <UploadIcon className="text-primary size-5" />
              <span className="text-sm font-medium">
                Glisse ton CV ici, ou clique pour choisir un fichier
              </span>
              <span className="text-muted-foreground text-xs">
                PDF, DOC ou DOCX, 10 Mo max
              </span>
            </>
          )}
        </button>

        {erreur !== null && <p className="text-destructive text-sm">{erreur}</p>}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!aUnCv || scanEnCours}
            onClick={() => void lancerScan()}
          >
            {scanEnCours ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <ScanLineIcon />
            )}
            {scanEnCours ? "Analyse en cours…" : "Scanner mon CV (ATS)"}
          </Button>
          {erreurScan !== null && (
            <span className="text-destructive text-sm">{erreurScan}</span>
          )}
        </div>

        {resultat !== null && <PanneauAts resultat={resultat} />}
      </CardContent>
    </Card>
  )
}

const VARIANTE_NIVEAU = {
  good: "success",
  warn: "warning",
  bad: "destructive",
  inconnu: "secondary",
} as const

function PanneauAts({ resultat }: { readonly resultat: AtsResultat }) {
  if (resultat.score === null) {
    const premier = resultat.checks[0]
    return (
      <div className="bg-secondary/60 rounded-xl p-4">
        <p className="text-muted-foreground text-sm">
          {premier?.detail ?? premier?.label}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-secondary/60 flex flex-col gap-4 rounded-xl p-4">
      <div className="flex items-center gap-4">
        <div className="text-primary text-4xl font-extrabold tracking-tight tabular-nums">{resultat.score}</div>
        <div className="flex flex-col gap-1">
          <Badge variant={VARIANTE_NIVEAU[resultat.niveau]} className="w-fit">
            {LIBELLE_NIVEAU[resultat.niveau]}
          </Badge>
          <span className="text-muted-foreground text-xs">Score indicatif sur 100</span>
        </div>
      </div>

      <Separator />

      <ul className="flex flex-col gap-2">
        {resultat.checks.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {c.pass ? (
              <CheckIcon className="text-success mt-0.5 size-4 shrink-0" />
            ) : (
              <XIcon className="text-destructive mt-0.5 size-4 shrink-0" />
            )}
            <span className={cn(!c.pass && "text-muted-foreground")}>{c.label}</span>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground text-xs text-pretty">
        Analyse indicative, exécutée dans ton navigateur : aucun contenu du CV
        n&apos;est envoyé à un serveur externe. Elle ne garantit pas le passage
        d&apos;un ATS réel, mais repère les blocages les plus fréquents.
      </p>
    </div>
  )
}
