import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"
import appCss from "~/styles/app.css?url"

/**
 * Applique le theme du systeme avant le premier rendu. Sans ce script inline,
 * la page s'afficherait en clair pendant un instant avant de basculer.
 */
const SCRIPT_THEME = `(function(){try{var c="jobrick-theme";var s=null;try{s=localStorage.getItem(c)}catch(e){}var m=matchMedia("(prefers-color-scheme: dark)");var a=function(){var d=s==="sombre"||(s!=="clair"&&m.matches);document.documentElement.classList.toggle("dark",d)};a();if(s!=="clair"&&s!=="sombre"){m.addEventListener("change",a)}}catch(e){}})()`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Jobrick : ta veille d'offres, pilotee par toi" },
      {
        name: "description",
        content:
          "Configure ta veille d'emploi automatique : CV, zones de recherche, notifications Discord.",
      },
      { name: "color-scheme", content: "light dark" },
    ],
    links: [
      // Le SVG sert partout ou il est compris, l'ICO reste pour les
      // navigateurs qui ne lisent que lui et pour les requetes a la racine.
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", sizes: "32x32", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
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
