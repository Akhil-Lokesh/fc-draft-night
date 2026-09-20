# FC Draft Night — Plan 1: Foundation + Rules Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the monorepo, build and validate the seed dataset, and implement the entire pure auction rules engine test-first, proven against every worked example in the pitch.

**Architecture:** All game rules live in `packages/shared/src/domain` as a pure, I/O-free reducer `applyCommand(state, command) → { state, events }`. No sockets, DB, or timers here — a `now` timestamp is passed in on every `Tick`. This makes the whole ruleset deterministic and exhaustively unit-testable. The server (Plan 2) later wraps this reducer with a serialized queue, real timers, and SQLite.

**Tech Stack:** TypeScript · pnpm workspaces · Vitest. No runtime deps in `shared`.

**Spec:** `docs/superpowers/specs/2026-09-20-fc-draft-night-design.md` (§4 rules, §5 fixtures).

---

## File structure (created by this plan)

```
packages/shared/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    domain/
      types.ts        # all domain types, commands, events, state factory
      budget.ts       # reserved, spendable, floor, cost-of-acting
      listing.ts      # open listing, uncontested lock-in
      war.ts          # min-bid rule, quote cap, escalation
      close.ts        # anti-snipe + draft-clock close decisions
      resolution.ts   # ordered closes, overcommit void + fine, negative unwind
      challenge.ts    # 3-per-rival challenge limit
      season.ts       # carryover, handoff, position-stepped budgets
      engine.ts       # applyCommand reducer
    data/
      dataset.ts      # seed loader + validation
      seed/squads.json    # 5 clubs' FC26 rosters (generated)
    __tests__/        # one spec file per module + fixtures.replay.test.ts
```

**Key type contract (defined in Task 3, referenced everywhere):**
- `cost(player, managerId, amount)` = `player.ownerId === managerId ? amount - player.listedValue : amount`
- Challenge key = `` `${challengerId}->${rivalId}` ``
- All timestamps are integer ms; the engine never reads a wall clock — `Tick.now` is supplied.

**Test fixtures vs real data (IMPORTANT):** the rules-engine tests (Tasks 6–13) reproduce the pitch's illustrative scenarios (Haaland *as a pool player* at 180, round 200M values, friendly ids like `mbappe`/`haaland`/`wirtz`). These are **not** the real FC 26 data (where Haaland is City-owned and ids are numeric FC `player_id`s). Author a controlled fixture roster once — `packages/shared/src/__tests__/fixtures/roster.ts` exporting `fixtureSeed(): SeedPlayer[]` with the pitch's players/values — and have those tests build rooms from `fixtureSeed()` instead of `loadSeed()`. Keep the pitch scenarios stable regardless of dataset refreshes. Only Task 2's `dataset.test.ts` exercises the real `squads.json` (counts + floor). Where tasks below `import { loadSeed }` for a scripted scenario, read it as `fixtureSeed` from that fixtures module. **Exact fixture roster content is specified in Task 5, Step 0 — author it there once; every later task imports it.**

**Listing vs. challenge (design correction — read before Tasks 5, 6, 13):** the plan text below originally let `openListing` handle *both* "claim a pool player" and "challenge a rival's currently-owned player" under one `isOwner` check. That's wrong: a challenge on a rival's owned player (e.g. the Mbappé worked example) must **never** pass through the 2-minute uncontested-lock path — if nobody responds it should close via the normal war rules (5-minute anti-snipe, top bid wins at the challenger's actual bid), not silently transfer at listed value after 2 minutes. The corrected model, used from Task 6 onward:
- `openListing` (Task 5) is **only** for (a) claiming a pool player (`ownerId === null`) or (b) releasing your own player (`ownerId === managerId`). It seeds `quotes` with the lister's marker at listed value but does **not** increment `quoteCounts` for the lister (their listing doesn't spend a cap slot — this is what makes the Haaland fixture's "opener + one raise = 2 quotes total" work).
- `openChallenge` (**new function**, added in Task 6) is for challenging a player owned by someone else. It creates the contest directly in `"war"` status (no listing/2-min phase at all), and the challenger's bid **does** count as their quote #1 (matches the Mbappé/Barcelona 3-challenge fixtures, where the opening challenge is explicitly "quote 1").
- The engine (Task 13) routes on ownership: pool/own-release → `OpenListing` command → `openListing`; rival-owned → a new `Challenge` command (`{managerId, playerId, amount, now}`, amount required since there's no default) → `openChallenge`.

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Test: `packages/shared/src/__tests__/smoke.test.ts`

- [ ] **Step 1: Create workspace root**

`package.json`:
```json
{
  "name": "fc-draft-night",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": { "test": "pnpm -r test", "build": "pnpm -r build" }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 2: Create the shared package**

`packages/shared/package.json`:
```json
{
  "name": "@fcdn/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true, environment: "node" } });
```

- [ ] **Step 3: Write the smoke test**

`packages/shared/src/__tests__/smoke.test.ts`:
```ts
import { test, expect } from "vitest";
test("workspace runs vitest", () => { expect(1 + 1).toBe(2); });
```

- [ ] **Step 4: Install and run**

Run: `pnpm install && pnpm -C packages/shared test`
Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold pnpm monorepo with shared package + vitest"
```

---

## Task 2: FC 26 data — loader + validation

**Data model:** the app is driven by the **EA FC 26** database (18,405 players). Two artifacts, both already generated by `scripts/ingest-fc26.mjs` (provenance: `packages/server/src/data/fc26-data.sources.md`):
- `packages/server/src/data/fc26-catalog.json` — every player (host's pool-pick universe; loaded server-side in Plan 2).
- `packages/shared/src/data/seed/squads.json` — the 5 clubs' real FC 26 rosters (134 players); this is what `shared` loads.

**Files:**
- Present (generated): `packages/shared/src/data/seed/squads.json`
- Create: `packages/shared/src/data/dataset.ts`
- Test: `packages/shared/src/__tests__/dataset.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/__tests__/dataset.test.ts`:
```ts
import { test, expect } from "vitest";
import { loadSeed, validateSeed, budgetFloor } from "../data/dataset.js";

test("seed has exactly five clubs with real starting squads", () => {
  const seed = loadSeed();
  const clubs = new Set(seed.filter(p => p.clubId).map(p => p.clubId));
  expect(clubs).toEqual(new Set(["arsenal", "bayern", "real", "barca", "city"]));
});

test("seed validates: unique ids, valid positions, no national-team dupes", () => {
  expect(() => validateSeed(loadSeed())).not.toThrow();
});

test("budget floor is priciest squad rounded up to next 100M", () => {
  const seed = loadSeed();
  // whatever the priciest squad is, floor must be a multiple of 100 and >= it
  const floor = budgetFloor(seed);
  expect(floor % 100).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/shared test dataset`
Expected: FAIL — `loadSeed` not found.

- [ ] **Step 3: Data (already generated — verify, don't rebuild)**

`packages/shared/src/data/seed/squads.json` **already exists** — the 5 clubs' real FC 26 rosters (134 players; Real 30, Barça 28, Bayern 26, City 26, Arsenal 24). Generated 2026-09-20 by `scripts/ingest-fc26.mjs` from the FC 26 CSV. Derived: squad values €911M–€1424M, **budget floor €1500M**, priciest pool €150.5M (Wirtz). Confirm the file is present and matches the shape below; Steps 1/5 validate it. (If missing: re-download the CSV per `fc26-data.sources.md` and re-run the ingest script.) Shape per entry:
```json
[
  { "id": "231747", "name": "K. Mbappé",     "position": "FWD", "value": 173.5, "overall": 91, "club": "Real Madrid",       "clubId": "real" },
  { "id": "252371", "name": "J. Bellingham", "position": "MID", "value": 174.5, "overall": 90, "club": "Real Madrid",       "clubId": "real" },
  { "id": "231443", "name": "E. Haaland",    "position": "FWD", "value": 157.0, "overall": 90, "club": "Manchester City",   "clubId": "city" }
]
```
(`id` = FC `player_id`; `value` is €M; `clubId` ∈ real/barca/bayern/arsenal/city. The full 18k-player `fc26-catalog.json` uses the same shape with `clubId: null` for non-club players — it is loaded by the **server** in Plan 2, not by `shared`.)

- [ ] **Step 4: Implement the loader + validators**

`packages/shared/src/data/dataset.ts`:
```ts
import squads from "./seed/squads.json" assert { type: "json" };

export type Position = "GK" | "DEF" | "MID" | "FWD";
export type ClubId = "arsenal" | "bayern" | "real" | "barca" | "city";
export interface SeedPlayer {
  id: string; name: string; position: Position; value: number;
  overall: number; club: string; clubId: ClubId | null;
}

/** The five clubs' starting squads (what `shared` needs). */
export function loadSeed(): SeedPlayer[] { return squads as SeedPlayer[]; }

export function validateSeed(players: SeedPlayer[]): void {
  const ids = new Set<string>();
  const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
  for (const p of players) {
    if (ids.has(p.id)) throw new Error(`duplicate id: ${p.id}`);
    ids.add(p.id);
    if (!positions.includes(p.position)) throw new Error(`bad position: ${p.id}`);
    if (!(p.value >= 0)) throw new Error(`bad value: ${p.id}`); // FC youth can be 0; only reject NaN/negative
  }
}

export function squadValue(players: SeedPlayer[], clubId: string): number {
  return players.filter(p => p.clubId === clubId).reduce((s, p) => s + p.value, 0);
}

export function budgetFloor(players: SeedPlayer[]): number {
  const clubs = ["arsenal", "bayern", "real", "barca", "city"];
  const priciest = Math.max(...clubs.map(c => squadValue(players, c)));
  return Math.ceil(priciest / 100) * 100; // round up to next clean 100M
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm -C packages/shared test dataset`
Expected: PASS (all three).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(data): FC26 loader (squads.json) + validation + budget floor"
```

---

## Task 3: Domain types + initial-state factory

**Files:**
- Create: `packages/shared/src/domain/types.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/state.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/__tests__/state.test.ts`:
```ts
import { test, expect } from "vitest";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

test("adding a manager reserves their club's squad value and sets spendable", () => {
  let s = createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "m_real", displayName: "Ana", clubId: "real" });
  const real = s.managers["m_real"];
  // Real's reserved = sum of real players' listed values; spendable = 600 - reserved
  expect(real.reserved).toBeGreaterThan(0);
  expect(real.spendable).toBe(600 - real.reserved);
  // every real seed player is now owned by this manager, at listed value = seed value
  const owned = Object.values(s.players).filter(p => p.ownerId === "m_real");
  expect(owned.length).toBeGreaterThan(0);
  expect(owned.every(p => p.listedValue === p.originalValue)).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/shared test state`
Expected: FAIL — `createRoom` not found.

- [ ] **Step 3: Implement the types + factory**

`packages/shared/src/domain/types.ts`:
```ts
import type { Position, SeedPlayer } from "../data/dataset.js";
export type { Position };

export interface Player {
  id: string; name: string; position: Position;
  listedValue: number;      // current value; rises on transfer / successful defense
  originalValue: number;    // dataset value; target when released
  ownerId: string | null;   // null = pool
  lockedThisSeason: boolean;
}

export interface Manager {
  id: string; displayName: string; clubId: string;
  reserved: number; spendable: number;
}

export type ContestType = "pool-listing" | "release-listing" | "war";
export type ContestStatus = "listing" | "war" | "closed" | "voided";

export interface Quote { managerId: string; amount: number; at: number; }

export interface Contest {
  id: string; playerId: string; type: ContestType; status: ContestStatus;
  listerId: string | null;                 // opener of a listing
  quotes: Quote[];                         // history; last is current top
  quoteCounts: Record<string, number>;     // per-manager quotes used (cap 2)
  closesAt: number;                        // ms
}

export type LogEntry =
  | { t: "listing"; at: number; managerId: string; playerId: string; price: number; kind: ContestType }
  | { t: "bid"; at: number; contestId: string; managerId: string; amount: number }
  | { t: "win"; at: number; contestId: string; managerId: string; playerId: string; price: number }
  | { t: "release"; at: number; managerId: string; playerId: string; toValue: number }
  | { t: "void"; at: number; contestId: string; managerId: string; reason: string }
  | { t: "fine"; at: number; managerId: string; amount: number };

export interface RoomState {
  code: string; totalBudget: number;
  quoteTimerMs: number; draftClockMs: number;
  squadSizeCap: number | null;
  seasonNumber: number;
  status: "setup" | "live" | "closed";
  startedAt: number | null;
  managers: Record<string, Manager>;
  players: Record<string, Player>;
  contests: Record<string, Contest>;
  challenges: Record<string, number>;      // `${challenger}->${rival}` -> count
  log: LogEntry[];
  seq: number;                             // monotonic id source (no wall clock)
}

export const OVERCOMMIT_FINE = 25;
export const LISTING_MS = 120_000;         // 2-minute listing window

export function createRoom(opts: {
  code: string; totalBudget: number; seed: SeedPlayer[];
  quoteTimerMs?: number; squadSizeCap?: number | null;
}): RoomState {
  const players: Record<string, Player> = {};
  for (const p of opts.seed) {
    players[p.id] = {
      id: p.id, name: p.name, position: p.position,
      listedValue: p.value, originalValue: p.value,
      ownerId: null, lockedThisSeason: false,
    };
  }
  return {
    code: opts.code, totalBudget: opts.totalBudget,
    quoteTimerMs: opts.quoteTimerMs ?? 300_000, draftClockMs: 3_600_000,
    squadSizeCap: opts.squadSizeCap ?? null,
    seasonNumber: 1, status: "setup", startedAt: null,
    managers: {}, players, contests: {}, challenges: {}, log: [], seq: 0,
  };
}

export function addManager(s: RoomState, m: { id: string; displayName: string; clubId: string }): RoomState {
  const players = { ...s.players };
  let reserved = 0;
  for (const p of Object.values(players)) {
    // A manager's real starting squad = seed players whose original clubId matches.
    // Ownership is stamped by matching the seed clubId, tracked via a parallel map below.
  }
  // Reserve by seed clubId: recompute ownership from seed metadata carried on the Player.
  // (Players created in createRoom lose clubId; carry it instead on a lookup — see note.)
  const seedClub = (id: string) => (s as any).__seedClub?.[id] as string | undefined;
  for (const p of Object.values(players)) {
    if (seedClub(p.id) === m.clubId) {
      players[p.id] = { ...p, ownerId: m.id };
      reserved += p.listedValue;
    }
  }
  const manager: Manager = { ...m, reserved, spendable: s.totalBudget - reserved };
  return { ...s, players, managers: { ...s.managers, [m.id]: manager } };
}
```

> **Implementation note for the engineer:** `createRoom` must retain each seed player's `clubId` so `addManager` can stamp ownership. Store it on `RoomState.__seedClub: Record<string,string|null>` (a private lookup) populated in `createRoom`, OR add an optional `homeClub` field to `Player`. Pick the field approach (cleaner): add `homeClub: string | null` to `Player`, set it from the seed in `createRoom`, and in `addManager` match on `players[id].homeClub === m.clubId`. Update the test only if the property name surfaces.

- [ ] **Step 4: Create the barrel export**

`packages/shared/src/index.ts`:
```ts
export * from "./domain/types.js";
export * from "./data/dataset.js";
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm -C packages/shared test state`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(domain): room state, player/manager/contest types, addManager reserves squad"
```

---

## Task 4: Cost-of-acting + affordability

**Files:**
- Create: `packages/shared/src/domain/budget.ts`
- Test: `packages/shared/src/__tests__/budget.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { cost, canAfford } from "../domain/budget.js";
import type { Player, Manager } from "../domain/types.js";

const player = (over: Partial<Player>): Player => ({
  id: "x", name: "X", position: "FWD", listedValue: 200, originalValue: 200,
  ownerId: null, lockedThisSeason: false, ...over,
});
const mgr = (over: Partial<Manager>): Manager =>
  ({ id: "m", displayName: "M", clubId: "real", reserved: 0, spendable: 250, ...over });

test("acquiring a player not owned costs the full amount", () => {
  expect(cost(player({ ownerId: null }), "m", 220)).toBe(220);
});

test("defending an owned player costs only the increment above listed value", () => {
  expect(cost(player({ ownerId: "m", listedValue: 200 }), "m", 230)).toBe(30);
});

test("canAfford blocks a quote whose cost exceeds spendable", () => {
  const p = player({ ownerId: null, listedValue: 200 });
  expect(canAfford(mgr({ spendable: 210 }), p, 220)).toBe(false); // cost 220 > 210
  expect(canAfford(mgr({ spendable: 250 }), p, 220)).toBe(true);
});
```

- [ ] **Step 2: Run — FAIL** (`cost` not found). `pnpm -C packages/shared test budget`

- [ ] **Step 3: Implement**

`packages/shared/src/domain/budget.ts`:
```ts
import type { Player, Manager } from "./types.js";

export function cost(player: Player, managerId: string, amount: number): number {
  return player.ownerId === managerId ? amount - player.listedValue : amount;
}

export function canAfford(m: Manager, player: Player, amount: number): boolean {
  return cost(player, m.id, amount) <= m.spendable;
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit** — `git commit -am "feat(budget): cost-of-acting + affordability guard"`

---

## Task 5: Open listing + uncontested lock-in

**Files:**
- Create: `packages/shared/src/__tests__/fixtures/roster.ts` (the fixture roster used by Tasks 5–13)
- Create: `packages/shared/src/domain/listing.ts`
- Test: `packages/shared/src/__tests__/listing.test.ts`

- [ ] **Step 0: Author the fixture roster (once — reused by every remaining task)**

`packages/shared/src/__tests__/fixtures/roster.ts`:
```ts
import type { SeedPlayer } from "../../data/dataset.js";

/** A small controlled roster matching the pitch's worked examples. NOT the real FC26 data. */
export function fixtureSeed(): SeedPlayer[] {
  return [
    // Real Madrid
    { id: "mbappe", name: "Kylian Mbappé", position: "FWD", value: 200, overall: 91, club: "Real Madrid", clubId: "real" },
    { id: "vini", name: "Vinícius Jr", position: "FWD", value: 180, overall: 89, club: "Real Madrid", clubId: "real" },
    { id: "bellingham", name: "Jude Bellingham", position: "MID", value: 170, overall: 90, club: "Real Madrid", clubId: "real" },
    { id: "courtois", name: "Thibaut Courtois", position: "GK", value: 20, overall: 87, club: "Real Madrid", clubId: "real" },
    { id: "real_filler", name: "Real Filler", position: "DEF", value: 10, overall: 75, club: "Real Madrid", clubId: "real" },
    // Barcelona
    { id: "pedri", name: "Pedri", position: "MID", value: 60, overall: 88, club: "Barcelona", clubId: "barca" },
    { id: "terstegen", name: "Marc-André ter Stegen", position: "GK", value: 15, overall: 85, club: "Barcelona", clubId: "barca" },
    { id: "barca_filler", name: "Barca Filler", position: "DEF", value: 15, overall: 75, club: "Barcelona", clubId: "barca" },
    // Bayern
    { id: "kane", name: "Harry Kane", position: "FWD", value: 100, overall: 90, club: "Bayern Munich", clubId: "bayern" },
    { id: "musiala", name: "Jamal Musiala", position: "MID", value: 70, overall: 88, club: "Bayern Munich", clubId: "bayern" },
    { id: "neuer", name: "Manuel Neuer", position: "GK", value: 10, overall: 84, club: "Bayern Munich", clubId: "bayern" },
    // Arsenal
    { id: "saka", name: "Bukayo Saka", position: "FWD", value: 90, overall: 88, club: "Arsenal", clubId: "arsenal" },
    { id: "odegaard", name: "Martin Ødegaard", position: "MID", value: 70, overall: 87, club: "Arsenal", clubId: "arsenal" },
    { id: "saliba", name: "William Saliba", position: "DEF", value: 60, overall: 86, club: "Arsenal", clubId: "arsenal" },
    // Manchester City
    { id: "debruyne", name: "Kevin De Bruyne", position: "MID", value: 60, overall: 87, club: "Manchester City", clubId: "city" },
    { id: "ederson", name: "Ederson", position: "GK", value: 10, overall: 84, club: "Manchester City", clubId: "city" },
    { id: "walker", name: "Kyle Walker", position: "DEF", value: 10, overall: 82, club: "Manchester City", clubId: "city" },
    // Pool (unowned)
    { id: "haaland", name: "Erling Haaland", position: "FWD", value: 180, overall: 90, club: "Borussia Dortmund", clubId: null },
    { id: "wirtz", name: "Florian Wirtz", position: "MID", value: 60, overall: 86, club: "Bayer Leverkusen", clubId: null },
  ];
}
```
Run `pnpm -C packages/shared test` afterward is not needed yet (no test imports it until Step 1 below) — just create the file. No commit yet; it gets committed together with Task 5's other files in Step 5.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { openListing, resolveListing } from "../domain/listing.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function room() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "ars", displayName: "A", clubId: "arsenal" });
  return { ...s, status: "live" as const, startedAt: 0 };
}

test("opening a pool listing creates a listing contest closing in 2 minutes", () => {
  const s = room();
  const { state, contestId } = openListing(s, { managerId: "ars", playerId: "wirtz", now: 1000 });
  const c = state.contests[contestId];
  expect(c.type).toBe("pool-listing");
  expect(c.status).toBe("listing");
  expect(c.closesAt).toBe(1000 + 120_000);
  expect(c.quotes.at(-1)!.amount).toBe(state.players["wirtz"].listedValue); // opens at listed price
});

test("uncontested pool listing locks the player onto the lister at listed price", () => {
  let s = room();
  const spend0 = s.managers["ars"].spendable;
  const price = s.players["wirtz"].listedValue;
  const opened = openListing(s, { managerId: "ars", playerId: "wirtz", now: 1000 });
  const done = resolveListing(opened.state, { contestId: opened.contestId, now: 1000 + 120_000 });
  expect(done.players["wirtz"].ownerId).toBe("ars");
  expect(done.managers["ars"].spendable).toBe(spend0 - price);
  expect(done.contests[opened.contestId].status).toBe("closed");
});
```

- [ ] **Step 2: Run — FAIL.** `pnpm -C packages/shared test listing`

- [ ] **Step 3: Implement**

`packages/shared/src/domain/listing.ts`:
```ts
import type { RoomState, Contest } from "./types.js";
import { LISTING_MS } from "./types.js";

export function openListing(
  s: RoomState, a: { managerId: string; playerId: string; now: number },
): { state: RoomState; contestId: string } {
  const player = s.players[a.playerId];
  const isOwner = player.ownerId === a.managerId;
  const type = isOwner ? "release-listing" : "pool-listing";
  const price = player.listedValue;
  const id = `c${s.seq + 1}`;
  const contest: Contest = {
    id, playerId: a.playerId, type, status: "listing",
    listerId: a.managerId,
    quotes: [{ managerId: a.managerId, amount: price, at: a.now }],
    quoteCounts: {}, // the listing itself does NOT spend the lister's quote cap — see the note at the top of this plan
    closesAt: a.now + LISTING_MS,
  };
  return {
    state: {
      ...s, seq: s.seq + 1,
      contests: { ...s.contests, [id]: contest },
      log: [...s.log, { t: "listing", at: a.now, managerId: a.managerId, playerId: a.playerId, price, kind: type }],
    },
    contestId: id,
  };
}

export function resolveListing(s: RoomState, a: { contestId: string; now: number }): RoomState {
  const c = s.contests[a.contestId];
  if (c.status !== "listing") return s;
  const player = s.players[c.playerId];
  const managers = { ...s.managers };
  const players = { ...s.players };
  const log = [...s.log];
  if (c.type === "pool-listing") {
    const m = managers[c.listerId!];
    managers[c.listerId!] = { ...m, spendable: m.spendable - player.listedValue };
    players[c.playerId] = { ...player, ownerId: c.listerId!, lockedThisSeason: true };
    log.push({ t: "win", at: a.now, contestId: c.id, managerId: c.listerId!, playerId: c.playerId, price: player.listedValue });
  } else { // release-listing: player goes to pool at his listed value, owner reclaims reserved
    const owner = managers[player.ownerId!];
    managers[player.ownerId!] = { ...owner, reserved: owner.reserved - player.listedValue, spendable: owner.spendable + player.listedValue };
    players[c.playerId] = { ...player, ownerId: null };
    log.push({ t: "release", at: a.now, managerId: player.ownerId!, playerId: c.playerId, toValue: player.listedValue });
  }
  return { ...s, managers, players, contests: { ...s.contests, [c.id]: { ...c, status: "closed" } }, log };
}
```

- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(listing): 2-min listing window, uncontested lock-in for pool + release"`

---

## Task 6: War — min-bid rule, quote cap, listing escalation, direct challenges

**Files:**
- Create: `packages/shared/src/domain/war.ts`
- Test: `packages/shared/src/__tests__/war.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { placeBid, openChallenge, BidError } from "../domain/war.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function liveRoom() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed(), quoteTimerMs: 300_000 });
  for (const [id, clubId] of [["ars","arsenal"],["bay","bayern"],["real","real"],["bar","barca"],["city","city"]] as const)
    s = addManager(s, { id, displayName: id, clubId });
  return { ...s, status: "live" as const, startedAt: 0 };
}

test("a challenge must strictly exceed the player's current listed value", () => {
  const s = liveRoom();
  // bar challenges real's mbappe directly (mbappe is owned by real, not a pool player)
  expect(() => openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 200, now: 0 }))
    .toThrow(BidError); // 200 == listed value, not strictly greater
});

test("a challenge on a rival's owned player opens directly as a war (no listing phase)", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 });
  const c = state.contests[contestId];
  expect(c.status).toBe("war");
  expect(c.quotes).toEqual([{ managerId: "bar", amount: 210, at: 0 }]);
  expect(c.quoteCounts).toEqual({ bar: 1 }); // the opening challenge DOES spend the challenger's quote cap
});

test("defending the challenge resets the anti-snipe timer", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 });
  const r = placeBid(state, { contestId, managerId: "real", amount: 230, now: 20 });
  const c = r.contests[contestId];
  expect(c.closesAt).toBe(20 + 300_000); // anti-snipe reset off the new quote
  expect(c.quotes.at(-1)).toMatchObject({ managerId: "real", amount: 230 });
});

test("each manager gets at most two quotes in one contest", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 }); // bar quote #1
  let st = placeBid(state, { contestId, managerId: "real", amount: 230, now: 20 }); // real quote #1
  st = placeBid(st, { contestId, managerId: "bar", amount: 240, now: 30 }); // bar quote #2
  expect(() => placeBid(st, { contestId, managerId: "bar", amount: 260, now: 40 }))
    .toThrow(/quote cap/i); // bar already used 2
});
```

- [ ] **Step 2: Run — FAIL.** `pnpm -C packages/shared test war`

- [ ] **Step 3: Implement**

`packages/shared/src/domain/war.ts`:
```ts
import type { RoomState, Contest } from "./types.js";
import { canAfford } from "./budget.js";

export class BidError extends Error {}

/** Challenge a player currently owned by someone else. Opens directly as a live war — no 2-minute listing phase. */
export function openChallenge(
  s: RoomState, a: { managerId: string; playerId: string; amount: number; now: number },
): { state: RoomState; contestId: string } {
  const player = s.players[a.playerId];
  const manager = s.managers[a.managerId];
  if (player.lockedThisSeason) throw new BidError("player locked this season");
  if (a.amount <= player.listedValue) throw new BidError("bid must exceed current listed value");
  if (!canAfford(manager, player, a.amount)) throw new BidError("cannot afford");
  const id = `c${s.seq + 1}`;
  const contest: Contest = {
    id, playerId: a.playerId, type: "war", status: "war",
    listerId: null,
    quotes: [{ managerId: a.managerId, amount: a.amount, at: a.now }],
    quoteCounts: { [a.managerId]: 1 }, // the opening challenge DOES spend a quote (unlike a pool/release listing)
    closesAt: a.now + s.quoteTimerMs,
  };
  return {
    state: {
      ...s, seq: s.seq + 1,
      contests: { ...s.contests, [id]: contest },
      log: [...s.log, { t: "bid", at: a.now, contestId: id, managerId: a.managerId, amount: a.amount }],
    },
    contestId: id,
  };
}

export function placeBid(
  s: RoomState, a: { contestId: string; managerId: string; amount: number; now: number },
): RoomState {
  const c = s.contests[a.contestId];
  if (!c || c.status === "closed" || c.status === "voided") throw new BidError("contest not open");
  const player = s.players[c.playerId];
  const manager = s.managers[a.managerId];

  const used = c.quoteCounts[a.managerId] ?? 0;
  if (used >= 2) throw new BidError("quote cap reached");
  if (a.amount <= player.listedValue) throw new BidError("bid must exceed current listed value");
  if (!canAfford(manager, player, a.amount)) throw new BidError("cannot afford");
  const top = c.quotes.at(-1);
  if (top && a.amount <= top.amount) throw new BidError("bid must exceed current top bid");

  const next: Contest = {
    ...c,
    status: "war",
    quotes: [...c.quotes, { managerId: a.managerId, amount: a.amount, at: a.now }],
    quoteCounts: { ...c.quoteCounts, [a.managerId]: used + 1 },
    closesAt: a.now + s.quoteTimerMs, // anti-snipe: reset off every new quote
  };
  return {
    ...s,
    contests: { ...s.contests, [c.id]: next },
    log: [...s.log, { t: "bid", at: a.now, contestId: c.id, managerId: a.managerId, amount: a.amount }],
  };
}
```

- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(war): openChallenge for rival-owned players, min-bid rule, 2-quote cap, anti-snipe reset"`

---

## Task 7: Close decisions — anti-snipe silence + draft clock

**Files:**
- Create: `packages/shared/src/domain/close.ts`
- Test: `packages/shared/src/__tests__/close.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { dueContests } from "../domain/close.js";
import type { RoomState, Contest } from "../domain/types.js";

function stateWith(contests: Contest[], draftClockMs = 3_600_000): RoomState {
  return {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs,
    squadSizeCap: null, seasonNumber: 1, status: "live", startedAt: 0,
    managers: {}, players: {},
    contests: Object.fromEntries(contests.map(c => [c.id, c])),
    challenges: {}, log: [], seq: contests.length,
  };
}
const c = (id: string, closesAt: number): Contest =>
  ({ id, playerId: id, type: "war", status: "war", listerId: null, quotes: [], quoteCounts: {}, closesAt });

test("contests whose anti-snipe timer has elapsed are due, in close order", () => {
  const s = stateWith([c("a", 500), c("b", 200), c("c", 900)]);
  expect(dueContests(s, 600).map(x => x.id)).toEqual(["b", "a"]); // sorted by closesAt asc
});

test("when the 1-hour draft clock passes, every open contest is due at once", () => {
  const s = stateWith([c("a", 999_999), c("b", 999_999)], 3_600_000);
  expect(dueContests(s, 3_600_001).map(x => x.id).sort()).toEqual(["a", "b"]);
});
```

- [ ] **Step 2: Run — FAIL.** `pnpm -C packages/shared test close`

- [ ] **Step 3: Implement**

`packages/shared/src/domain/close.ts`:
```ts
import type { RoomState, Contest } from "./types.js";

/** Contests that must resolve at `now`, sorted by the order they close. */
export function dueContests(s: RoomState, now: number): Contest[] {
  const draftOver = s.startedAt != null && now >= s.startedAt + s.draftClockMs;
  return Object.values(s.contests)
    .filter(c => c.status === "listing" || c.status === "war")
    .filter(c => draftOver || now >= c.closesAt)
    .sort((a, b) => a.closesAt - b.closesAt || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(close): due-contest selection by close order + draft-clock override"`

---

## Task 8: Resolution — cash-in, ordered closes, overcommit void + fine

**Files:**
- Create: `packages/shared/src/domain/resolution.ts`
- Test: `packages/shared/src/__tests__/resolution.test.ts`

This task implements §4.4 and §4.5 and reproduces the **City double-deal** and **Mbappé** fixtures.

- [ ] **Step 1: Write the failing tests**

```ts
import { test, expect } from "vitest";
import { finalizeContest, resolveDue } from "../domain/resolution.js";
import { createRoom, addManager, OVERCOMMIT_FINE } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function five(totalBudget = 600) {
  let s = createRoom({ code: "AB", totalBudget, seed: fixtureSeed() });
  for (const [id, clubId] of [["ars","arsenal"],["bay","bayern"],["real","real"],["bar","barca"],["city","city"]] as const)
    s = addManager(s, { id, displayName: id, clubId });
  return { ...s, status: "live" as const, startedAt: 0 };
}

test("Mbappé: owner keeps player; a losing owner would release reserved back to spendable", () => {
  // Barcelona wins Mbappé (owned by real) at 250; real releases his 200 reserved back to spendable.
  let s = five();
  const realBefore = s.managers["real"];
  const barBefore = s.managers["bar"];
  const contest = {
    id: "c1", playerId: "mbappe", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [{ managerId: "bar", amount: 250, at: 10 }],
    quoteCounts: { bar: 1 }, closesAt: 10,
  };
  s = { ...s, contests: { c1: contest } };
  const out = finalizeContest(s, "c1", 300_010);
  expect(out.players["mbappe"].ownerId).toBe("bar");
  expect(out.players["mbappe"].listedValue).toBe(250); // transfer price becomes new listed value
  expect(out.managers["bar"].spendable).toBe(barBefore.spendable - 250); // buyer pays full
  expect(out.managers["real"].reserved).toBe(realBefore.reserved - 200); // released reserved
  expect(out.managers["real"].spendable).toBe(realBefore.spendable + 200);
});

test("City double-deal: first close pays; the unaffordable second voids to prev owner + 25M fine", () => {
  let s = five();
  // Give city exactly enough for one deal (Pedri 90) but not both (+ Musiala 80).
  s = { ...s, managers: { ...s.managers, city: { ...s.managers["city"], spendable: 149 } } };
  const pedri = { id: "cP", playerId: "pedri", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [{ managerId: "city", amount: 90, at: 1 }], quoteCounts: { city: 1 }, closesAt: 100 };
  const musiala = { id: "cM", playerId: "musiala", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [{ managerId: "city", amount: 80, at: 2 }], quoteCounts: { city: 1 }, closesAt: 200 };
  s = { ...s, contests: { cP: pedri, cM: musiala } };
  const out = resolveDue(s, 999); // both due; close in order cP then cM
  expect(out.players["pedri"].ownerId).toBe("city");        // first deal honored
  expect(out.managers["city"].spendable).toBe(149 - 90 - OVERCOMMIT_FINE); // 34
  expect(out.players["musiala"].ownerId).toBe("bay");       // reverts to Bayern
  expect(out.contests["cM"].status).toBe("voided");
});
```

- [ ] **Step 2: Run — FAIL.** `pnpm -C packages/shared test resolution`

- [ ] **Step 3: Implement**

`packages/shared/src/domain/resolution.ts`:
```ts
import type { RoomState, Contest, Player, Manager } from "./types.js";
import { OVERCOMMIT_FINE } from "./types.js";
import { cost } from "./budget.js";
import { dueContests } from "./close.js";

/** Highest standing bidder other than `exclude`, for the runner-up path. */
function runnerUp(c: Contest, exclude: string): { managerId: string; amount: number } | null {
  const best = new Map<string, number>();
  for (const q of c.quotes) if (q.managerId !== exclude) best.set(q.managerId, Math.max(best.get(q.managerId) ?? 0, q.amount));
  let top: { managerId: string; amount: number } | null = null;
  for (const [managerId, amount] of best) if (!top || amount > top.amount) top = { managerId, amount };
  return top;
}

function applyWin(s: RoomState, c: Contest, winnerId: string, price: number, now: number): RoomState {
  const player = s.players[c.playerId];
  const managers = { ...s.managers };
  const players = { ...s.players };
  const log = [...s.log];
  const prevOwner = player.ownerId;
  const buyer = managers[winnerId];
  const spent = cost(player, winnerId, price);
  managers[winnerId] = { ...buyer, spendable: buyer.spendable - spent };
  if (prevOwner && prevOwner !== winnerId) {
    const seller = managers[prevOwner];
    managers[prevOwner] = { ...seller, reserved: seller.reserved - player.listedValue, spendable: seller.spendable + player.listedValue };
  }
  // winner now reserves the player at the new (transfer) listed value
  const newValue = price;
  managers[winnerId] = { ...managers[winnerId], reserved: managers[winnerId].reserved + (prevOwner === winnerId ? (newValue - player.listedValue) : newValue) };
  players[c.playerId] = { ...player, ownerId: winnerId, listedValue: newValue, lockedThisSeason: true };
  log.push({ t: "win", at: now, contestId: c.id, managerId: winnerId, playerId: c.playerId, price });
  return { ...s, managers, players, contests: { ...s.contests, [c.id]: { ...c, status: "closed" } }, log };
}

/** Finalize one closed war to its top bid, with the affordability + void/fine unwind. */
export function finalizeContest(s: RoomState, contestId: string, now: number): RoomState {
  const c = s.contests[contestId];
  if (!c || (c.status !== "war" && c.status !== "listing")) return s;
  const top = c.quotes.at(-1);
  if (!top) { // no bids: close untouched
    return { ...s, contests: { ...s.contests, [c.id]: { ...c, status: "closed" } } };
  }
  const winner = s.managers[top.managerId];
  const player = s.players[c.playerId];
  const spent = cost(player, top.managerId, top.amount);
  if (spent <= winner.spendable) return applyWin(s, c, top.managerId, top.amount, now);

  // Cannot afford -> void, fine, cascade to runner-up / prev owner / pool.
  let voided: RoomState = {
    ...s,
    contests: { ...s.contests, [c.id]: { ...c, status: "voided" } },
    managers: { ...s.managers, [top.managerId]: { ...winner, spendable: winner.spendable - OVERCOMMIT_FINE } },
    log: [...s.log,
      { t: "void", at: now, contestId: c.id, managerId: top.managerId, reason: "overcommit" },
      { t: "fine", at: now, managerId: top.managerId, amount: OVERCOMMIT_FINE }],
  };
  const ru = runnerUp(c, top.managerId);
  if (ru && cost(s.players[c.playerId], ru.managerId, ru.amount) <= s.managers[ru.managerId].spendable) {
    return applyWin({ ...voided, contests: { ...voided.contests, [c.id]: { ...c, status: "war" } } }, c, ru.managerId, ru.amount, now);
  }
  // else player stays with prev owner (already true) or pool; nothing to transfer.
  return voided;
}

/** Resolve every due contest in close order. */
export function resolveDue(s: RoomState, now: number): RoomState {
  let state = s;
  for (const c of dueContests(state, now)) state = finalizeContest(state, c.id, now);
  return state;
}
```

> **Note:** the fine-coverage-by-releasing-players path (when spendable goes below the fine) is added in Task 9; `finalizeContest` here leaves spendable possibly below zero only via the fine, which Task 9's `coverDeficit` then repairs. Wire `coverDeficit` into `finalizeContest` in Task 9.

- [ ] **Step 4: Run — PASS** (both fixtures)
- [ ] **Step 5: Commit** — `git commit -am "feat(resolution): cash-in, ordered closes, overcommit void + 25M fine (Mbappe + City fixtures)"`

---

## Task 9: Negative-balance unwind + fine coverage by release

**Files:**
- Modify: `packages/shared/src/domain/resolution.ts`
- Test: `packages/shared/src/__tests__/deficit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { coverDeficit } from "../domain/resolution.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

test("a manager below zero releases their own players (cheapest first) until solvent", () => {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "real", displayName: "R", clubId: "real" });
  // Force a deficit
  s = { ...s, managers: { ...s.managers, real: { ...s.managers["real"], spendable: -30 } } };
  const out = coverDeficit(s, "real", 500);
  expect(out.managers["real"].spendable).toBeGreaterThanOrEqual(0);
  // at least one owned player was released to the pool
  expect(Object.values(out.players).some(p => p.ownerId === null)).toBe(true);
});
```

- [ ] **Step 2: Run — FAIL.** `pnpm -C packages/shared test deficit`

- [ ] **Step 3: Implement + wire into finalizeContest**

Append to `resolution.ts`:
```ts
/** Release the manager's own players (cheapest listed value first) until spendable >= 0. */
export function coverDeficit(s: RoomState, managerId: string, now: number): RoomState {
  let state = s;
  const owned = () => Object.values(state.players)
    .filter(p => p.ownerId === managerId)
    .sort((a, b) => a.listedValue - b.listedValue);
  while (state.managers[managerId].spendable < 0) {
    const p = owned()[0];
    if (!p) break; // nothing left to release
    const m = state.managers[managerId];
    state = {
      ...state,
      managers: { ...state.managers, [managerId]: { ...m, reserved: m.reserved - p.listedValue, spendable: m.spendable + p.listedValue } },
      players: { ...state.players, [p.id]: { ...p, ownerId: null } },
      log: [...state.log, { t: "release", at: now, managerId, playerId: p.id, toValue: p.listedValue }],
    };
  }
  return state;
}
```

Then, at the end of `finalizeContest`, before every `return`, pass the affected manager(s) through `coverDeficit`. Simplest: wrap the final returns so any manager left negative is repaired:
```ts
function repairAll(s: RoomState, now: number): RoomState {
  let state = s;
  for (const id of Object.keys(state.managers))
    if (state.managers[id].spendable < 0) state = coverDeficit(state, id, now);
  return state;
}
```
Change `finalizeContest` to `return repairAll(<result>, now);` on each exit path, and `resolveDue` stays as-is.

- [ ] **Step 4: Run — PASS.** Re-run the full suite: `pnpm -C packages/shared test`
- [ ] **Step 5: Commit** — `git commit -am "feat(resolution): negative-balance unwind + fine coverage by player release"`

---

## Task 10: Challenge limit (3 per rival, one-directional)

**Files:**
- Create: `packages/shared/src/domain/challenge.ts`
- Test: `packages/shared/src/__tests__/challenge.test.ts`

Reproduces the **Barcelona 3-challenge** fixture.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { canChallenge, recordChallenge, challengeKey } from "../domain/challenge.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function s0() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "bar", displayName: "B", clubId: "barca" });
  s = addManager(s, { id: "real", displayName: "R", clubId: "real" });
  return s;
}

test("a manager may start at most 3 challenges against one rival's owned squad", () => {
  let s = s0();
  for (const pid of ["mbappe", "vini", "bellingham"]) {
    expect(canChallenge(s, "bar", "real")).toBe(true);
    s = recordChallenge(s, "bar", "real");
  }
  expect(canChallenge(s, "bar", "real")).toBe(false); // 4th blocked
  expect(s.challenges[challengeKey("bar", "real")]).toBe(3);
});

test("challenges are one-directional per pair", () => {
  let s = recordChallenge(recordChallenge(recordChallenge(s0(), "bar", "real"), "bar", "real"), "bar", "real");
  expect(canChallenge(s, "real", "bar")).toBe(true); // real->bar is a separate counter
});

test("going after a pool player never consumes the limit", () => {
  const s = s0();
  // pool players have ownerId null; caller must only recordChallenge for owned rivals — verified in engine
  expect(canChallenge(s, "bar", "real")).toBe(true);
});
```

- [ ] **Step 2: Run — FAIL.** `pnpm -C packages/shared test challenge`

- [ ] **Step 3: Implement**

`packages/shared/src/domain/challenge.ts`:
```ts
import type { RoomState } from "./types.js";
export const CHALLENGE_CAP = 3;
export const challengeKey = (challenger: string, rival: string) => `${challenger}->${rival}`;

export function canChallenge(s: RoomState, challenger: string, rival: string): boolean {
  return (s.challenges[challengeKey(challenger, rival)] ?? 0) < CHALLENGE_CAP;
}

export function recordChallenge(s: RoomState, challenger: string, rival: string): RoomState {
  const k = challengeKey(challenger, rival);
  return { ...s, challenges: { ...s.challenges, [k]: (s.challenges[k] ?? 0) + 1 } };
}
```

- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(challenge): 3-per-rival one-directional challenge limit"`

---

## Task 11: Player lock (no re-challenge until next season)

**Files:**
- Modify: `packages/shared/src/domain/war.ts` (add lock guard)
- Test: `packages/shared/src/__tests__/lock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { placeBid, BidError } from "../domain/war.js";
import type { RoomState } from "../domain/types.js";

function lockedRoomWithContestOnLockedPlayer(): { s: RoomState; contestId: string } {
  const player = { id: "p", name: "P", position: "FWD" as const, listedValue: 100, originalValue: 100, ownerId: "a", lockedThisSeason: true };
  const contest = { id: "c1", playerId: "p", type: "war" as const, status: "war" as const, listerId: null, quotes: [{ managerId: "a", amount: 100, at: 0 }], quoteCounts: { a: 1 }, closesAt: 999 };
  const s: RoomState = {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs: 3_600_000, squadSizeCap: null,
    seasonNumber: 1, status: "live", startedAt: 0,
    managers: { a: { id: "a", displayName: "A", clubId: "x", reserved: 100, spendable: 200 },
                b: { id: "b", displayName: "B", clubId: "y", reserved: 0, spendable: 200 } },
    players: { p: player }, contests: { c1: contest }, challenges: {}, log: [], seq: 1,
  };
  return { s, contestId: "c1" };
}

test("a player locked this season cannot be challenged again", () => {
  const { s, contestId } = lockedRoomWithContestOnLockedPlayer();
  expect(() => placeBid(s, { contestId, managerId: "b", amount: 150, now: 10 })).toThrow(/locked/i);
});
```

- [ ] **Step 2: Run — FAIL.** `pnpm -C packages/shared test lock`

- [ ] **Step 3: Implement** — add to the top of `placeBid` guards in `war.ts`:
```ts
  if (s.players[c.playerId].lockedThisSeason && a.managerId !== s.players[c.playerId].ownerId)
    throw new BidError("player locked this season");
```
(Place it after `player`/`manager` are resolved. The owner defending mid-contest is allowed; a fresh challenger on an already-resolved player is not — `lockedThisSeason` is set only on win/lock, so an in-flight contest before resolution is unaffected.)

- [ ] **Step 4: Run — PASS.** Full suite: `pnpm -C packages/shared test`
- [ ] **Step 5: Commit** — `git commit -am "feat(war): lock resolved players from re-challenge within a season"`

---

## Task 12: Season carryover + handoff

**Files:**
- Create: `packages/shared/src/domain/season.ts`
- Test: `packages/shared/src/__tests__/season.test.ts`

Reproduces the **season-handoff** fixture (§4.9).

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { positionStepBudgets, startNextSeason, releaseToOriginal } from "../domain/season.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

test("finishing position sets base budgets in 20M steps from the bottom", () => {
  // order = worst..best; base for last place = floor
  const bases = positionStepBudgets(["5th","4th","3rd","2nd","1st"], 600, 20);
  expect(bases).toEqual({ "5th": 600, "4th": 620, "3rd": 640, "2nd": 660, "1st": 680 });
});

test("next season carries leftover spendable on top of the new base and keeps risen prices", () => {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "real", displayName: "R", clubId: "real" });
  // simulate: real held 10 spendable leftover, Mbappe now permanently 250
  s = { ...s,
    managers: { ...s.managers, real: { ...s.managers["real"], spendable: 10 } },
    players: { ...s.players, mbappe: { ...s.players["mbappe"], listedValue: 250 } } };
  const next = startNextSeason(s, { finishingOrder: ["real"], base: 600, step: 20 });
  // one team: base 600 + leftover 10; reserved recomputed off current listed values (Mbappe 250)
  expect(next.managers["real"].spendable).toBe(600 + 10 - next.managers["real"].reserved);
  expect(next.players["mbappe"].listedValue).toBe(250); // permanent
  expect(next.players["mbappe"].lockedThisSeason).toBe(false); // unlocked for the new draft
  expect(next.seasonNumber).toBe(2);
});

test("releasing a held player resets him to his original dataset value", () => {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "real", displayName: "R", clubId: "real" });
  s = { ...s, players: { ...s.players, mbappe: { ...s.players["mbappe"], listedValue: 250 } } };
  const out = releaseToOriginal(s, "real", "mbappe");
  expect(out.players["mbappe"].ownerId).toBe(null);
  expect(out.players["mbappe"].listedValue).toBe(out.players["mbappe"].originalValue); // back to 200
});
```

- [ ] **Step 2: Run — FAIL.** `pnpm -C packages/shared test season`

- [ ] **Step 3: Implement**

`packages/shared/src/domain/season.ts`:
```ts
import type { RoomState } from "./types.js";
import { coverDeficit } from "./resolution.js";

/** finishingOrder is worst-first; each step up the table adds `step`. */
export function positionStepBudgets(finishingOrder: string[], base: number, step: number): Record<string, number> {
  const out: Record<string, number> = {};
  finishingOrder.forEach((id, i) => { out[id] = base + i * step; });
  return out;
}

export function releaseToOriginal(s: RoomState, ownerId: string, playerId: string): RoomState {
  const p = s.players[playerId];
  if (p.ownerId !== ownerId) return s;
  const m = s.managers[ownerId];
  return {
    ...s,
    managers: { ...s.managers, [ownerId]: { ...m, reserved: m.reserved - p.listedValue } },
    players: { ...s.players, [playerId]: { ...p, ownerId: null, listedValue: p.originalValue, lockedThisSeason: false } },
  };
}

export function startNextSeason(
  s: RoomState, a: { finishingOrder: string[]; base: number; step: number },
): RoomState {
  const bases = positionStepBudgets(a.finishingOrder, a.base, a.step);
  const managers = { ...s.managers };
  const players = Object.fromEntries(Object.entries(s.players).map(([id, p]) => [id, { ...p, lockedThisSeason: false }]));
  let state: RoomState = {
    ...s, players, contests: {}, challenges: {}, log: [],
    seasonNumber: s.seasonNumber + 1, status: "setup", startedAt: null, totalBudget: a.base,
  };
  for (const id of Object.keys(managers)) {
    const leftover = managers[id].spendable;
    const reserved = Object.values(players).filter(p => p.ownerId === id).reduce((sum, p) => sum + p.listedValue, 0);
    const newBase = bases[id] ?? a.base;
    managers[id] = { ...managers[id], reserved, spendable: newBase + Math.max(0, leftover) - reserved };
  }
  state = { ...state, managers };
  // reserved-overflow unwind (§4.9): any manager left negative releases players + fine handled by coverDeficit
  for (const id of Object.keys(managers)) if (state.managers[id].spendable < 0) state = coverDeficit(state, id, 0);
  return state;
}
```

- [ ] **Step 4: Run — PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(season): position-stepped budgets, leftover carry, renew/release, overflow unwind"`

---

## Task 13: Engine reducer + full mock-draft replay

**Files:**
- Create: `packages/shared/src/domain/engine.ts`
- Test: `packages/shared/src/__tests__/fixtures.replay.test.ts`

Ties the modules into one `applyCommand` reducer and replays the **five-way Haaland** fight and the **mock-draft budget snapshot** (§5) end to end.

- [ ] **Step 1: Write the failing test (Haaland five-way)**

```ts
import { test, expect } from "vitest";
import { applyCommand } from "../domain/engine.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function live() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed(), quoteTimerMs: 300_000 });
  for (const [id, clubId] of [["ars","arsenal"],["bay","bayern"],["real","real"],["bar","barca"],["city","city"]] as const)
    s = addManager(s, { id, displayName: id, clubId });
  return applyCommand(s, { type: "StartDraft", now: 0 }).state;
}

test("five-way Haaland fight closes on Bayern 220 after 5 minutes of silence", () => {
  let s = live();
  // Haaland is a pool player at 180. OpenListing seeds the contest at listed value; it does NOT
  // spend City's quote cap (see the design-correction note at the top of this plan) — City's real
  // first quote is their 181 bid below.
  s = applyCommand(s, { type: "OpenListing", managerId: "city", playerId: "haaland", now: 0 }).state;
  // Escalate immediately: City 181, Barca 190, Arsenal 195, Bayern 200, City 205, Arsenal 215, Bayern 220
  const bids: [string, number, number][] = [
    ["city", 181, 10], ["bar", 190, 20], ["ars", 195, 30], ["bay", 200, 40],
    ["city", 205, 50], ["ars", 215, 60], ["bay", 220, 70],
  ];
  for (const [m, amt, now] of bids) s = applyCommand(s, { type: "PlaceBid", contestId: "c1", managerId: m, amount: amt, now }).state;
  // 5 minutes of silence after the last quote (70 + 300000)
  s = applyCommand(s, { type: "Tick", now: 70 + 300_000 }).state;
  expect(s.players["haaland"].ownerId).toBe("bay");
  expect(s.players["haaland"].listedValue).toBe(220);
  expect(s.contests["c1"].status).toBe("closed");
});

test("challenging a rival's owned player goes through the Challenge command, not OpenListing", () => {
  let s = live();
  // Barcelona challenges Real's Mbappé (owned, not pool) directly — must state an amount.
  s = applyCommand(s, { type: "Challenge", managerId: "bar", playerId: "mbappe", amount: 210, now: 0 }).state;
  const contestId = Object.keys(s.contests)[0];
  expect(s.contests[contestId].status).toBe("war"); // no 2-minute listing phase for a challenge
  // Real never defends; 5 minutes of silence closes it in Barcelona's favor at their actual bid (210), not listed value (200).
  s = applyCommand(s, { type: "Tick", now: 300_000 }).state;
  expect(s.players["mbappe"].ownerId).toBe("bar");
  expect(s.players["mbappe"].listedValue).toBe(210);
});
```

- [ ] **Step 2: Run — FAIL.** `pnpm -C packages/shared test fixtures`

- [ ] **Step 3: Implement the reducer**

`packages/shared/src/domain/engine.ts`:
```ts
import type { RoomState, LogEntry } from "./types.js";
import { openListing } from "./listing.js";
import { placeBid, openChallenge } from "./war.js";
import { resolveDue } from "./resolution.js";
import { canChallenge, recordChallenge } from "./challenge.js";

export type Command =
  | { type: "StartDraft"; now: number }
  | { type: "OpenListing"; managerId: string; playerId: string; now: number }
  | { type: "Challenge"; managerId: string; playerId: string; amount: number; now: number }
  | { type: "PlaceBid"; contestId: string; managerId: string; amount: number; now: number }
  | { type: "Tick"; now: number };

export function applyCommand(s: RoomState, cmd: Command): { state: RoomState; events: LogEntry[] } {
  const before = s.log.length;
  let state = s;
  switch (cmd.type) {
    case "StartDraft":
      state = { ...s, status: "live", startedAt: cmd.now };
      break;
    case "OpenListing": {
      // Pool claim or own-player release only. A rival-owned player must use "Challenge" instead.
      const player = s.players[cmd.playerId];
      if (player.ownerId && player.ownerId !== cmd.managerId) {
        throw new Error("player is owned by another manager — use the Challenge command");
      }
      state = openListing(state, cmd).state;
      break;
    }
    case "Challenge": {
      const player = s.players[cmd.playerId];
      if (!player.ownerId || player.ownerId === cmd.managerId) {
        throw new Error("Challenge is only for a rival's owned player — use OpenListing for pool/own players");
      }
      if (!canChallenge(s, cmd.managerId, player.ownerId)) throw new Error("challenge limit reached");
      state = recordChallenge(s, cmd.managerId, player.ownerId);
      state = openChallenge(state, cmd).state;
      break;
    }
    case "PlaceBid":
      state = placeBid(s, cmd);
      break;
    case "Tick":
      state = resolveDue(s, cmd.now);
      break;
  }
  return { state, events: state.log.slice(before) };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Add the mock-draft budget-snapshot test**

Append a test to `fixtures.replay.test.ts` that runs the §5 mock-draft sequence using the `Challenge` command for Mbappé (owned by real — Barcelona/Arsenal challenge him directly, real defends via `PlaceBid`) and `OpenListing` for the pool actions (Kane pool sale via City challenging Bayern's Kane — also owned, so also `Challenge`; Wirtz pickup by Arsenal via `OpenListing` since Wirtz is unowned pool). City's Pedri+Musiala double-deal likewise uses `Challenge` (both owned, by barca and bayern respectively). Assert the end-of-hour snapshot from the spec table (Arsenal 190, Bayern 350, Real 200, Barca 310, City 34 — under the flat-250M spendable scenario the pitch uses for the worked table). Construct the room with each manager's spendable forced to 250 to match the pitch's simplified table, then assert `s.managers[x].spendable` after a final `Tick` past the hour.

- [ ] **Step 6: Run — PASS.** Full suite green: `pnpm -C packages/shared test`
- [ ] **Step 7: Commit** — `git commit -am "feat(engine): applyCommand reducer + Challenge command + Haaland & mock-draft replay fixtures"`

---

## Self-review (completed against the spec)

- **§4.1 budget/floor/cost** → Tasks 2, 4, 3 (reserve on addManager). ✅
- **§4.2 listing window (pool claim / own release only)** → Task 5. ✅
- **§4.3 war (min bid, 2-quote cap, close) + direct challenges on rival-owned players** → Tasks 6, 7, 13 (`Challenge` command). ✅
- **§4.4 ordered closes + overcommit void + fine** → Task 8. ✅
- **§4.4 negative unwind + fine coverage** → Task 9. ✅
- **§4.5 cash-in on loss** → Task 8 (`applyWin` seller release). ✅
- **§4.6 challenge limit** → Task 10, enforced in engine Task 13's `Challenge` handler. ✅
- **§4.7 player lock** → Task 11. ✅
- **§4.8 draft clock** → Task 7 (`dueContests` draft-clock override). ✅
- **§4.9 season carryover/handoff** → Task 12. ✅
- **§5 fixtures** → Tasks 8 (Mbappé, City), 10 (Barcelona cap), 12 (handoff), 13 (Haaland, Mbappé-via-Challenge, mock-draft snapshot). ✅

**Type consistency:** `cost(player, managerId, amount)`, `challengeKey(a,b)`, `RoomState`/`Contest`/`Player`/`Manager`/`LogEntry`, `OVERCOMMIT_FINE`, `LISTING_MS` are used identically across tasks. `applyWin`/`finalizeContest`/`resolveDue`/`coverDeficit`/`repairAll`/`openListing`/`openChallenge`/`placeBid` signatures are consistent. `fixtureSeed()` (Task 5) is the single shared test roster for Tasks 5–13; `loadSeed()` (Task 2) is reserved for the real FC26 `squads.json`.

**Design gap resolved during planning (not left open):** the plan originally let `openListing` handle both pool-claims and challenges-on-owned-players under one ownership check, which would have wrongly let an unanswered challenge on a rival's player silently transfer at listed value after 2 minutes instead of following normal war-close rules. Fixed by splitting into `openListing` (pool/own-release, 2-min uncontested-lock, lister's seed doesn't spend their quote cap) and `openChallenge` (rival-owned, opens directly as `"war"`, challenger's bid spends their quote cap) — routed by a new `Challenge` engine command. This also resolves what was previously flagged as an "open decision" about whether a listing's opener quote counts toward the cap: it does for challenges, not for listings, which is what makes both the Haaland and Mbappé/Barcelona-3-challenge fixtures hold simultaneously.
