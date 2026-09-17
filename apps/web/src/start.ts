/**
 * Instance Start : c'est ici qu'on greffe les routes HTTP brutes.
 *
 * Le module d'API est charge dynamiquement dans le handler `.server()` : le
 * fichier de demarrage est aussi evalue cote client, et un import statique y
 * ferait entrer Postgres et les secrets dans le bundle du navigateur.
 */
import { createMiddleware, createStart } from "@tanstack/react-start"

const apiMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, pathname, next }) => {
    if (pathname.startsWith("/api/")) {
      const { traiterApi } = await import("./server/api.ts")
      const reponse = traiterApi(request, pathname)
      if (reponse !== undefined) return await reponse
    }
    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [apiMiddleware],
}))
