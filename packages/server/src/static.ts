import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/** Serves the built web app (packages/web/dist) from the game server, so one port — and one public
 *  https link — carries both the page and socket.io. Only files inside `root` are ever readable
 *  (no dev-server style access to the rest of the project), and unknown paths fall back to
 *  index.html for the single-page app. */
export function staticHandler(root: string) {
  const base = resolve(root);
  const index = join(base, "index.html");
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    const file = resolve(base, "." + normalize(path));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; } // no escaping dist/
    const target = existsSync(file) && statSync(file).isFile() ? file : index;
    res.writeHead(200, {
      "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
      // Vite fingerprints assets, so they can be cached for good; the page itself must stay fresh.
      "Cache-Control": target.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(target).pipe(res);
  };
}
