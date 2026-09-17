/** Configuration serveur, lue dans l'environnement au demarrage. */
import { Config } from "effect"

export const AppConfig = Config.all({
  /** Application Discord : onglet OAuth2 du portail developpeur. */
  discordClientId: Config.string("DISCORD_CLIENT_ID"),
  discordClientSecret: Config.redacted("DISCORD_CLIENT_SECRET"),
  /**
   * URL publique du site, sans slash final. Sert a construire la redirect URI
   * OAuth : elle doit correspondre au caractere pres a celle declaree chez
   * Discord, sinon l'echange de jeton est refuse.
   */
  publicUrl: Config.string("PUBLIC_URL"),
  /** Cookie `Secure` en production ; desactivable pour le dev en http. */
  cookieSecure: Config.boolean("COOKIE_SECURE").pipe(Config.withDefault(true)),
})

export type AppConfig = Config.Config.Success<typeof AppConfig>
