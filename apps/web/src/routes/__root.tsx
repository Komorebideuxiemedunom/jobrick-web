import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"
import type { ReactNode } from "react"
import appCss from "~/styles/app.css?url"

/**
 * Applique le theme du systeme avant le premier rendu. Sans ce script inline,
 * la page s'afficherait en clair pendant un instant avant de basculer.
 */
const SCRIPT_THEME = `(function(){try{var m=matchMedia("(prefers-color-scheme: dark)");var a=function(e){document.documentElement.classList.toggle("dark",e.matches)};a(m);m.addEventListener("change",a)}catch(e){}})()`

export const Route = createRootRouteWithContext<{
  readonly queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Jobrick — ta veille d'offres, pilotee par toi" },
      {
        name: "description",
        content:
          "Configure ta veille d'emploi automatique : CV, zones de recherche, notifications Discord.",
      },
      { name: "color-scheme", content: "light dark" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_THEME }} />
        <HeadContent />
      </head>
      <body className="font-sans">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

export { Outlet }
