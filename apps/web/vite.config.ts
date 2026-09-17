import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import tailwindcss from "@tailwindcss/vite"
import viteReact from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"

const racineDepot = fileURLToPath(new URL("../..", import.meta.url))
const src = fileURLToPath(new URL("./src", import.meta.url))

export default defineConfig(({ mode }) => {
  // Le code serveur lit sa configuration dans `process.env` via Effect Config.
  // Vite, lui, ne charge `.env` que dans `import.meta.env` : on fait le pont
  // ici pour que `pnpm dev` marche sans prefixer chaque variable de `VITE_`.
  // En production, les variables viennent de l'environnement du conteneur.
  Object.assign(process.env, loadEnv(mode, racineDepot, ""))

  return {
    server: { port: 3000 },
    // `~` pointe sur src/, comme dans tsconfig.json. Declare ici explicitement
    // plutot que deduit du tsconfig : le serveur de dev ne lit pas les `paths`.
    resolve: { alias: { "~": src } },
    // `tanstackStart` d'abord, `viteReact` ensuite : le mode dev de Start
    // s'appuie sur le runtime React Refresh fourni par le second.
    plugins: [tailwindcss(), tanstackStart(), viteReact()],
    // Ces deux-la ne sont chargees que dans le navigateur, a la demande
    // (scan ATS) : on les sort du pre-bundling.
    optimizeDeps: { exclude: ["pdfjs-dist", "mammoth"] },
  }
})
