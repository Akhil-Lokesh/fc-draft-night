# FC Draft Night — Plan 3: Frontend Core (Join · Setup · Draft Board · live sync)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Prerequisite:** Plan 2 complete (server emits `state`, `joined`, `error`, `catalogResults`, `seasonExport`; accepts `join`, `start`, `openListing`, `challenge`, `bid`, `searchCatalog`, `setPool`, `exportSeason`, `importSeason`).
>
> **Drift note (post-execution):** this doc was written before Plan 2 executed. Two things changed from what's assumed below — read this before Tasks 2, 6, 8:
> 1. **`openListing` vs `challenge` are separate, not one action.** `openListing(playerId)` is *only* for claiming an unowned pool player or releasing your own — the server rejects it outright for a rival-owned player (`listing.ts` enforces this at the mutation boundary now, not just the engine layer). To go after a player owned by someone else, emit `challenge({ playerId, amount })` — the amount is required (must exceed the player's current listed value) since there's no "list at default price" for a rival's player. `Task 6`'s original design ("server decides pool-listing vs challenge from ownership") is wrong; the client must pick the action, and `challenge` needs a bid-amount input the way `openListing` doesn't.
> 2. **There is no pool player in a freshly-created room.** The 5 clubs' full real FC26 rosters (134 players, all owned) are the only players present at room creation — a pool only exists once the host curates one via `searchCatalog`/`setPool` (built in Plan 2 Task 9, not originally in this doc's scope). `PoolList` (Task 6) needs to render BOTH the host-curated pool (unowned, click → `openListing`) and the five squads (owned, click → opens a bid-amount input, then `challenge`) — it's effectively a full player browser, not just a pool list.

**Goal:** A phone-first React client: join a room, host setup, and the live Draft Board with parallel contests, per-contest countdowns, searchable pool, live budget bars, challenge-limit tracker, draft-log feed, list/bid/raise/release actions, and an instant alert when one of your players is challenged.

**Architecture:** A thin client. A single socket store holds the last broadcast `RoomState` and the local `managerId`; components render from it and emit intents. No game logic in the client — the server is authoritative; the client only formats and dispatches.

**Tech Stack:** React · Vite · TypeScript · zustand · socket.io-client · vitest · @testing-library/react.

**Spec:** §8 screens + feature→screen map. **Types:** import `RoomState`, `Contest`, etc. from `@fcdn/shared`.

---

## File structure

```
packages/web/
  package.json · tsconfig.json · vite.config.ts · index.html
  src/
    main.tsx · App.tsx
    state/socket.ts          # zustand store + socket wiring
    lib/format.ts            # money/time formatting, cost helper (re-uses shared cost)
    screens/Join.tsx
    screens/Setup.tsx
    screens/DraftBoard.tsx
    components/ContestCard.tsx · PoolList.tsx · BudgetBars.tsx
    components/ChallengeTracker.tsx · DraftLog.tsx · ChallengeAlert.tsx
    __tests__/
```

---

## Task 1: Web scaffold

**Files:** Create `packages/web/{package.json,tsconfig.json,vite.config.ts,index.html}`, `src/{main.tsx,App.tsx}`, `src/__tests__/smoke.test.tsx`

- [ ] **Step 1: package.json**
```json
{
  "name": "@fcdn/web", "version": "0.0.0", "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "test": "vitest run" },
  "dependencies": { "@fcdn/shared": "workspace:*", "react": "^18.3.0", "react-dom": "^18.3.0", "socket.io-client": "^4.7.0", "zustand": "^4.5.0" },
  "devDependencies": { "typescript": "^5.5.0", "vite": "^5.4.0", "@vitejs/plugin-react": "^4.3.0", "vitest": "^2.0.0", "@testing-library/react": "^16.0.0", "@testing-library/user-event": "^14.5.0", "jsdom": "^25.0.0", "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0" }
}
```
- [ ] **Step 2: vite.config.ts**
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], test: { globals: true, environment: "jsdom" } } as any);
```
- [ ] **Step 3: index.html + main.tsx + App.tsx** (minimal: `<div id="root">`, render `<App/>`, App shows `"FC Draft Night"`). tsconfig extends base with `"jsx": "react-jsx"`, `"lib": ["ES2022","DOM"]`.
- [ ] **Step 4: smoke test** `src/__tests__/smoke.test.tsx`
```tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App.js";
test("app renders title", () => { render(<App />); expect(screen.getByText(/FC Draft Night/)).toBeTruthy(); });
```
- [ ] **Step 5:** `pnpm install && pnpm -C packages/web test` → PASS
- [ ] **Step 6:** `git commit -am "chore(web): scaffold vite+react+ts with vitest/testing-library"`

---

## Task 2: Socket store

**Files:** Create `src/state/socket.ts`, `src/__tests__/socket.test.ts`

The store is testable without a live socket by injecting a fake transport.

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { makeStore } from "../state/socket.js";

function fakeTransport() {
  const handlers: Record<string, (p: any) => void> = {};
  return {
    emit: (ev: string, p: any) => { (fakeTransport as any).last = { ev, p }; },
    on: (ev: string, h: (p: any) => void) => { handlers[ev] = h; },
    fire: (ev: string, p: any) => handlers[ev]?.(p),
  };
}

test("store applies a state broadcast and records managerId on joined", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("joined", { managerId: "m_city" });
  t.fire("state", { code: "AB", managers: {}, players: {}, contests: {} });
  expect(store.getState().managerId).toBe("m_city");
  expect(store.getState().room?.code).toBe("AB");
});

test("bid() emits a bid intent with the room code", () => {
  const t = fakeTransport();
  const store = makeStore(t as any);
  t.fire("state", { code: "AB", managers: {}, players: {}, contests: {} });
  store.getState().bid("c1", 200);
  expect((t.emit as any) && (fakeTransport as any).last).toMatchObject({ ev: "bid" });
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test socket`
- [ ] **Step 3: Implement** `src/state/socket.ts`
```ts
import { createStore } from "zustand/vanilla";
import type { RoomState } from "@fcdn/shared";

export interface Transport { emit(ev: string, p: any): void; on(ev: string, h: (p: any) => void): void; }
export interface UiState {
  room: RoomState | null; managerId: string | null; error: string | null;
  join(p: { code: string; displayName: string; clubId: string; managerId?: string }): void;
  start(): void;
  openListing(playerId: string): void;          // pool claim or own-player release only
  challenge(playerId: string, amount: number): void; // rival-owned player; amount required, must exceed listed value
  bid(contestId: string, amount: number): void;
}

export function makeStore(t: Transport) {
  const store = createStore<UiState>((set, get) => ({
    room: null, managerId: null, error: null,
    join: (p) => t.emit("join", p),
    start: () => t.emit("start", { code: get().room?.code }),
    openListing: (playerId) => t.emit("openListing", { code: get().room?.code, playerId }),
    challenge: (playerId, amount) => t.emit("challenge", { code: get().room?.code, playerId, amount }),
    bid: (contestId, amount) => t.emit("bid", { code: get().room?.code, contestId, amount }),
  }));
  t.on("state", (room: RoomState) => store.setState({ room }));
  t.on("joined", ({ managerId }: { managerId: string }) => {
    store.setState({ managerId });
    localStorage.setItem("fcdn.managerId", managerId); // reconnection
  });
  t.on("error", (msg: string) => store.setState({ error: msg }));
  return store;
}
```
- [ ] **Step 4: Add** a React hook `useUi` in the same file wrapping the vanilla store with `useStore`. And a real transport factory `connect(url)` returning a `socket.io-client` socket typed as `Transport`.
- [ ] **Step 5:** Run — PASS
- [ ] **Step 6:** `git commit -am "feat(web): socket store applying broadcasts + emitting intents, managerId persistence"`

---

## Task 3: Join screen

**Files:** Create `src/screens/Join.tsx`, `src/__tests__/join.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Join } from "../screens/Join.js";

test("entering code + name + club and submitting calls join once", async () => {
  const join = vi.fn();
  render(<Join join={join} takenClubs={[]} />);
  await userEvent.type(screen.getByLabelText(/room code/i), "AB12");
  await userEvent.type(screen.getByLabelText(/name/i), "Ana");
  await userEvent.click(screen.getByRole("button", { name: /real madrid/i }));
  await userEvent.click(screen.getByRole("button", { name: /^join$/i }));
  expect(join).toHaveBeenCalledWith({ code: "AB12", displayName: "Ana", clubId: "real" });
});

test("a taken club is disabled", () => {
  render(<Join join={() => {}} takenClubs={["real"]} />);
  expect(screen.getByRole("button", { name: /real madrid/i })).toBeDisabled();
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test join`
- [ ] **Step 3: Implement** `src/screens/Join.tsx` — controlled inputs for code + name, a club picker (`arsenal/bayern/real/barca/city` with labels), disable clubs in `takenClubs`, submit calls `join({code, displayName, clubId})`. Minimal styling; phone-width layout.
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(web): Join screen (code + name + club picker with taken-club guard)"`

---

## Task 4: Setup screen (host)

**Files:** Create `src/screens/Setup.tsx`, `src/__tests__/setup.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Setup } from "../screens/Setup.js";

test("budget below the floor shows an error and blocks start", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} managerCount={5} />);
  const input = screen.getByLabelText(/total budget/i);
  await userEvent.clear(input); await userEvent.type(input, "500");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(screen.getByText(/below the floor/i)).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
});

test("valid budget starts the draft with chosen timers", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} managerCount={5} />);
  const input = screen.getByLabelText(/total budget/i);
  await userEvent.clear(input); await userEvent.type(input, "600");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalled();
});
```
> Note: budget/floor are set at room creation (Plan 2). Setup here validates client-side before the host emits `create`/`start`. If room creation already happened at Join, the budget field lives on a pre-create host form; adjust `onStart`/`onCreate` naming to match the actual flow decided in Task 8 wiring. Keep the floor guard regardless.
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test setup`
- [ ] **Step 3: Implement** `src/screens/Setup.tsx` — total-budget input (guarded ≥ floor), quote-timer select (default 5 min), optional squad-size cap, a lobby list of joined managers, and a Start button disabled until valid.
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(web): host Setup screen with budget-floor guard + timer/cap config"`

---

## Task 5: ContestCard with live countdown

**Files:** Create `src/components/ContestCard.tsx`, `src/lib/format.ts`, `src/__tests__/contestCard.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContestCard } from "../components/ContestCard.js";

const contest = { id: "c1", playerId: "haaland", type: "war", status: "war", listerId: null,
  quotes: [{ managerId: "city", amount: 205, at: 0 }], quoteCounts: { city: 2 }, closesAt: 300_000 };
const player = { id: "haaland", name: "Erling Haaland", position: "FWD", listedValue: 205, originalValue: 180, ownerId: null, lockedThisSeason: false };

test("shows player, top bid, and a countdown derived from closesAt - now", () => {
  render(<ContestCard contest={contest as any} player={player as any} now={60_000} myId="bay" myQuotesUsed={0} onBid={() => {}} />);
  expect(screen.getByText(/Erling Haaland/)).toBeTruthy();
  expect(screen.getByText(/205/)).toBeTruthy();
  expect(screen.getByText(/4:00/)).toBeTruthy(); // (300000-60000)/1000 = 240s = 4:00
});

test("a raise button emits a bid above the current top", async () => {
  const onBid = vi.fn();
  render(<ContestCard contest={contest as any} player={player as any} now={0} myId="bay" myQuotesUsed={0} onBid={onBid} />);
  await userEvent.click(screen.getByRole("button", { name: /raise/i }));
  expect(onBid).toHaveBeenCalledWith("c1", expect.any(Number));
});

test("raise is disabled once the manager has used two quotes", () => {
  render(<ContestCard contest={contest as any} player={player as any} now={0} myId="city" myQuotesUsed={2} onBid={() => {}} />);
  expect(screen.getByRole("button", { name: /raise/i })).toBeDisabled();
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test contestCard`
- [ ] **Step 3: Implement** `src/lib/format.ts` (`money(n)`, `mmss(ms)`) and `ContestCard.tsx`: renders player name/position, top bid, a `mmss(closesAt - now)` countdown, and a Raise input+button that calls `onBid(contest.id, amount)` where the default amount is `topBid + 1`; disable Raise when `myQuotesUsed >= 2` or player `lockedThisSeason`.
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(web): ContestCard with per-contest countdown + quote-capped raise"`

---

## Task 6: PoolList (search + list/challenge actions)

**Design (corrected — see the drift note at the top of this doc):** this is a full player browser, not just a pool list — a freshly-created room has no pool players at all, only the 5 clubs' owned squads, until the host curates a pool separately (`searchCatalog`/`setPool`, Plan 2 Task 9). So `PoolList` renders whatever's in `room.players` (owned + any curated pool) and picks the action per-player: an **unowned** player (`ownerId === null`) is a one-click claim (`onList(playerId)`, server locks it in at listed value via `openListing`); an **owned** (rival) player requires the user to enter a bid amount first, then calls `onChallenge(playerId, amount)` (server's `challenge` command, amount must exceed listed value). You never challenge your own player from here (that's the release flow, a separate action not covered by this task).

**Files:** Create `src/components/PoolList.tsx`, `src/__tests__/poolList.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoolList } from "../components/PoolList.js";

const players = {
  haaland: { id: "haaland", name: "Erling Haaland", position: "FWD", listedValue: 180, ownerId: null },
  mbappe:  { id: "mbappe",  name: "Kylian Mbappé", position: "FWD", listedValue: 200, ownerId: "m_real" },
};

test("search filters the list by name", async () => {
  render(<PoolList players={players as any} myId="m_bay" onList={() => {}} onChallenge={() => {}} />);
  await userEvent.type(screen.getByPlaceholderText(/search/i), "haal");
  expect(screen.getByText(/Haaland/)).toBeTruthy();
  expect(screen.queryByText(/Mbappé/)).toBeNull();
});

test("clicking an unowned player claims it at listed value", async () => {
  const onList = vi.fn();
  render(<PoolList players={players as any} myId="m_bay" onList={onList} onChallenge={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Haaland/ }));
  expect(onList).toHaveBeenCalledWith("haaland");
});

test("a rival-owned player opens a bid-amount input, then calls onChallenge", async () => {
  const onChallenge = vi.fn();
  render(<PoolList players={players as any} myId="m_bay" onList={() => {}} onChallenge={onChallenge} />);
  await userEvent.click(screen.getByRole("button", { name: /Mbappé/ })); // owned by m_real, not me
  const input = screen.getByLabelText(/bid amount/i);
  await userEvent.type(input, "210");
  await userEvent.click(screen.getByRole("button", { name: /challenge/i }));
  expect(onChallenge).toHaveBeenCalledWith("mbappe", 210);
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test poolList`
- [ ] **Step 3: Implement** `PoolList.tsx` — search box, filtered list showing name/position/value and owner (or "pool"). An unowned player is a single-click button calling `onList(playerId)`. An owned player belonging to a rival (`ownerId !== myId && ownerId !== null`) is a button that reveals an inline bid-amount input + "Challenge" submit, calling `onChallenge(playerId, amount)` (validate `amount > listedValue` client-side as a UX nicety, but the server is the source of truth and will reject an invalid amount via the `error` channel regardless). A player owned by `myId` renders as non-actionable here (release is a separate flow). Show a small "owned by X" tag; the 3-per-rival challenge-limit guard is enforced server-side and surfaced via the `error` channel — no client-side tracking needed here (that's `ChallengeTracker`, Task 7).
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(web): searchable PoolList with list/challenge action"`

---

## Task 7: BudgetBars · ChallengeTracker · DraftLog

**Files:** Create the three components + `src/__tests__/panels.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetBars } from "../components/BudgetBars.js";
import { ChallengeTracker } from "../components/ChallengeTracker.js";
import { DraftLog } from "../components/DraftLog.js";

const managers = {
  m_city: { id: "m_city", displayName: "City", clubId: "city", reserved: 300, spendable: 34 },
  m_bay:  { id: "m_bay",  displayName: "Bayern", clubId: "bayern", reserved: 200, spendable: 350 },
};

test("budget bars render each manager's spendable", () => {
  render(<BudgetBars managers={managers as any} totalBudget={600} />);
  expect(screen.getByText(/City/)).toBeTruthy();
  expect(screen.getByText(/34/)).toBeTruthy();
});

test("challenge tracker shows used/remaining per rival", () => {
  render(<ChallengeTracker challenges={{ "m_bay->m_real": 2 }} myId="m_bay" managers={{ m_real: { displayName: "Real" } } as any} />);
  expect(screen.getByText(/Real/)).toBeTruthy();
  expect(screen.getByText(/2\s*\/\s*3/)).toBeTruthy();
});

test("draft log renders newest entries", () => {
  render(<DraftLog log={[{ t: "win", at: 1, contestId: "c1", managerId: "m_city", playerId: "pedri", price: 90 }] as any} players={{ pedri: { name: "Pedri" } } as any} managers={managers as any} />);
  expect(screen.getByText(/Pedri/)).toBeTruthy();
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test panels`
- [ ] **Step 3: Implement** the three components:
  - `BudgetBars`: one bar per manager, width ∝ `spendable/totalBudget`, label with name + `money(spendable)`; highlight low budgets.
  - `ChallengeTracker`: for `myId`, list each rival with `count/3` used from `challenges[`${myId}->${rivalId}`]`.
  - `DraftLog`: render `log` newest-first, formatting each `LogEntry` variant into a readable line (win/bid/release/void/fine/listing).
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(web): budget bars, challenge tracker, draft log panels"`

---

## Task 8: DraftBoard assembly + challenge alert + live wiring

**Files:** Create `src/screens/DraftBoard.tsx`, `src/components/ChallengeAlert.tsx`, wire `App.tsx`; `src/__tests__/draftBoard.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DraftBoard } from "../screens/DraftBoard.js";

function room() {
  return {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs: 3_600_000, squadSizeCap: null,
    seasonNumber: 1, status: "live", startedAt: 0,
    managers: { m_real: { id: "m_real", displayName: "Real", clubId: "real", reserved: 425, spendable: 175 } },
    players: { mbappe: { id: "mbappe", name: "Kylian Mbappé", position: "FWD", listedValue: 200, originalValue: 200, ownerId: "m_real", lockedThisSeason: false } },
    contests: { c1: { id: "c1", playerId: "mbappe", type: "war", status: "war", listerId: "m_bar", quotes: [{ managerId: "m_bar", amount: 220, at: 0 }], quoteCounts: { m_bar: 1 }, closesAt: 300_000 } },
    challenges: {}, log: [], seq: 1,
  };
}

test("an alert appears when one of my players is under challenge", () => {
  render(<DraftBoard room={room() as any} myId="m_real" now={0} actions={{ bid: () => {}, openListing: () => {}, challenge: () => {} }} />);
  expect(screen.getByText(/your player .* challenged/i)).toBeTruthy();
  expect(screen.getByText(/Mbappé/)).toBeTruthy();
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test draftBoard`
- [ ] **Step 3: Implement**
  - `ChallengeAlert.tsx`: given the room + `myId`, find contests on players I own where the top bid isn't mine → banner "Your player X is being challenged" with a Defend action (raise on that contest).
  - `DraftBoard.tsx`: lay out — top: `ChallengeAlert` + `BudgetBars`; main: contests grid (`ContestCard` per open contest, feeding `myQuotesUsed = contest.quoteCounts[myId] ?? 0`); side: `PoolList`, `ChallengeTracker`, `DraftLog`. A `now` prop drives countdowns; in the live app, tick `now` with a 1s interval in `App`.
  - `App.tsx`: pick screen by state — no room → Join; `status==="setup"` and host → Setup; `status==="live"` → DraftBoard. Subscribe to the socket store; maintain a `now` clock.
- [ ] **Step 4:** Run — PASS. Full suite: `pnpm -C packages/web test`
- [ ] **Step 5: Manual live check** — `pnpm -C packages/server dev` + `pnpm -C packages/web dev`; open five browser tabs, join distinct clubs, start, place a bid; confirm it appears in every tab within ~1s.
- [ ] **Step 6:** `git commit -am "feat(web): DraftBoard assembly, challenge alert, App routing + live now-clock"`

---

## Task 9: Pool Builder (host curates the pool from the FC 26 catalog)

**Model:** the pool isn't hard-coded — before starting, the host searches the full FC 26 catalog (server-side) and selects which non-club players are in play. Client emits `searchCatalog`, renders `catalogResults`, and emits `setPool` with the chosen ids.

**Files:** Create `src/components/PoolBuilder.tsx`, `src/__tests__/poolBuilder.test.tsx`; wire into `Setup.tsx`; add `search`/`setPool` actions to `state/socket.ts`.

- [ ] **Step 1: Failing test**
```tsx
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoolBuilder } from "../components/PoolBuilder.js";

const results = [
  { id: "l1", name: "F. Wirtz", position: "MID", value: 150.5, club: "Liverpool", clubId: null },
  { id: "l2", name: "A. Isak", position: "FWD", value: 111, club: "Liverpool", clubId: null },
];

test("typing a query calls search; picking players and confirming emits the chosen ids", async () => {
  const onSearch = vi.fn(), onConfirm = vi.fn();
  render(<PoolBuilder results={results as any} selected={[]} onSearch={onSearch} onToggle={() => {}} onConfirm={onConfirm} />);
  await userEvent.type(screen.getByPlaceholderText(/search the fc 26 catalog/i), "wirtz");
  expect(onSearch).toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /confirm pool/i }));
  expect(onConfirm).toHaveBeenCalled();
});

test("selected players show a running count", () => {
  render(<PoolBuilder results={results as any} selected={["l1"]} onSearch={() => {}} onToggle={() => {}} onConfirm={() => {}} />);
  expect(screen.getByText(/1 selected/i)).toBeTruthy();
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test poolBuilder`
- [ ] **Step 3: Implement** `PoolBuilder.tsx` — a search box (debounced → `onSearch({q,position,club})`), a results list (name · club · position · €value) each with an add/remove toggle (`onToggle(id)`), a running "N selected" count with the picked chips, and a "Confirm pool" button (`onConfirm(selectedIds)`). Add `search(q)` and `setPool(ids)` to the socket store (emit `searchCatalog`/`setPool`; store `catalogResults` from the broadcast).
- [ ] **Step 4:** Mount `PoolBuilder` in `Setup.tsx` above Start; Start stays disabled until the host has confirmed a pool (or explicitly chosen an empty pool). Run — PASS.
- [ ] **Step 5:** `git commit -am "feat(web): host Pool Builder — search FC26 catalog + set draft pool"`

---

## Self-review

- **Join / Setup / Draft Board** → Tasks 3, 4, 8. ✅
- **Host Pool Builder (FC26 catalog → curated pool)** → Task 9. ✅
- **Player pool (searchable, position+value)** → Task 6. ✅
- **Budget tracker + live bars** → Task 7. ✅
- **Bid flow + instant challenge alert** → Tasks 5, 8. ✅
- **Retention/listing + per-quote countdown** → Task 5 (countdown), server owns windows. ✅
- **Challenge-limit tracker** → Task 7. ✅
- **Draft log** → Task 7. ✅
- **Live sync <~1s** → Task 2 store + Task 8 manual check. ✅
- **Reconnection** → Task 2 persists `managerId`; Join passes it back. ✅
- **Consistency:** `makeStore(transport)`, `RoomState`/`Contest`/`Manager` from `@fcdn/shared`, `onBid(contestId, amount)`, `onList(playerId)`, `onChallenge(playerId, amount)`, `now` prop for countdowns used identically across components.
- **Actual server socket contract (confirmed against the running Plan 2 implementation):** emits accepted: `join`, `start`, `openListing({code,playerId})`, `challenge({code,playerId,amount})`, `bid({code,contestId,amount})`, `searchCatalog({q?,position?,club?,limit?})`, `setPool({code,ids})`, `exportSeason({code})`, `importSeason({code,csv,base,step})`. Events received: `state` (full `RoomState`), `joined({managerId})`, `error(message: string)`, `catalogResults(SeedPlayer[])`, `seasonExport({csv,filename})`.
