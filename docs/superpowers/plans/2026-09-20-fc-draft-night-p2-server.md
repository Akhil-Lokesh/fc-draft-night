# FC Draft Night — Plan 2: Server (queue · timers · sockets · persistence)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Prerequisite:** Plan 1 complete (`@fcdn/shared` exports `createRoom`, `addManager`, `applyCommand`, all domain types). `pnpm -C packages/shared test` green.

**Goal:** Wrap the pure rules engine in an authoritative server: a serialized command queue, a periodic timer that drives `Tick`, SQLite write-through persistence with crash recovery, and a Socket.IO gateway for join/reconnect/intents/state-broadcast.

**Architecture:** One in-memory `RoomState` per room. Every mutation goes through `queue.run(code, reducer)` which serializes reducers per room, then persists a JSON snapshot and broadcasts the new state. Timers never read a wall clock directly — an injectable `Clock` supplies `now`, so tests drive time deterministically.

**Tech Stack:** Node · TypeScript · socket.io · better-sqlite3 · vitest · socket.io-client (tests).

**Spec:** `docs/.../2026-09-20-fc-draft-night-design.md` §3. **Roadmap:** `...-roadmap.md`.

---

## File structure

```
packages/server/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    clock.ts        # Clock interface: RealClock + FakeClock
    queue.ts        # per-room serialized reducer runner
    db.ts           # SQLite snapshot store + loadAll
    rooms.ts        # RoomStore: create/join/get, code generation
    timers.ts       # Ticker: enqueues Tick每second via Clock
    gateway.ts      # Socket.IO handlers (join, reconnect, intents)
    server.ts       # http + io bootstrap, recovery on boot
    __tests__/
```

---

## Task 1: Server package scaffold

**Files:** Create `packages/server/{package.json,tsconfig.json,vitest.config.ts}`, `src/__tests__/smoke.test.ts`

- [ ] **Step 1: package.json**
```json
{
  "name": "@fcdn/server",
  "version": "0.0.0",
  "type": "module",
  "scripts": { "test": "vitest run", "dev": "tsx src/server.ts", "build": "tsc -p tsconfig.json" },
  "dependencies": { "@fcdn/shared": "workspace:*", "better-sqlite3": "^11.0.0", "socket.io": "^4.7.0" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0", "tsx": "^4.0.0", "socket.io-client": "^4.7.0", "@types/better-sqlite3": "^7.6.0", "@types/node": "^22.0.0" }
}
```
- [ ] **Step 2: tsconfig.json** — `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`
- [ ] **Step 3: vitest.config.ts**
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true, environment: "node" } });
```
- [ ] **Step 4: smoke test** `src/__tests__/smoke.test.ts`
```ts
import { test, expect } from "vitest";
import { createRoom } from "@fcdn/shared";
test("shared package is importable from server", () => {
  expect(createRoom({ code: "AB", totalBudget: 600, seed: [] }).status).toBe("setup");
});
```
- [ ] **Step 5:** `pnpm install && pnpm -C packages/server test` → PASS
- [ ] **Step 6:** `git commit -am "chore(server): scaffold server package importing @fcdn/shared"`

---

## Task 2: Injectable clock

**Files:** Create `src/clock.ts`, `src/__tests__/clock.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { FakeClock } from "../clock.js";
test("FakeClock advances deterministically", () => {
  const c = new FakeClock(0);
  expect(c.now()).toBe(0);
  c.advance(1500);
  expect(c.now()).toBe(1500);
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test clock`
- [ ] **Step 3: Implement** `src/clock.ts`
```ts
export interface Clock { now(): number; }
export class RealClock implements Clock { now() { return Date.now(); } }
export class FakeClock implements Clock {
  constructor(private t = 0) {}
  now() { return this.t; }
  advance(ms: number) { this.t += ms; }
  set(ms: number) { this.t = ms; }
}
```
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(server): injectable clock (Real + Fake)"`

---

## Task 3: Serialized per-room command queue

**Files:** Create `src/queue.ts`, `src/__tests__/queue.test.ts`

The queue guarantees that reducers for the same room never interleave — critical for "deals honored in the order they close."

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { Queue } from "../queue.js";

test("reducers for one room run strictly in enqueue order", async () => {
  const q = new Queue();
  const seen: number[] = [];
  const mk = (n: number) => (s: { v: number }) => { seen.push(n); return { state: { v: n }, events: [] }; };
  const states: { v: number }[] = [];
  q.setState("R", { v: 0 });
  const p1 = q.run("R", mk(1)).then(r => states.push(r.state));
  const p2 = q.run("R", mk(2)).then(r => states.push(r.state));
  const p3 = q.run("R", mk(3)).then(r => states.push(r.state));
  await Promise.all([p1, p2, p3]);
  expect(seen).toEqual([1, 2, 3]);
  expect(q.getState("R")).toEqual({ v: 3 });
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test queue`
- [ ] **Step 3: Implement** `src/queue.ts`
```ts
export type Reducer<S> = (s: S) => { state: S; events: unknown[] };

export class Queue<S = any> {
  private states = new Map<string, S>();
  private tails = new Map<string, Promise<unknown>>();

  setState(code: string, s: S) { this.states.set(code, s); }
  getState(code: string): S | undefined { return this.states.get(code); }

  run(code: string, reducer: Reducer<S>): Promise<{ state: S; events: unknown[] }> {
    const prev = this.tails.get(code) ?? Promise.resolve();
    const next = prev.then(() => {
      const cur = this.states.get(code)!;
      const out = reducer(cur);
      this.states.set(code, out.state);
      return out;
    });
    // keep the chain alive even if a reducer throws
    this.tails.set(code, next.catch(() => {}));
    return next;
  }
}
```
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(server): per-room serialized command queue"`

---

## Task 4: SQLite snapshot persistence + recovery

**Files:** Create `src/db.ts`, `src/__tests__/db.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { Db } from "../db.js";
import { createRoom } from "@fcdn/shared";

test("saving a room snapshot and reloading returns identical state", () => {
  const db = new Db(":memory:");
  const s = createRoom({ code: "WXYZ", totalBudget: 600, seed: [] });
  db.save(s);
  const all = db.loadAll();
  expect(all.map(r => r.code)).toEqual(["WXYZ"]);
  expect(all[0].totalBudget).toBe(600);
});

test("saving the same room twice overwrites (write-through)", () => {
  const db = new Db(":memory:");
  const s = createRoom({ code: "WXYZ", totalBudget: 600, seed: [] });
  db.save(s);
  db.save({ ...s, status: "live" });
  expect(db.loadAll()[0].status).toBe("live");
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test db`
- [ ] **Step 3: Implement** `src/db.ts`
```ts
import Database from "better-sqlite3";
import type { RoomState } from "@fcdn/shared";

export class Db {
  private db: Database.Database;
  constructor(path = "fcdn.sqlite") {
    this.db = new Database(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, snapshot TEXT NOT NULL)");
  }
  save(s: RoomState) {
    this.db.prepare("INSERT INTO rooms (code, snapshot) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET snapshot = excluded.snapshot")
      .run(s.code, JSON.stringify(s));
  }
  loadAll(): RoomState[] {
    return this.db.prepare("SELECT snapshot FROM rooms").all()
      .map((r: any) => JSON.parse(r.snapshot) as RoomState);
  }
}
```
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(server): SQLite snapshot persistence with write-through + loadAll recovery"`

---

## Task 5: RoomStore — create / join / code generation

**Files:** Create `src/rooms.ts`, `src/__tests__/rooms.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { RoomStore } from "../rooms.js";
import { Queue } from "../queue.js";
import { Db } from "../db.js";
import { loadSeed } from "@fcdn/shared";

function store() { return new RoomStore(new Queue(), new Db(":memory:"), loadSeed(), () => "CODE1"); }

test("creating a room generates a code and persists it", async () => {
  const rs = store();
  const { code } = await rs.create({ totalBudget: 600 });
  expect(code).toBe("CODE1");
  expect(rs.get(code)!.status).toBe("setup");
});

test("budget below the floor is rejected", async () => {
  const rs = store();
  await expect(rs.create({ totalBudget: 100 })).rejects.toThrow(/floor/i);
});

test("joining assigns a club, reserves the squad, and blocks a taken club", async () => {
  const rs = store();
  const { code } = await rs.create({ totalBudget: 600 });
  const m = await rs.join(code, { displayName: "Ana", clubId: "real" });
  expect(rs.get(code)!.managers[m.managerId].reserved).toBeGreaterThan(0);
  await expect(rs.join(code, { displayName: "Bo", clubId: "real" })).rejects.toThrow(/taken/i);
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test rooms`
- [ ] **Step 3: Implement** `src/rooms.ts`
```ts
import { createRoom, addManager, budgetFloor, loadSeed as _ls, type RoomState, type SeedPlayer } from "@fcdn/shared";
import type { Queue } from "./queue.js";
import type { Db } from "./db.js";

let counter = 0;
function defaultCode(): string {
  counter++;
  return "R" + counter.toString(36).toUpperCase().padStart(4, "0");
}

export class RoomStore {
  constructor(private q: Queue<RoomState>, private db: Db, private seed: SeedPlayer[], private gen: () => string = defaultCode) {}

  get(code: string) { return this.q.getState(code); }

  async create(opts: { totalBudget: number; quoteTimerMs?: number; squadSizeCap?: number | null }): Promise<{ code: string }> {
    const floor = budgetFloor(this.seed);
    if (opts.totalBudget < floor) throw new Error(`budget below floor (${floor})`);
    const code = this.gen();
    const s = createRoom({ code, totalBudget: opts.totalBudget, seed: this.seed, quoteTimerMs: opts.quoteTimerMs, squadSizeCap: opts.squadSizeCap });
    this.q.setState(code, s);
    this.db.save(s);
    return { code };
  }

  async join(code: string, m: { displayName: string; clubId: string }): Promise<{ managerId: string }> {
    const managerId = `m_${m.clubId}`;
    const { state } = await this.q.run(code, (s) => {
      if (!s) throw new Error("no such room");
      if (Object.values(s.managers).some(x => x.clubId === m.clubId)) throw new Error("club taken");
      return { state: addManager(s, { id: managerId, ...m }), events: [] };
    });
    this.db.save(state);
    return { managerId };
  }

  loadFrom(db: Db) { for (const s of db.loadAll()) this.q.setState(s.code, s); }
}
```
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(server): RoomStore create/join with floor + club-uniqueness guards"`

---

## Task 6: Timer ticker

**Files:** Create `src/timers.ts`, `src/__tests__/timers.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { Ticker } from "../timers.js";
import { Queue } from "../queue.js";
import { FakeClock } from "../clock.js";
import { createRoom, addManager, applyCommand, type RoomState } from "@fcdn/shared";
import { loadSeed } from "@fcdn/shared";

test("a tick resolves a war whose anti-snipe window has elapsed", async () => {
  const q = new Queue<RoomState>();
  const clock = new FakeClock(0);
  let s = createRoom({ code: "AB", totalBudget: 600, seed: loadSeed() });
  s = addManager(s, { id: "city", displayName: "C", clubId: "city" });
  s = applyCommand(s, { type: "StartDraft", now: 0 }).state;
  s = applyCommand(s, { type: "OpenListing", managerId: "city", playerId: "haaland", now: 0 }).state;
  s = applyCommand(s, { type: "PlaceBid", contestId: "c1", managerId: "city", amount: 181, now: 10 }).state;
  q.setState("AB", s);
  const ticker = new Ticker(q, clock, () => {});
  clock.set(10 + 300_000);
  await ticker.tickOnce("AB"); // enqueue a Tick at current clock time
  expect(q.getState("AB")!.players["haaland"].ownerId).toBe("city");
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test timers`
- [ ] **Step 3: Implement** `src/timers.ts`
```ts
import { applyCommand, type RoomState } from "@fcdn/shared";
import type { Queue } from "./queue.js";
import type { Clock } from "./clock.js";

export class Ticker {
  private handle: ReturnType<typeof setInterval> | null = null;
  constructor(private q: Queue<RoomState>, private clock: Clock, private onChange: (s: RoomState) => void) {}

  async tickOnce(code: string) {
    const { state } = await this.q.run(code, (s) => applyCommand(s, { type: "Tick", now: this.clock.now() }));
    this.onChange(state);
  }
  start(codes: () => string[], everyMs = 1000) {
    this.handle = setInterval(() => { for (const c of codes()) void this.tickOnce(c); }, everyMs);
  }
  stop() { if (this.handle) clearInterval(this.handle); }
}
```
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(server): periodic ticker driving engine Tick via injectable clock"`

---

## Task 7: Socket.IO gateway

**Files:** Create `src/gateway.ts`, `src/server.ts`, `src/__tests__/gateway.test.ts`

- [ ] **Step 1: Failing integration test**
```ts
import { test, expect } from "vitest";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as client } from "socket.io-client";
import { attachGateway } from "../gateway.js";
import { RoomStore } from "../rooms.js";
import { Queue } from "../queue.js";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { loadSeed, type RoomState } from "@fcdn/shared";

async function boot() {
  const http = createServer();
  const io = new Server(http, { cors: { origin: "*" } });
  const q = new Queue<RoomState>();
  const store = new RoomStore(q, new Db(":memory:"), loadSeed(), () => "TEST1");
  attachGateway(io, store, new FakeClock(0));
  await new Promise<void>(r => http.listen(0, r));
  const port = (http.address() as any).port;
  return { http, io, store, url: `http://localhost:${port}` };
}

test("a joined client receives a state broadcast, and a bid propagates to a second client", async () => {
  const { store, url, http, io } = await boot();
  await store.create({ totalBudget: 600 });
  const a = client(url), b = client(url);
  const stateOnB = new Promise<any>(res => b.on("state", res));
  a.emit("join", { code: "TEST1", displayName: "A", clubId: "city" });
  b.emit("join", { code: "TEST1", displayName: "B", clubId: "bayern" });
  await new Promise(r => setTimeout(r, 50));
  a.emit("start", { code: "TEST1" });
  a.emit("openListing", { code: "TEST1", playerId: "haaland" });
  const s = await stateOnB;
  expect(s.code).toBe("TEST1");
  a.close(); b.close(); io.close(); http.close();
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test gateway`
- [ ] **Step 3: Implement** `src/gateway.ts`
```ts
import type { Server, Socket } from "socket.io";
import { applyCommand, type RoomState } from "@fcdn/shared";
import type { RoomStore } from "./rooms.js";
import type { Clock } from "./clock.js";

export function attachGateway(io: Server, store: RoomStore, clock: Clock) {
  const broadcast = (code: string) => { const s = store.get(code); if (s) io.to(code).emit("state", s); };

  io.on("connection", (socket: Socket) => {
    let joined: { code: string; managerId: string } | null = null;

    socket.on("join", async (p: { code: string; displayName: string; clubId: string; managerId?: string }) => {
      const existing = store.get(p.code);
      const managerId = p.managerId
        ?? (existing && Object.values(existing.managers).find(m => m.clubId === p.clubId)?.id)
        ?? (await store.join(p.code, { displayName: p.displayName, clubId: p.clubId })).managerId;
      joined = { code: p.code, managerId };
      socket.join(p.code);
      socket.emit("joined", { managerId }); // client stores this for reconnection
      broadcast(p.code);
    });

    const cmd = (code: string, make: (s: RoomState) => Parameters<typeof applyCommand>[1]) =>
      store["q"].run(code, (s: RoomState) => applyCommand(s, make(s))).then(() => broadcast(code)).catch((e: Error) => socket.emit("error", e.message));

    socket.on("start", (p: { code: string }) => cmd(p.code, () => ({ type: "StartDraft", now: clock.now() })));
    // OpenListing = claim a pool player or release your own (server infers which from ownership).
    socket.on("openListing", (p: { code: string; playerId: string }) =>
      cmd(p.code, () => ({ type: "OpenListing", managerId: joined!.managerId, playerId: p.playerId, now: clock.now() })));
    // Challenge = go after a player owned by a rival; the client must name its opening bid (Plan 1 Task 6/13 split).
    socket.on("challenge", (p: { code: string; playerId: string; amount: number }) =>
      cmd(p.code, () => ({ type: "Challenge", managerId: joined!.managerId, playerId: p.playerId, amount: p.amount, now: clock.now() })));
    socket.on("bid", (p: { code: string; contestId: string; amount: number }) =>
      cmd(p.code, () => ({ type: "PlaceBid", contestId: p.contestId, managerId: joined!.managerId, amount: p.amount, now: clock.now() })));
  });
}
```
> **Refactor note:** reaching `store["q"]` is a smell — expose `RoomStore.run(code, cmd)` that wraps `applyCommand` and returns the new state, and call that from the gateway. Add it in this step and update Task 5's class.

- [ ] **Step 4: Implement** `src/server.ts` (boot + recovery)
```ts
import { createServer } from "node:http";
import { Server } from "socket.io";
import { RoomStore } from "./rooms.js";
import { Queue } from "./queue.js";
import { Db } from "./db.js";
import { RealClock } from "./clock.js";
import { Ticker } from "./timers.js";
import { attachGateway } from "./gateway.js";
import { loadSeed, type RoomState } from "@fcdn/shared";

const http = createServer();
const io = new Server(http, { cors: { origin: process.env.WEB_ORIGIN ?? "*" } });
const q = new Queue<RoomState>();
const db = new Db(process.env.DB_PATH ?? "fcdn.sqlite");
const store = new RoomStore(q, db, loadSeed());
store.loadFrom(db); // crash recovery
const clock = new RealClock();
attachGateway(io, store, clock);
new Ticker(q, clock, s => io.to(s.code).emit("state", s)).start(() => Object.keys((q as any).states));
http.listen(Number(process.env.PORT ?? 8080));
```
- [ ] **Step 5:** Run — PASS. Full suite: `pnpm -C packages/server test`
- [ ] **Step 6:** `git commit -am "feat(server): Socket.IO gateway (join/reconnect/intents/broadcast) + boot with recovery"`

---

## Task 8: End-to-end replay + crash recovery

**Files:** Create `src/__tests__/replay.integration.test.ts`

- [ ] **Step 1: Failing test** — reuse the boot helper (extract to `src/__tests__/helpers.ts`). Drive the full **mock-draft** sequence over sockets with a `FakeClock`, advancing time to fire each close, then assert the §5 budget snapshot (under the flat-250M scenario). Then: `db.save` is implicitly called on every mutation — construct a fresh `RoomStore` + `store.loadFrom(db)` and assert the reloaded state equals the pre-crash state.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** No new production code expected if Tasks 1–7 are correct; if the replay reveals a wiring gap (e.g. broadcast timing), fix the gateway/ticker minimally.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** `git commit -am "test(server): full mock-draft socket replay + crash-recovery integration"`

---

## Task 9: FC 26 catalog — search + host pool curation

**Data model reminder:** `RoomStore.create` seeds a room with the **5 club squads only** (`squads.json` via `@fcdn/shared` `loadSeed()`). The ~18k-player `fc26-catalog.json` is loaded **server-side only** (never sent whole to a phone). Before the draft the host searches the catalog and picks which non-club players become pool players in the room.

**Files:** Create `src/catalog.ts`, `src/__tests__/catalog.test.ts`; Modify `src/gateway.ts` (add `searchCatalog` + `setPool` handlers), `packages/shared/src/domain/types.ts` (add `addPoolPlayer`).

- [ ] **Step 1: Failing test** (`catalog.test.ts`)
```ts
import { test, expect } from "vitest";
import { Catalog } from "../catalog.js";
test("search ranks by value and excludes the five clubs' players", () => {
  const c = new Catalog(); // loads fc26-catalog.json
  const res = c.search({ q: "wirtz", limit: 5 });
  expect(res[0].name).toMatch(/Wirtz/);
  expect(res[0].clubId).toBe(null); // pool-eligible only
});
test("search can filter by position and club name", () => {
  const c = new Catalog();
  const gks = c.search({ position: "GK", limit: 10 });
  expect(gks.every(p => p.position === "GK")).toBe(true);
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test catalog`
- [ ] **Step 3: Implement** `src/catalog.ts`
```ts
import catalog from "./data/fc26-catalog.json" assert { type: "json" };
import type { SeedPlayer } from "@fcdn/shared";

export class Catalog {
  private all = catalog as SeedPlayer[];
  search(q: { q?: string; position?: string; club?: string; limit?: number }): SeedPlayer[] {
    let r = this.all.filter(p => p.clubId === null); // only pool-eligible (non-tournament-club)
    if (q.q) { const s = q.q.toLowerCase(); r = r.filter(p => p.name.toLowerCase().includes(s)); }
    if (q.position) r = r.filter(p => p.position === q.position);
    if (q.club) { const s = q.club.toLowerCase(); r = r.filter(p => p.club.toLowerCase().includes(s)); }
    return r.sort((a, b) => b.value - a.value).slice(0, q.limit ?? 50);
  }
  byIds(ids: string[]): SeedPlayer[] { const set = new Set(ids); return this.all.filter(p => set.has(p.id)); }
}
```
- [ ] **Step 4: Implement** `addPoolPlayer` in `@fcdn/shared` `types.ts` — inserts a catalog player into `RoomState.players` with `ownerId: null, lockedThisSeason: false, listedValue = originalValue = value`. Add gateway handlers: `socket.on("searchCatalog", q → socket.emit("catalogResults", catalog.search(q)))`; `socket.on("setPool", { code, ids } → for each id not already present, run addPoolPlayer through the queue, then broadcast)`. Only allow `setPool` while `status === "setup"`.
- [ ] **Step 5:** Add a test that `setPool` adds exactly the chosen players to room state and rejects while `live`. Run — PASS.
- [ ] **Step 6:** `git commit -am "feat(server): FC26 catalog search + host pool curation (setPool)"`

---

## Self-review

- **§3 authoritative server + serialized resolution** → Tasks 3 (queue), 6 (ticker), 7 (gateway). ✅
- **FC26 catalog search + host-curated pool** → Task 9. ✅
- **Persistence + recovery** → Tasks 4, 7 (`loadFrom`), 8. ✅
- **Join / reconnect by club+managerId** → Task 7 (`join` handler reuses existing manager; client stores `managerId`). ✅
- **Budget floor + club uniqueness at setup** → Task 5. ✅
- **Deterministic time in tests** → Task 2 `FakeClock` threaded everywhere. ✅
- **Consistency:** `Queue<RoomState>`, `RoomStore.get/create/join/run`, `Ticker.tickOnce/start`, `attachGateway(io, store, clock)` used identically across tasks. Fix the `store["q"]` smell by adding `RoomStore.run` (Task 7 note) before finishing.
