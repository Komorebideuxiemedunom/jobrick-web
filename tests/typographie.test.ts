/**
 * Garde-fou typographique : aucun tiret cadratin dans le depot.
 *
 * Le tiret cadratin est la signature la plus reconnaissable d'un texte
 * genere : on l'interdit partout, code et documentation comprise. En
 * francais, le deux-points ou la virgule font le meme travail.
 *
 * Le test lit la liste des fichiers suivis par git plutot que de parcourir le
 * disque : node_modules, dist et les fichiers ignores sortent d'eux-memes.
 */
import { strict as assert } from "node:assert"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import * as path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

const TIRET_CADRATIN = "\u2014"

/** Extensions binaires : les lire en texte n'aurait aucun sens. */
const BINAIRES = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
  ".woff", ".woff2", ".ttf", ".otf", ".zip", ".gz",
])

const fichiersSuivis = (): ReadonlyArray<string> =>
  execFileSync("git", ["ls-files", "-z"], { cwd: RACINE, encoding: "utf8" })
    .split("\0")
    .filter((f) => f.length > 0 && !BINAIRES.has(path.extname(f).toLowerCase()))

/** Emplacements precis, pour que l'echec dise quoi corriger et ou. */
const occurrences = (fichier: string): ReadonlyArray<string> => {
  let contenu: string
  try {
    contenu = readFileSync(path.join(RACINE, fichier), "utf8")
  } catch {
    // Fichier supprime mais encore indexe : rien a verifier.
    return []
  }
  if (!contenu.includes(TIRET_CADRATIN)) return []

  return contenu
    .split("\n")
    .flatMap((ligne, i) =>
      ligne.includes(TIRET_CADRATIN) ? [`${fichier}:${i + 1}: ${ligne.trim()}`] : [],
    )
}

test("aucun tiret cadratin dans les fichiers suivis", () => {
  const fautifs = fichiersSuivis().flatMap(occurrences)

  assert.deepEqual(
    fautifs,
    [],
    `Tiret cadratin interdit (${fautifs.length} occurrence(s)). ` +
      `Utilise " : " ou une virgule.\n${fautifs.join("\n")}`,
  )
})

test("le test lit bien quelque chose", () => {
  // Sans ce garde-fou, un `git ls-files` qui echoue rendrait le test
  // precedent vert en ne verifiant rien du tout.
  assert.ok(
    fichiersSuivis().length > 10,
    "la liste des fichiers suivis est anormalement courte",
  )
})
