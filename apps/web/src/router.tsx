import { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen.ts"

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Les donnees du dashboard changent quand l'utilisateur agit, pas
        // toutes seules : inutile de refetch au moindre focus de fenetre.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  })

  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
