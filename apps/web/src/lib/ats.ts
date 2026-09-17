/**
 * Scanner ATS : verifie qu'un CV est lisible par les filtres automatiques de
 * recrutement. Heuristique indicative.
 *
 * Tout tourne dans le navigateur, et c'est volontaire : le contenu du CV n'est
 * jamais envoye a un service tiers. Le fichier vient de `/api/cv` (notre
 * serveur) ou directement du disque, et repart nulle part.
 */
export interface AtsCheck {
  readonly label: string
  readonly pass: boolean
  readonly detail?: string
}

export type AtsNiveau = "good" | "warn" | "bad" | "inconnu"

export interface AtsResultat {
  readonly score: number | null
  readonly niveau: AtsNiveau
  readonly checks: ReadonlyArray<AtsCheck>
}

const normaliser = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

/**
 * pdf.js et mammoth pesent lourd : on ne les charge qu'au premier scan,
 * pas au chargement du dashboard.
 */
const extrairePdf = async (buffer: ArrayBuffer): Promise<string> => {
  const pdfjs = await import("pdfjs-dist")
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const doc = await pdfjs.getDocument({ data: buffer }).promise
  let texte = ""
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const contenu = await page.getTextContent()
    texte +=
      contenu.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ") + "\n"
  }
  return texte
}

const extraireDocx = async (buffer: ArrayBuffer): Promise<string> => {
  const mammoth = await import("mammoth/mammoth.browser.js")
  const resultat = await mammoth.extractRawText({ arrayBuffer: buffer })
  return resultat.value ?? ""
}

const SECTIONS = [
  ["experience", "parcours professionnel", "experience professionnelle"],
  ["formation", "education", "diplome", "etudes"],
  ["competence", "competences", "skills"],
  ["contact", "coordonnees"],
] as const

const compterSections = (texteNorm: string): number =>
  SECTIONS.filter((variantes) => variantes.some((v) => texteNorm.includes(v))).length

const verifierContact = (texte: string) => ({
  email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(texte),
  tel: /(?:\+33|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}/.test(texte),
})

const motsClesDe = (jobKeywords: string): ReadonlyArray<string> =>
  jobKeywords
    .split(/[\n,]/)
    .map((s) => normaliser(s.trim()))
    .filter((s) => s.length > 0)

export const scanCV = async (
  blob: Blob,
  filename: string,
  jobKeywords: string,
): Promise<AtsResultat> => {
  const ext = filename.toLowerCase().split(".").pop()
  const checks: Array<AtsCheck> = []

  if (ext === "doc") {
    return {
      score: null,
      niveau: "inconnu",
      checks: [
        {
          label: "Format .doc (ancien) non analysable dans le navigateur",
          pass: false,
          detail: "Convertis-le en PDF ou .docx pour un scan complet.",
        },
      ],
    }
  }

  let texte = ""
  let extractionOk = false
  try {
    const buffer = await blob.arrayBuffer()
    if (ext === "pdf") texte = await extrairePdf(buffer)
    else if (ext === "docx") texte = await extraireDocx(buffer)
    extractionOk = texte.trim().length > 200
  } catch {
    extractionOk = false
  }

  let score = 0

  // 1. Texte extractible (40 pts) : sinon le CV est probablement une image
  // scannee, illisible par un ATS.
  checks.push({
    label: extractionOk
      ? "Texte du CV lisible par une machine"
      : "Aucun texte exploitable trouve (CV probablement scanne en image)",
    pass: extractionOk,
  })
  if (extractionOk) score += 40

  const texteNorm = normaliser(texte)

  // 2. Mots-cles (30 pts) : recouvrement avec les intitules vises.
  const motsCles = motsClesDe(jobKeywords)
  if (extractionOk && motsCles.length > 0) {
    const trouves = motsCles.filter((m) => texteNorm.includes(m))
    const ratio = trouves.length / motsCles.length
    checks.push({
      label:
        ratio >= 0.4
          ? `${trouves.length}/${motsCles.length} mots-cles de ton profil retrouves dans le CV`
          : `Seulement ${trouves.length}/${motsCles.length} mots-cles de ton profil retrouves dans le CV`,
      pass: ratio >= 0.4,
    })
    score += Math.round(30 * ratio)
  } else if (extractionOk) {
    checks.push({
      label: "Aucun mot-cle renseigne dans ton profil pour comparer",
      pass: false,
    })
  }

  // 3. Sections standards (15 pts)
  if (extractionOk) {
    const nb = compterSections(texteNorm)
    checks.push({
      label:
        nb >= 2
          ? "Sections standards detectees (experience, formation, competences...)"
          : "Peu de sections standards detectees — utilise des intitules classiques",
      pass: nb >= 2,
    })
    score += Math.round((15 * Math.min(nb, 4)) / 4)
  }

  // 4. Coordonnees (15 pts)
  if (extractionOk) {
    const { email, tel } = verifierContact(texte)
    checks.push({ label: "Adresse email detectee", pass: email })
    checks.push({ label: "Numero de telephone detecte", pass: tel })
    score += (email ? 8 : 0) + (tel ? 7 : 0)
  }

  const niveau: AtsNiveau = score >= 75 ? "good" : score >= 45 ? "warn" : "bad"
  return { score, niveau, checks }
}

export const LIBELLE_NIVEAU: Record<AtsNiveau, string> = {
  good: "ATS-friendly",
  warn: "A ameliorer",
  bad: "Risque eleve",
  inconnu: "Non analysable",
}
