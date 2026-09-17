/**
 * Serveur de production.
 *
 * `vite build` produit un handler Web standard (`{ fetch(Request) }`), pas un
 * serveur qui ecoute. Ce fichier fait les deux traductions manquantes : servir
 * les assets statiques, et faire le pont entre les objets Node et les objets
 * Web.
 *
 * Volontairement sans dependance : c'est une soixantaine de lignes bien
 * comprises plutot qu'un paquet de plus a suivre dans l'image Docker.
 */
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, sep } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const racine = fileURLToPath(new URL(".", import.meta.url))
const clientDir = join(racine, "dist", "client")
const port = Number(process.env["PORT"] ?? 3000)

const { default: handler } = await import(
  join(racine, "dist", "server", "server.js")
)

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
}

/**
 * Sert un fichier de `dist/client` s'il existe. Renvoie `false` sinon, pour
 * que la requete parte vers l'application.
 */
const servirStatique = async (req, res, pathname) => {
  if (req.method !== "GET" && req.method !== "HEAD") return false

  // `normalize` puis verification du prefixe : sans ca, un `..%2f` sortirait
  // du dossier public.
  const chemin = join(clientDir, normalize(decodeURIComponent(pathname)))
  if (!chemin.startsWith(clientDir + sep)) return false

  let infos
  try {
    infos = await stat(chemin)
  } catch {
    return false
  }
  if (!infos.isFile()) return false

  // Les fichiers de `assets/` portent un hash dans leur nom : ils peuvent
  // etre caches indefiniment. Le reste doit etre revalide.
  const immuable = pathname.startsWith("/assets/")
  res.writeHead(200, {
    "Content-Type": TYPES[extname(chemin)] ?? "application/octet-stream",
    "Content-Length": infos.size,
    "Cache-Control": immuable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
  })
  if (req.method === "HEAD") {
    res.end()
    return true
  }
  await pipeline(createReadStream(chemin), res)
  return true
}

const versRequestWeb = (req, origine) => {
  const aUnCorps = req.method !== "GET" && req.method !== "HEAD"
  return new Request(new URL(req.url, origine), {
    method: req.method,
    headers: req.headers,
    body: aUnCorps ? Readable.toWeb(req) : undefined,
    // Obligatoire des qu'on passe un flux en corps de requete.
    duplex: aUnCorps ? "half" : undefined,
  })
}

const ecrireReponse = async (reponse, res) => {
  res.writeHead(reponse.status, Object.fromEntries(reponse.headers))
  if (reponse.body === null) {
    res.end()
    return
  }
  await pipeline(Readable.fromWeb(reponse.body), res)
}

createServer((req, res) => {
  void (async () => {
    try {
      const origine = `http://${req.headers.host ?? `localhost:${port}`}`
      const { pathname } = new URL(req.url, origine)
      if (await servirStatique(req, res, pathname)) return
      await ecrireReponse(await handler.fetch(versRequestWeb(req, origine)), res)
    } catch (erreur) {
      console.error("Erreur de requete :", erreur)
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" })
      res.end("Erreur interne")
    }
  })()
}).listen(port, () => {
  console.log(`Jobrick ecoute sur http://0.0.0.0:${port}`)
})
