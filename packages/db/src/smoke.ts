/**
 * Verification de bout en bout de la couche donnees, contre un vrai Postgres.
 *
 * Ce n'est pas une suite de tests unitaires : c'est un passage complet qui
 * exerce le SQL reel et le decodage des schemas : les deux endroits ou une
 * erreur ne se voit pas au typecheck. Lancer avec `pnpm db:smoke`.
 */
import { NodeRuntime } from "@effect/platform-node"
import { SqlClient } from "@effect/sql"
import { Effect, Option } from "effect"
import { DbLive, type DiscordProfile } from "./index.ts"
import { OAuthStates, Sessions, Users } from "./auth.ts"
import { Invitations } from "./invitations.ts"
import { JobResults } from "./offres.ts"
import { Profiles, Zones } from "./profil.ts"
import type { JobResultId } from "@jobrick/core"

const verifier = (condition: boolean, quoi: string) =>
  condition
    ? Effect.log(`  ok - ${quoi}`)
    : Effect.die(new Error(`ECHEC - ${quoi}`))

const PROFIL_A: DiscordProfile = {
  id: "123456789012345678",
  username: "komorebi",
  global_name: "Komorebi",
  avatar: null,
  email: "a@example.com",
}

const PROFIL_B: DiscordProfile = {
  id: "987654321098765432",
  username: "quelquun-dautre",
  global_name: null,
  avatar: null,
  email: null,
}

const programme = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const users = yield* Users
  const sessions = yield* Sessions
  const states = yield* OAuthStates
  const invitations = yield* Invitations
  const profiles = yield* Profiles
  const zones = yield* Zones
  const offres = yield* JobResults

  // Table rase : le passage doit pouvoir etre rejoue autant de fois qu'on veut.
  yield* sql`delete from users where discord_id in (${PROFIL_A.id}, ${PROFIL_B.id})`
  yield* sql`delete from invitations where discord_id in (${PROFIL_A.id}, ${PROFIL_B.id})`

  yield* Effect.log("Utilisateur")
  const a = yield* users.upsertDepuisDiscord(PROFIL_A)
  const b = yield* users.upsertDepuisDiscord(PROFIL_B)
  yield* verifier(a.discordId === PROFIL_A.id, "cree depuis Discord")
  yield* verifier(a.displayName === "Komorebi", "displayName prend global_name")
  yield* verifier(b.displayName === "quelquun-dautre", "sinon il retombe sur username")
  yield* verifier(a.avatarUrl.includes("embed/avatars"), "avatar par defaut calcule")

  const rejoue = yield* users.upsertDepuisDiscord({ ...PROFIL_A, username: "komorebi2" })
  yield* verifier(rejoue.id === a.id, "upsert idempotent")
  yield* verifier(rejoue.username === "komorebi2", "pseudo rafraichi")

  yield* Effect.log("Session")
  const { jeton } = yield* sessions.creer(a.id)
  yield* verifier(Option.isSome(yield* sessions.valider(jeton)), "jeton valide")
  yield* verifier(Option.isNone(yield* sessions.valider("faux")), "jeton bidon refuse")
  const stocke = yield* sql<{ id: string }>`select id from sessions where user_id = ${a.id}`
  yield* verifier(
    stocke[0] !== undefined && stocke[0].id !== jeton,
    "la base ne stocke pas le jeton en clair",
  )
  yield* sessions.invalider(jeton)
  yield* verifier(Option.isNone(yield* sessions.valider(jeton)), "deconnexion invalide la session")

  yield* Effect.log("State OAuth")
  const state = yield* states.creer("/dashboard")
  yield* verifier(Option.isSome(yield* states.consommer(state)), "state consomme")
  yield* verifier(Option.isNone(yield* states.consommer(state)), "state non rejouable")

  yield* Effect.log("Profil et CV")
  const p0 = yield* profiles.get(a.id)
  yield* verifier(p0.notifyDm, "DM actives par defaut")
  yield* verifier(!p0.hasCv, "pas de CV au depart")
  yield* profiles.enregistrer(a.id, { jobKeywords: "UX designer", notifyDm: true })
  const contenu = new Uint8Array([37, 80, 68, 70, 0, 255, 128, 10, 65])
  yield* profiles.enregistrerCv(a.id, {
    filename: "cv.pdf",
    mime: "application/pdf",
    data: contenu,
  })
  const p1 = yield* profiles.get(a.id)
  yield* verifier(p1.jobKeywords === "UX designer", "mots-cles enregistres")
  yield* verifier(p1.hasCv && p1.cvSize === contenu.byteLength, "taille du CV exacte")
  const cv = yield* profiles.lireCv(a.id)
  yield* verifier(
    Option.isSome(cv) && Buffer.from(cv.value.data).equals(Buffer.from(contenu)),
    "aller-retour bytea sans alteration (octets nuls compris)",
  )

  yield* Effect.log("Zones")
  yield* zones.remplacer(a.id, [
    { label: "Valence", departement: "26", lat: 44.93, lng: 4.89, rayonKm: 25, active: true },
    { label: "Lyon", departement: "69", lat: 45.76, lng: 4.83, rayonKm: 40, active: false },
  ])
  const z1 = yield* zones.parUtilisateur(a.id)
  yield* verifier(z1.length === 2, "deux zones enregistrees")
  yield* verifier(z1.some((z) => z.label === "Lyon" && z.rayonKm === 40), "rayon conserve")
  yield* verifier(z1.some((z) => z.label === "Valence" && z.departement === "26"), "departement conserve")
  yield* verifier(
    z1.filter((z) => z.active).length === 1,
    "une zone en pause reste enregistree mais marquee inactive",
  )
  yield* zones.remplacer(a.id, [
    { label: "Grenoble", departement: "38", lat: 45.19, lng: 5.72, rayonKm: 15, active: true },
  ])
  const z2 = yield* zones.parUtilisateur(a.id)
  yield* verifier(z2.length === 1 && z2[0]?.label === "Grenoble", "remplacement integral")
  yield* verifier(
    (yield* zones.parUtilisateur(b.id)).length === 0,
    "les zones ne fuitent pas entre comptes",
  )

  yield* Effect.log("Offres")
  const inserees = yield* sql<{ id: JobResultId }>`
    insert into job_results (user_id, titre, employeur, lieu, url, score, raison)
    values
      (${a.id}, 'UX designer', 'Studio A', 'Valence', 'https://ex.test/1', 82, 'Colle au CV'),
      (${a.id}, 'Chef de projet', 'Studio B', 'Lyon', 'https://ex.test/2', 41, 'Partiel'),
      (${b.id}, 'Autre', 'Studio C', 'Paris', 'https://ex.test/3', 70, 'Pour B')
    returning id
  `
  const o1 = inserees[0]
  const o2 = inserees[1]
  if (o1 === undefined || o2 === undefined) return yield* Effect.die("insertion ratee")

  const listeA = yield* offres.parUtilisateur(a.id)
  yield* verifier(listeA.length === 2, "chacun ne voit que ses offres")
  yield* verifier(listeA[0]?.createdAt instanceof Date, "dates decodees")

  yield* offres.marquerVue(a.id, o1.id)
  yield* verifier(
    (yield* offres.parUtilisateur(a.id)).find((o) => o.id === o1.id)?.vu === true,
    "offre marquee vue",
  )

  // Le coeur de ce qui remplace les policies RLS : le user_id du `where`.
  yield* offres.marquerVue(b.id, o2.id)
  yield* verifier(
    (yield* offres.parUtilisateur(a.id)).find((o) => o.id === o2.id)?.vu === false,
    "un autre compte ne peut pas toucher mon offre",
  )

  yield* offres.definirPostule(a.id, o2.id, true)
  const postulee = (yield* offres.parUtilisateur(a.id)).find((o) => o.id === o2.id)
  yield* verifier(postulee?.postule === true && postulee.postuleAt !== null, "postule + date")

  yield* Effect.log("File de notification du bot")
  const file = yield* offres.aNotifier(10)
  yield* verifier(file.length === 3, "trois offres en attente de DM")
  yield* verifier(
    file.some((o) => o.discordId === PROFIL_A.id),
    "l'identifiant Discord du destinataire est joint",
  )
  yield* offres.marquerNotifiees(file.map((o) => o.id))
  yield* verifier((yield* offres.aNotifier(10)).length === 0, "file videe apres envoi")

  yield* profiles.enregistrer(b.id, { jobKeywords: "", notifyDm: false })
  yield* sql`insert into job_results (user_id, titre) values (${b.id}, 'Apres coupure des DM')`
  yield* verifier(
    (yield* offres.aNotifier(10)).length === 0,
    "DM desactives : rien n'entre dans la file",
  )

  yield* Effect.log("Boutons du DM")
  yield* offres.definirInteretParDiscord(PROFIL_A.id, o1.id, false)
  yield* verifier(
    (yield* offres.parUtilisateur(a.id)).find((o) => o.id === o1.id)?.interet === false,
    "bouton Passer, via identifiant Discord",
  )
  yield* offres.definirInteretParDiscord(PROFIL_B.id, o1.id, true)
  yield* verifier(
    (yield* offres.parUtilisateur(a.id)).find((o) => o.id === o1.id)?.interet === false,
    "un autre compte Discord ne peut pas trancher a ma place",
  )
  yield* offres.definirPostuleParDiscord(PROFIL_A.id, o1.id)
  yield* verifier(
    (yield* offres.parUtilisateur(a.id)).find((o) => o.id === o1.id)?.postule === true,
    "bouton J'ai postule",
  )
  const dernieres = yield* offres.dernieresParDiscord(PROFIL_A.id, 5)
  yield* verifier(
    dernieres.every((o) => o.interet !== false),
    "la commande /offres ne remonte pas les offres ecartees",
  )

  yield* Effect.log("Invitations")
  yield* verifier(
    !(yield* invitations.autorise(PROFIL_B.id)),
    "un inconnu n'est pas autorise",
  )
  yield* verifier(
    yield* invitations.ajouter(PROFIL_B.id, { invitePar: PROFIL_A.id, note: "un ami" }),
    "invitation ajoutee",
  )
  yield* verifier(
    !(yield* invitations.ajouter(PROFIL_B.id, { invitePar: PROFIL_A.id, note: null })),
    "reinviter quelqu'un ne cree pas de doublon",
  )
  yield* verifier(yield* invitations.autorise(PROFIL_B.id), "l'invite est autorise")
  yield* verifier(
    (yield* invitations.lister()).some(
      (i) => i.discordId === PROFIL_B.id && i.note === "un ami",
    ),
    "la liste porte la note",
  )
  // Retirer quelqu'un doit le mettre dehors tout de suite : sans cela il
  // resterait connecte jusqu'a l'expiration de son cookie, soit trente jours.
  const jetonB = (yield* sessions.creer(b.id)).jeton
  yield* verifier(yield* invitations.retirer(PROFIL_B.id), "invitation retiree")
  yield* verifier(
    Option.isNone(yield* sessions.valider(jetonB)),
    "retirer l'invitation ferme les sessions ouvertes",
  )
  yield* verifier(
    Option.isSome(yield* sessions.valider((yield* sessions.creer(a.id)).jeton)),
    "mais ne touche pas aux sessions des autres",
  )
  yield* verifier(
    !(yield* invitations.retirer(PROFIL_B.id)),
    "retirer deux fois ne ment pas sur le resultat",
  )

  yield* Effect.log("Menage")
  yield* sql`delete from users where discord_id in (${PROFIL_A.id}, ${PROFIL_B.id})`
  yield* sql`delete from invitations where discord_id in (${PROFIL_A.id}, ${PROFIL_B.id})`
  const restantes = yield* sql<{ n: string }>`select count(*)::text as n from job_results`
  yield* verifier(
    restantes[0]?.n === "0",
    "suppression en cascade (offres, zones, sessions, profil)",
  )

  yield* Effect.log("Tout est vert.")
})

NodeRuntime.runMain(programme.pipe(Effect.provide(DbLive), Effect.asVoid))
