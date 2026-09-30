import { test, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staticHandler } from "../static.js";

let server: Server, url = "", root = "";
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "fcdn-static-"));
  root = join(dir, "dist");
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html>app");
  writeFileSync(join(root, "assets", "a.js"), "console.log(1)");
  writeFileSync(join(root, "manifest.webmanifest"), "{}");
  writeFileSync(join(dir, "secret.sqlite"), "SECRET"); // next to dist, must never be served
  server = createServer(staticHandler(root));
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as any).port}`;
});
afterAll(() => server.close());

test("serves built files with the right type and caching", async () => {
  const js = await fetch(`${url}/assets/a.js`);
  expect(js.headers.get("content-type")).toMatch(/javascript/);
  expect(js.headers.get("cache-control")).toMatch(/immutable/);
  expect((await fetch(`${url}/`)).headers.get("cache-control")).toBe("no-cache");
});

test("the install manifest is served as a web app manifest, so phones offer Add to Home Screen", async () => {
  const res = await fetch(`${url}/manifest.webmanifest`);
  expect(res.headers.get("content-type")).toBe("application/manifest+json");
  expect(res.headers.get("cache-control")).toBe("no-cache"); // not fingerprinted, so never cached for good
});

test("unknown paths fall back to the app page (single-page app)", async () => {
  expect(await (await fetch(`${url}/room/ABC123`)).text()).toBe("<!doctype html>app");
});

test("nothing outside the build folder is reachable, however the path is written", async () => {
  for (const p of ["/../secret.sqlite", "/%2e%2e/secret.sqlite", "/assets/../../secret.sqlite", "/..%2fsecret.sqlite"]) {
    const res = await fetch(url + p);
    expect(await res.text()).not.toContain("SECRET");
  }
});
