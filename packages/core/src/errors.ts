/** Erreurs metier partagees. Typees pour rester visibles dans les signatures Effect. */
import { Data } from "effect"

export class NonAutorise extends Data.TaggedError("NonAutorise")<{
  readonly raison: string
}> {}

export class OAuthError extends Data.TaggedError("OAuthError")<{
  readonly etape: "state" | "echange-token" | "profil-discord"
  readonly detail: string
}> {}

export class CvInvalide extends Data.TaggedError("CvInvalide")<{
  readonly raison: string
}> {}
