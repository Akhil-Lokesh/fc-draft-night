# FC Draft Night — Plan 6: Deploy + E2E Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Prerequisite:** Plans 1–5 complete. `pnpm -r test` green.

**Goal:** Ship the app to a public URL — server on Fly.io (persistent process + volume for SQLite), web on Vercel — wire the client to the production socket URL, add CI, polish phone-browser layout, and prove it with a multi-client Playwright smoke test against the built app.

**Architecture:** Server is a long-lived process (Socket.IO needs sticky, stateful connections — not serverless), so Fly.io/Render with a mounted volume for `fcdn.sqlite`. Web is a static Vite build on Vercel with `VITE_SOCKET_URL` pointing at the server. CORS restricted to the Vercel origin.

**Tech Stack:** Fly.io (or Render) · Vercel · GitHub Actions · Playwright.

**Spec:** §hosting decision (deployed public URL).

---

## File structure

```
packages/server/Dockerfile
packages/server/fly.toml
packages/web/vercel.json          # or Vercel project settings
.github/workflows/ci.yml
e2e/                              # Playwright
  playwright.config.ts
  draft.smoke.spec.ts
```

---

## Task 1: Production config — env-driven URLs + CORS

**Files:** Modify `packages/server/src/server.ts`, `packages/web/src/state/socket.ts`; Create `packages/web/.env.example`

- [ ] **Step 1:** Confirm the server reads `PORT`, `DB_PATH`, `WEB_ORIGIN` from env (added in Plan 2 Task 7). If `WEB_ORIGIN` unset in prod, fail fast rather than defaulting to `*`:
```ts
const origin = process.env.WEB_ORIGIN;
if (process.env.NODE_ENV === "production" && !origin) throw new Error("WEB_ORIGIN required in production");
const io = new Server(http, { cors: { origin: origin ?? "*" } });
```
- [ ] **Step 2:** In `web/src/state/socket.ts`, `connect()` reads `import.meta.env.VITE_SOCKET_URL` (fallback `http://localhost:8080` for dev). Add `packages/web/.env.example` with `VITE_SOCKET_URL=`.
- [ ] **Step 3:** Manual: `WEB_ORIGIN=http://localhost:5173 pnpm -C packages/server dev` + `pnpm -C packages/web dev`; confirm a cross-origin socket connects and a bid round-trips.
- [ ] **Step 4:** `git commit -am "chore(deploy): env-driven socket URL + strict prod CORS"`

---

## Task 2: Server Dockerfile + Fly config

**Files:** Create `packages/server/Dockerfile`, `packages/server/fly.toml`, `packages/server/.dockerignore`

- [ ] **Step 1: Dockerfile** (multi-stage; builds shared + server, runs the compiled entry)
```dockerfile
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN pnpm -C packages/shared build && pnpm -C packages/server build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app .
EXPOSE 8080
CMD ["node", "packages/server/dist/server.js"]
```
> Note: `better-sqlite3` is a native module — `node:slim` includes what's needed for the prebuilt binary; if the build fails, switch the runtime stage to `node:22` (non-slim) or add `python3 make g++` to the build stage.
- [ ] **Step 2: fly.toml** — app name, `[mounts]` a volume at `/data`, `DB_PATH=/data/fcdn.sqlite`, internal port 8080, `WEB_ORIGIN` set to the Vercel URL. Single instance (state is in-process; do not scale >1 without externalizing state).
```toml
app = "fc-draft-night"
[env]
  PORT = "8080"
  DB_PATH = "/data/fcdn.sqlite"
[[mounts]]
  source = "fcdn_data"
  destination = "/data"
[http_service]
  internal_port = 8080
  force_https = true
  min_machines_running = 1
```
- [ ] **Step 3:** `fly launch --no-deploy` then `fly volumes create fcdn_data --size 1`; set `fly secrets set WEB_ORIGIN=https://<vercel-domain>`. `fly deploy`.
- [ ] **Step 4:** Verify the deployed health: open `https://fc-draft-night.fly.dev` socket handshake with a quick `wscat`/browser check.
- [ ] **Step 5:** `git commit -am "chore(deploy): server Dockerfile + Fly config with SQLite volume"`

---

## Task 3: Web deploy to Vercel

**Files:** Create `packages/web/vercel.json` (or configure project); set env in Vercel dashboard

- [ ] **Step 1:** Vercel project: root `packages/web`, build `pnpm -w install && pnpm -C packages/web build` (or set the workspace build), output `dist`. Add env `VITE_SOCKET_URL=https://fc-draft-night.fly.dev`.
- [ ] **Step 2:** `vercel --prod` (or push to main with the Vercel GitHub integration).
- [ ] **Step 3:** Update Fly `WEB_ORIGIN` secret to the final Vercel domain; redeploy server.
- [ ] **Step 4:** Manual: open the Vercel URL on two phones, join distinct clubs, start, bid — confirm sync.
- [ ] **Step 5:** `git commit -am "chore(deploy): Vercel web config + prod socket URL"`

---

## Task 4: CI

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1:** Workflow: on push/PR — checkout, setup pnpm + node 22, `pnpm install --frozen-lockfile`, `pnpm -r test`, `pnpm -r build`.
```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r test
      - run: pnpm -r build
```
- [ ] **Step 2:** Push, confirm the check goes green on GitHub.
- [ ] **Step 3:** `git commit -am "ci: run tests + build on push/PR"`

---

## Task 5: Playwright multi-client e2e smoke

**Files:** Create `e2e/playwright.config.ts`, `e2e/draft.smoke.spec.ts`, add root devDeps

- [ ] **Step 1: Failing test** `e2e/draft.smoke.spec.ts`
```ts
import { test, expect, chromium } from "@playwright/test";

const URL = process.env.E2E_URL ?? "http://localhost:5173";

test("five managers join, host starts, a bid propagates to all", async () => {
  const browser = await chromium.launch();
  const ctxs = await Promise.all(Array.from({ length: 5 }, () => browser.newContext()));
  const pages = await Promise.all(ctxs.map(c => c.newPage()));
  const clubs = ["Arsenal", "Bayern", "Real Madrid", "Barcelona", "Manchester City"];

  // host creates on page 0 (adjust selectors to the built UI)
  await pages[0].goto(URL);
  // ... host sets budget 600, creates room, reads the code ...
  const code = await pages[0].getByTestId("room-code").innerText();

  for (let i = 0; i < 5; i++) {
    await pages[i].goto(URL);
    await pages[i].getByLabel(/room code/i).fill(code);
    await pages[i].getByLabel(/name/i).fill(`P${i}`);
    await pages[i].getByRole("button", { name: new RegExp(clubs[i], "i") }).click();
    await pages[i].getByRole("button", { name: /^join$/i }).click();
  }
  await pages[0].getByRole("button", { name: /start draft/i }).click();
  await pages[0].getByText(/Haaland/).click(); // open a listing
  await pages[1].getByRole("button", { name: /raise/i }).first().click();

  // every page sees the new top bid
  for (const p of pages) await expect(p.getByTestId("top-bid-haaland")).toContainText(/1[0-9]{2}|2[0-9]{2}/);
  await browser.close();
});
```
> Add `data-testid` attributes to the relevant components (`room-code`, `top-bid-<playerId>`) during this task — small edits to Plan 3 components.
- [ ] **Step 2:** `pnpm dlx playwright install --with-deps chromium`; run locally against `pnpm -C packages/server dev` + `pnpm -C packages/web dev`. Iterate selectors until green.
- [ ] **Step 3:** Optionally run against prod: `E2E_URL=https://<vercel> pnpm -C e2e test`.
- [ ] **Step 4:** `git commit -am "test(e2e): playwright five-client draft smoke"`

---

## Task 6: Phone-browser polish

**Files:** Modify web styles/components as needed; Create `src/__tests__/responsive.notes.md` (manual checklist)

- [ ] **Step 1:** Test on real phone widths (360–430px): Draft Board contests grid collapses to one column; budget bars and pool list stay reachable one-thumb; countdowns legible; challenge alert is prominent (sticky top). Fix layout issues found.
- [ ] **Step 2:** Confirm reconnection: background a phone tab mid-draft, reopen — the stored `managerId` rejoins the same slot and the current state repaints.
- [ ] **Step 3:** `git commit -am "polish(web): phone-width layout + reconnection pass"`

---

## Self-review

- **Deployed public URL** → Tasks 2 (server/Fly), 3 (web/Vercel). ✅
- **Persistent SQLite across restarts** → Task 2 volume + `DB_PATH`. ✅
- **Single-instance constraint documented** (in-process state) → Task 2 note. ✅
- **CORS locked to web origin** → Task 1. ✅
- **CI** → Task 4. ✅
- **Multi-client e2e proof** → Task 5. ✅
- **Phone polish + reconnection** → Task 6. ✅
- **Consistency:** `VITE_SOCKET_URL`, `WEB_ORIGIN`, `DB_PATH`, `PORT` env names match server code (Plan 2 Task 7) and client `connect()` (Plan 3 Task 2).
```
```

---

## Whole-project coverage check (all six plans vs spec)

| Spec area | Plan · Task |
| --- | --- |
| FC26 data (catalog + squads, ingest) | data ready · P1 T2 (loader), P2 T9 (catalog) |
| Host pool curation (search + setPool) | P2 T9 · P3 T9 (Pool Builder) |
| Budget reserve/spendable/floor/cost | P1 T2–4 |
| Listing 2-min window | P1 T5 |
| Bidding war, min-bid, 2-quote cap, anti-snipe | P1 T6–7 |
| Ordered closes, overcommit void + 25M fine, negative unwind | P1 T8–9 |
| Cash-in on loss | P1 T8 |
| Challenge limit (3/rival) | P1 T10, engine T13 |
| Player lock | P1 T11 |
| Season carryover/handoff logic | P1 T12 |
| All §5 fixtures | P1 T8,10,12,13 |
| Authoritative server + serialized queue + timers | P2 T3,6 |
| Persistence + crash recovery | P2 T4,7,8 |
| Join/reconnect + intents + broadcast | P2 T7 |
| Join / Setup / Draft Board screens | P3 T3,4,8 |
| Pool, budget bars, challenge tracker, draft log, countdown, alert | P3 T5–8 |
| Squad+formation, challenge history, recap, analytics | P4 T2–5 |
| Season export/import UI + wiring | P5 T1–4 |
| Deploy, CI, e2e, phone polish | P6 T1–6 |
| Deferred: spectator view, leaderboard, export checklist | out of scope (roadmap) |
```
