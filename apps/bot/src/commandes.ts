/**
 * Publication des commandes slash.
 *
 * Publiees globalement (et non par serveur) : le bot parle surtout en message
 * prive, ou seules les commandes globales existent. Discord met jusqu'a une
 * heure a les propager la premiere fois.
 */
import {
  ApplicationIntegrationType,
  InteractionContextType,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js"
import { Effect, Redacted } from "effect"
import { BotConfig } from "./config.ts"

/**
 * Exporte plutot que gardee privee : `tests/commandes.test.ts` la relit pour
 * verifier ce que Discord exigerait au demarrage. Une erreur de payload ne se
 * voit ni au typecheck, ni avant que le bot ne tente de publier.
 */
export const COMMANDES = [
  new SlashCommandBuilder()
    .setName("offres")
    .setDescription("Affiche tes 5 dernieres offres Jobrick")
    // Les deux modes d'installation. `UserInstall` permet d'utiliser la
    // commande en message prive sans passer par un serveur ; `GuildInstall`
    // reste necessaire pour que le bot puisse envoyer un DM de lui-meme.
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ])
    // Sans `BotDM`, la commande n'existe pas dans la conversation privee avec
    // le bot : c'est pourtant la que tout se passe.
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
      InteractionContextType.Guild,
    ])
    .toJSON(),

  // Reservee au proprietaire, mais Discord ne sait pas l'exprimer pour une
  // commande utilisable en message prive : le filtre est dans le code de
  // l'interaction, pas ici.
  new SlashCommandBuilder()
    .setName("inviter")
    .setDescription("Gere la liste des personnes autorisees sur Jobrick")
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ])
    .setContexts([
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
      InteractionContextType.Guild,
    ])
    .addSubcommand((c) =>
      c
        .setName("ajouter")
        .setDescription("Autorise quelqu'un a se connecter au site")
        // Deux facons de designer la personne : le selecteur ne resout que
        // les gens rattachables a un contexte commun, ce qui echoue parfois
        // en message prive. L'identifiant brut est la porte de secours.
        .addUserOption((o) =>
          o.setName("personne").setDescription("La personne a inviter").setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("identifiant")
            .setDescription("Son identifiant Discord, si le selecteur ne la trouve pas")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("note")
            .setDescription("Pour te souvenir de qui c'est")
            .setRequired(false),
        ),
    )
    .addSubcommand((c) =>
      c
        .setName("retirer")
        .setDescription("Retire l'acces et coupe les sessions ouvertes")
        .addUserOption((o) =>
          o.setName("personne").setDescription("La personne a retirer").setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("identifiant")
            .setDescription("Son identifiant Discord")
            .setRequired(false),
        ),
    )
    .addSubcommand((c) =>
      c.setName("liste").setDescription("Affiche les personnes autorisees"),
    )
    .toJSON(),
]

export const publierCommandes = Effect.gen(function* () {
  const { token, applicationId } = yield* BotConfig
  const rest = new REST().setToken(Redacted.value(token))
  yield* Effect.tryPromise({
    try: () =>
      rest.put(Routes.applicationCommands(applicationId), { body: COMMANDES }),
    catch: (cause) =>
      new Error(`Publication des commandes impossible : ${String(cause)}`),
  })
  yield* Effect.log(`${COMMANDES.length} commande(s) publiee(s)`)
})
