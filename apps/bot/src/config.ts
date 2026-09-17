/** Configuration du bot, lue dans l'environnement. */
import { Config, Duration } from "effect"

export const BotConfig = Config.all({
  /** Jeton du bot : onglet "Bot" du portail developpeur Discord. */
  token: Config.redacted("DISCORD_BOT_TOKEN"),
  /** Identifiant de l'application, pour publier les commandes. */
  applicationId: Config.string("DISCORD_APPLICATION_ID"),
  /** URL publique du site, mise en lien dans les messages prives. */
  publicUrl: Config.string("PUBLIC_URL"),
  /**
   * Identifiant Discord du proprietaire : le seul a pouvoir lancer
   * `/inviter`. Le controle se fait dans le code de l'interaction et non avec
   * `setDefaultMemberPermissions`, qui ne vaut que dans les salons d'un
   * serveur : en message prive, la commande resterait ouverte a tous.
   */
  proprietaire: Config.string("DISCORD_PROPRIETAIRE").pipe(
    Config.withDefault(""),
    Config.map((v) => (v.trim() === "" ? null : v.trim())),
  ),
  /**
   * Frequence a laquelle le bot regarde s'il y a des offres a annoncer.
   * La veille ne tourne que deux fois par jour : inutile d'interroger la
   * base plus souvent que la minute.
   */
  intervalle: Config.duration("BOT_POLL_INTERVAL").pipe(
    Config.withDefault(Duration.seconds(60)),
  ),
  /** Nombre d'offres envoyees par passage, pour rester sous le rate limit. */
  lot: Config.integer("BOT_BATCH_SIZE").pipe(Config.withDefault(25)),
})

export type BotConfig = Config.Config.Success<typeof BotConfig>
