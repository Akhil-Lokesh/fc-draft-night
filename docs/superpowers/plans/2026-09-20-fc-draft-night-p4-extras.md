# FC Draft Night — Plan 4: Confirmed Extras (formation · challenge history · recap · analytics)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Prerequisite:** Plans 1–3 complete. `RoomState.log` carries every `LogEntry`; the Draft Board is live.

**Goal:** Ship the confirmed post-MVP features: a squad + formation pitch view, challenge history (per player and per team), an auto-generated recap card, and a full analytics dashboard — all derived from `RoomState` + `log`.

**Architecture:** All analytics are **pure selectors** over `RoomState`/`log`, unit-tested independently of React. Components render selector output. No server changes — the log already captures everything.

**Tech Stack:** TypeScript selectors in `@fcdn/shared` (reused by future export) · React components in `@fcdn/web`.

**Spec:** §8 (screens 4–5) + feature→screen map.

---

## File structure

```
packages/shared/src/domain/analytics.ts     # pure selectors over RoomState + log
packages/shared/src/__tests__/analytics.test.ts
packages/web/src/screens/Squad.tsx
packages/web/src/screens/Recap.tsx
packages/web/src/components/FormationPitch.tsx
packages/web/src/components/ChallengeHistory.tsx
packages/web/src/components/RecapCard.tsx
packages/web/src/components/AnalyticsDashboard.tsx
packages/web/src/__tests__/{squad,recap,analyticsView}.test.tsx
```

---

## Task 1: Analytics selectors (pure, in shared)

**Files:** Create `packages/shared/src/domain/analytics.ts`, `packages/shared/src/__tests__/analytics.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { recapHighlights, spendByManager, playerTrail, teamContests, mostContested } from "../domain/analytics.js";
import type { RoomState, LogEntry } from "../domain/types.js";

const log: LogEntry[] = [
  { t: "listing", at: 0, managerId: "m_ars", playerId: "wirtz", price: 60, kind: "pool-listing" },
  { t: "bid", at: 10, contestId: "c1", managerId: "m_city", amount: 181 },
  { t: "bid", at: 20, contestId: "c1", managerId: "m_bay", amount: 220 },
  { t: "win", at: 30, contestId: "c1", managerId: "m_bay", playerId: "haaland", price: 220 },
  { t: "win", at: 40, contestId: "c2", managerId: "m_ars", playerId: "wirtz", price: 60 },
];
const players = { wirtz: { originalValue: 60, listedValue: 60 }, haaland: { originalValue: 180, listedValue: 220 } };

test("spendByManager sums win prices per buyer", () => {
  const s = { log, players } as unknown as RoomState;
  expect(spendByManager(s)).toMatchObject({ m_bay: 220, m_ars: 60 });
});

test("recapHighlights surfaces most spent + biggest overpay above original value", () => {
  const s = { log, players } as unknown as RoomState;
  const h = recapHighlights(s);
  expect(h.mostSpent.managerId).toBe("m_bay");
  expect(h.biggestOverpay.playerId).toBe("haaland"); // paid 220 vs original 180 = +40
});

test("playerTrail returns every quote for one player's contest, in order", () => {
  const s = { log, players } as unknown as RoomState;
  expect(playerTrail(s, "c1").map(b => b.amount)).toEqual([181, 220]);
});

test("mostContested ranks players by number of distinct bidders", () => {
  const s = { log, players } as unknown as RoomState;
  expect(mostContested(s)[0].contestId).toBe("c1");
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/shared test analytics`
- [ ] **Step 3: Implement** `analytics.ts`
```ts
import type { RoomState, LogEntry } from "./types.js";

export function spendByManager(s: RoomState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of s.log) if (e.t === "win") out[e.managerId] = (out[e.managerId] ?? 0) + e.price;
  return out;
}

export function playerTrail(s: RoomState, contestId: string): { managerId: string; amount: number; at: number }[] {
  return s.log.filter((e): e is Extract<LogEntry, { t: "bid" }> => e.t === "bid" && e.contestId === contestId)
    .map(e => ({ managerId: e.managerId, amount: e.amount, at: e.at }));
}

export function teamContests(s: RoomState, managerId: string) {
  const started = s.log.filter(e => e.t === "listing" && e.managerId === managerId);
  const won = s.log.filter(e => e.t === "win" && e.managerId === managerId);
  const joined = new Set(s.log.filter(e => e.t === "bid" && e.managerId === managerId).map(e => (e as any).contestId));
  return { started, won, joined: [...joined] };
}

export function mostContested(s: RoomState): { contestId: string; bidders: number }[] {
  const byContest = new Map<string, Set<string>>();
  for (const e of s.log) if (e.t === "bid") (byContest.get(e.contestId) ?? byContest.set(e.contestId, new Set()).get(e.contestId)!).add(e.managerId);
  return [...byContest.entries()].map(([contestId, set]) => ({ contestId, bidders: set.size }))
    .sort((a, b) => b.bidders - a.bidders);
}

export function recapHighlights(s: RoomState) {
  const spend = spendByManager(s);
  const mostSpent = Object.entries(spend).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const wins = s.log.filter((e): e is Extract<LogEntry, { t: "win" }> => e.t === "win");
  const withDelta = wins.map(w => ({ ...w, delta: w.price - (s.players[w.playerId]?.originalValue ?? w.price) }));
  const biggestOverpay = [...withDelta].sort((a, b) => b.delta - a.delta)[0];
  const bestBargain = [...withDelta].sort((a, b) => a.delta - b.delta)[0];
  return {
    mostSpent: { managerId: mostSpent[0], amount: mostSpent[1] as number },
    biggestOverpay, bestBargain,
  };
}
```
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(analytics): pure selectors (spend, trails, most-contested, recap highlights)"`

---

## Task 2: Formation pitch view

**Files:** Create `packages/web/src/components/FormationPitch.tsx`, `src/screens/Squad.tsx`, `src/__tests__/squad.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Squad } from "../screens/Squad.js";

const room = {
  players: {
    mbappe: { id: "mbappe", name: "Kylian Mbappé", position: "FWD", ownerId: "m_real", listedValue: 200 },
    bell:   { id: "bell",   name: "Bellingham",     position: "MID", ownerId: "m_real", listedValue: 170 },
    rudi:   { id: "rudi",   name: "Rüdiger",        position: "DEF", ownerId: "m_real", listedValue: 40 },
    court:  { id: "court",  name: "Courtois",       position: "GK",  ownerId: "m_real", listedValue: 35 },
    haaland:{ id: "haaland",name: "Haaland",        position: "FWD", ownerId: "m_city",listedValue: 180 },
  },
};

test("squad view groups a manager's players by position line", () => {
  render(<Squad room={room as any} managerId="m_real" />);
  expect(screen.getByText(/Mbappé/)).toBeTruthy();
  expect(screen.getByText(/Courtois/)).toBeTruthy();
  expect(screen.queryByText(/Haaland/)).toBeNull(); // not this manager's
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test squad`
- [ ] **Step 3: Implement** `FormationPitch.tsx` — a CSS pitch with four rows (GK/DEF/MID/FWD); place the manager's owned players onto their row as chips (name + value). `Squad.tsx` selects `players` where `ownerId === managerId`, passes to the pitch. Display-only, no validation (per spec).
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(web): squad + formation pitch view (display-only)"`

---

## Task 3: Challenge history

**Files:** Create `src/components/ChallengeHistory.tsx`, `src/__tests__/challengeHistory.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChallengeHistory } from "../components/ChallengeHistory.js";

const room = {
  log: [
    { t: "bid", at: 10, contestId: "c1", managerId: "m_city", amount: 181 },
    { t: "bid", at: 20, contestId: "c1", managerId: "m_bay", amount: 220 },
    { t: "win", at: 30, contestId: "c1", managerId: "m_bay", playerId: "haaland", price: 220 },
  ],
  players: { haaland: { name: "Haaland" } },
  managers: { m_city: { displayName: "City" }, m_bay: { displayName: "Bayern" } },
};

test("clicking a player shows its full bid trail with final price", () => {
  render(<ChallengeHistory room={room as any} contestId="c1" />);
  expect(screen.getByText(/181/)).toBeTruthy();
  expect(screen.getByText(/220/)).toBeTruthy();
  expect(screen.getByText(/Bayern/)).toBeTruthy();
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test challengeHistory`
- [ ] **Step 3: Implement** `ChallengeHistory.tsx` — uses `playerTrail(room, contestId)` and `teamContests` from `@fcdn/shared/analytics`; renders an ordered list of quotes (bidder name + amount) ending in the win price. A companion mode keyed by `managerId` lists every contest that team started/joined/won/lost.
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(web): challenge history (per-player trail + per-team contests)"`

---

## Task 4: Recap card

**Files:** Create `src/components/RecapCard.tsx`, `src/__tests__/recap.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecapCard } from "../components/RecapCard.js";

const room = {
  log: [
    { t: "win", at: 30, contestId: "c1", managerId: "m_bay", playerId: "haaland", price: 220 },
    { t: "win", at: 40, contestId: "c2", managerId: "m_ars", playerId: "wirtz", price: 60 },
  ],
  players: { haaland: { name: "Haaland", originalValue: 180 }, wirtz: { name: "Wirtz", originalValue: 60 } },
  managers: { m_bay: { displayName: "Bayern" }, m_ars: { displayName: "Arsenal" } },
};

test("recap card shows most spent, biggest overpay, best bargain", () => {
  render(<RecapCard room={room as any} />);
  expect(screen.getByText(/most spent/i)).toBeTruthy();
  expect(screen.getByText(/Bayern/)).toBeTruthy(); // most spent + biggest overpay (Haaland +40)
  expect(screen.getByText(/best bargain/i)).toBeTruthy();
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test recap`
- [ ] **Step 3: Implement** `RecapCard.tsx` — call `recapHighlights(room)`; render three tiles (Most Spent, Biggest Overpay, Best Bargain) with manager/player names resolved from `room`.
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(web): end-of-draft recap card"`

---

## Task 5: Analytics dashboard + Recap screen assembly

**Files:** Create `src/components/AnalyticsDashboard.tsx`, `src/screens/Recap.tsx`, `src/__tests__/analyticsView.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Recap } from "../screens/Recap.js";

const room = {
  status: "closed",
  log: [
    { t: "bid", at: 10, contestId: "c1", managerId: "m_city", amount: 181 },
    { t: "bid", at: 20, contestId: "c1", managerId: "m_bay", amount: 220 },
    { t: "win", at: 30, contestId: "c1", managerId: "m_bay", playerId: "haaland", price: 220 },
  ],
  players: { haaland: { name: "Haaland", originalValue: 180 } },
  managers: { m_city: { displayName: "City", reserved: 0, spendable: 100 }, m_bay: { displayName: "Bayern", reserved: 220, spendable: 350 } },
};

test("recap screen renders final squads, recap card, and spend-per-manager", () => {
  render(<Recap room={room as any} />);
  expect(screen.getByText(/final squads/i)).toBeTruthy();
  expect(screen.getByText(/most contested/i)).toBeTruthy();
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test analyticsView`
- [ ] **Step 3: Implement**
  - `AnalyticsDashboard.tsx`: sections built from selectors — spend efficiency per manager (`spendByManager` vs players won), a bid timeline (all `bid`/`win` entries by `at`), most-contested players (`mostContested`), and bargains/overpays (from `recapHighlights` extended to full sorted lists).
  - `Recap.tsx`: final squads (players grouped by `ownerId`) + `RecapCard` + `AnalyticsDashboard` + a placeholder for the season-export button (implemented in Plan 5). Reachable from the Draft Board when `room.status === "closed"`.
- [ ] **Step 4:** Run — PASS. Full suites: `pnpm -r test`
- [ ] **Step 5:** `git commit -am "feat(web): analytics dashboard + Recap screen (final squads, recap, stats)"`

---

## Self-review

- **Squad + formation view** → Task 2. ✅
- **Challenge history (player + team)** → Task 3 (+ selectors Task 1). ✅
- **Draft recap card** → Task 4. ✅
- **Complete analytics** (spend efficiency, timeline, most-contested, bargains/overpays) → Tasks 1, 5. ✅
- **Final squads** → Task 5. ✅
- **No server changes needed** — all from `log`. ✅
- **Consistency:** selector names `spendByManager`/`playerTrail`/`teamContests`/`mostContested`/`recapHighlights` are defined once (Task 1) and consumed unchanged by Tasks 3–5.
