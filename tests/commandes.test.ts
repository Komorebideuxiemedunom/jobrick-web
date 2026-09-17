/**
 * Les commandes slash vivent chez Discord, pas dans le depot.
 *
 * Le bot les publie au demarrage : un payload invalide ne se voit donc ni au
 * typecheck ni au build, mais seulement quand Discord renvoie un 400 a
 * l'allumage, en production. Ce test relit la liste et rejoue les regles de
 * l'API, plus celles qui sont propres a Jobrick : le bot parle surtout en
 * message prive, une commande qui n'y existe pas ne sert a rien.
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"
import { COMMANDES } from "../apps/bot/src/commandes.ts"

/** Contexte 1 = `BotDM` : la conversation privee avec le bot. */
const BOT_DM = 1

/** Types d'option qui portent des sous-options (sous-commande, groupe). */
const CONTENEURS = new Set([1, 2])

const NOM_VALIDE = /^[-_\p{L}\p{N}]{1,32}$/u

type Option = {
  readonly name: string
  readonly description: string
  readonly type: number
  readonly required?: boolean
  readonly options?: ReadonlyArray<Option>
}

type Commande = {
  readonly name: string
  readonly description: string
  readonly contexts?: ReadonlyArray<number> | null
  readonly integration_types?: ReadonlyArray<number> | null
  readonly options?: ReadonlyArray<Option>
}

const commandes = COMMANDES as ReadonlyArray<Commande>

/** Parcourt la commande et toutes ses sous-commandes, a plat. */
const niveaux = (c: Commande): ReadonlyArray<ReadonlyArray<Option>> =>
  [c.options ?? []].concat(
    (c.options ?? [])
      .filter((o) => CONTENEURS.has(o.type))
      .flatMap((o) => niveaux(o as Commande)),
  )

test("les noms et descriptions passent les contraintes de l'API", () => {
  for (const c of commandes) {
    assert.match(c.name, NOM_VALIDE, `nom de commande refuse : ${c.name}`)
    assert.equal(c.name, c.name.toLowerCase(), `${c.name} doit etre en minuscules`)
    assert.ok(
      c.description.length >= 1 && c.description.length <= 100,
      `description de /${c.name} : ${c.description.length} caracteres, max 100`,
    )
    for (const options of niveaux(c)) {
      for (const o of options) {
        assert.match(o.name, NOM_VALIDE, `option refusee : /${c.name} ${o.name}`)
        assert.ok(
          o.description.length >= 1 && o.description.length <= 100,
          `description de /${c.name} ${o.name} : ${o.description.length} caracteres`,
        )
      }
    }
  }
})

test("aucun doublon de nom, a aucun niveau", () => {
  const noms = commandes.map((c) => c.name)
  assert.equal(new Set(noms).size, noms.length, "deux commandes portent le meme nom")
  for (const c of commandes) {
    for (const options of niveaux(c)) {
      const n = options.map((o) => o.name)
      assert.equal(new Set(n).size, n.length, `doublon d'option dans /${c.name}`)
    }
  }
})

test("les options obligatoires precedent les facultatives", () => {
  // Discord refuse la liste dans l'autre sens : l'erreur arrive a la
  // publication, avec un message qui ne dit pas laquelle est en cause.
  for (const c of commandes) {
    for (const options of niveaux(c)) {
      const facultative = options.findIndex((o) => o.required !== true)
      const obligatoireApres = options.findIndex(
        (o, i) => facultative !== -1 && i > facultative && o.required === true,
      )
      assert.equal(obligatoireApres, -1, `ordre des options dans /${c.name}`)
    }
  }
})

test("chaque commande existe en message prive", () => {
  // Le bot travaille en DM : une commande publiee sans le contexte `BotDM`
  // serait invisible la ou elle sert. C'est la panne qu'a connue `/offres`.
  for (const c of commandes) {
    assert.ok(
      c.contexts !== undefined && c.contexts !== null && c.contexts.includes(BOT_DM),
      `/${c.name} n'est pas utilisable en message prive`,
    )
    assert.ok(
      c.integration_types !== undefined &&
        c.integration_types !== null &&
        c.integration_types.length > 0,
      `/${c.name} ne declare aucun mode d'installation`,
    )
  }
})

test("la commande d'invitation est complete", () => {
  // Elle est le seul moyen de tenir la liste des acces : si une sous-commande
  // disparait, plus personne ne peut inviter ni retirer qui que ce soit.
  const inviter = commandes.find((c) => c.name === "inviter")
  assert.ok(inviter !== undefined, "/inviter a disparu")
  const sous = (inviter.options ?? []).filter((o) => o.type === 1).map((o) => o.name)
  assert.deepEqual([...sous].sort(), ["ajouter", "liste", "retirer"])
})
