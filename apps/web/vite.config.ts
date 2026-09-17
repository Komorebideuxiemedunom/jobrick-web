import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"

const racineDepot = fileURLToPath(new URL("../..", import.meta.url))

export default defineConfig(({ mode }) => {
  // Le code serveur lit sa configuration dans `process.env` via Effect Config.
  // Vite, lui, ne charge `.env` que dans `import.meta.env` : on fait le pont
  // ici pour que `pnpm dev` marche sans prefixer chaque variable de `VITE_`.
  // En production, les variables viennent de l'environnement du conteneur.
  Object.assign(process.env, loadEnv(mode, racineDepot, ""))

  return {
    server: { port: 3000 },
    plugins: [tanstackStart()],
    // Ces deux-la ne sont chargees que dans le navigateur, a la demande
    // (scan ATS) : on les sort du pre-bundling.
    optimizeDeps: { exclude: ["pdfjs-dist", "mammoth"] },
  }
})
