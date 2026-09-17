/**
 * OAuth2 Discord : flot "authorization code", ecrit a la main.
 *
 * C'est deux appels HTTP et une redirection : une librairie dediee
 * n'apporterait rien ici (la seule candidate serieuse, arctic, est depreciee).
 */
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"
import { OAuthError } from "@jobrick/core"
import { DiscordProfile } from "@jobrick/db"
import { Effect, Redacted, Schema } from "effect"
import { AppConfig } from "./config.ts"

const AUTORISATION = "https://discord.com/oauth2/authorize"
const TOKEN = "https://discord.com/api/oauth2/token"
const MOI = "https://discord.com/api/users/@me"

/** `email` sert uniquement a pre-remplir l'affichage ; le DM passe par `identify`. */
const SCOPES = "identify email"

export const redirectUri = (publicUrl: string): string =>
  `${publicUrl.replace(/\/+$/, "")}/api/auth/discord/callback`

/** URL vers laquelle envoyer le navigateur pour demarrer la connexion. */
export const urlAutorisation = (state: string) =>
  Effect.gen(function* () {
    const { discordClientId, publicUrl } = yield* AppConfig
    const params = new URLSearchParams({
      client_id: discordClientId,
      response_type: "code",
      redirect_uri: redirectUri(publicUrl),
      scope: SCOPES,
      state,
      prompt: "none",
    })
    return `${AUTORISATION}?${params.toString()}`
  })

const ReponseToken = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.String,
})

/**
 * Echange le code contre un jeton, puis lit le profil.
 *
 * Le jeton d'acces n'est jamais stocke : on s'en sert une fois pour recuperer
 * l'identite, puis on le jette. Le bot, lui, parle a Discord avec son propre
 * jeton d'application.
 */
export const profilDepuisCode = (code: string) =>
  Effect.gen(function* () {
    const { discordClientId, discordClientSecret, publicUrl } = yield* AppConfig
    const client = yield* HttpClient.HttpClient

    const token = yield* HttpClientRequest.post(TOKEN).pipe(
      HttpClientRequest.bodyUrlParams({
        client_id: discordClientId,
        client_secret: Redacted.value(discordClientSecret),
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(publicUrl),
      }),
      client.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(ReponseToken)),
      Effect.mapError(
        (cause) =>
          new OAuthError({ etape: "echange-token", detail: String(cause) }),
      ),
    )

    return yield* HttpClientRequest.get(MOI).pipe(
      HttpClientRequest.setHeader(
        "Authorization",
        `${token.token_type} ${token.access_token}`,
      ),
      client.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(DiscordProfile)),
      Effect.mapError(
        (cause) =>
          new OAuthError({ etape: "profil-discord", detail: String(cause) }),
      ),
    )
  }).pipe(Effect.scoped)
