export * from "./auth.ts"
export * from "./invitations.ts"
export * from "./offres.ts"
export * from "./profil.ts"
export * from "./sql.ts"

import { Layer } from "effect"
import { OAuthStates, Sessions, Users } from "./auth.ts"
import { Invitations } from "./invitations.ts"
import { JobResults } from "./offres.ts"
import { Profiles, Zones } from "./profil.ts"
import { PgLive } from "./sql.ts"

/**
 * Tous les depots, branches sur Postgres. C'est la seule couche que le site
 * et le bot ont besoin de fournir.
 */
export const DbLive = Layer.mergeAll(
  Users.Default,
  Sessions.Default,
  OAuthStates.Default,
  Invitations.Default,
  Profiles.Default,
  Zones.Default,
  JobResults.Default,
).pipe(Layer.provideMerge(PgLive))
