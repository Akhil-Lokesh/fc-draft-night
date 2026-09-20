# FC Draft Night — Design Spec

**Date:** 2026-09-20
**Status:** Approved (design), pending implementation plan
**Source pitch:** `Initial Pitch/FC Draft Night - Initial Pitch.md`, `Initial Pitch/FC Draft Night - The Story.md`

## 1. Summary

A live, real-time auction-draft web app for FC 26/27 custom tournaments. Five friends each control one real club and rebuild their squads through competitive bidding before playing the tournament in-game. It fixes the two gaps the in-game custom setup can't cover: a shared budget with real stakes, and the ability to fight over the same star player instead of one person picking a club and taking its stars uncontested.

The app runs one draft per season inside a fixed one-hour window. Squads carry over between seasons and prices evolve, giving a running storyline across nights.

## 2. Decisions (locked)

| Decision | Choice |
| --- | --- |
| Scope | 8 MVP features **+** all "Confirmed for the build" extras. Deferred: spectator/TV view, multi-night leaderboard, squad export checklist. |
| Backend | Node + TypeScript authoritative server; Socket.IO real-time; single serialized command queue. |
| Frontend | React + Vite + TypeScript; Socket.IO client; phone-first responsive. |
| Persistence | SQLite for live draft + season state (crash/reconnect recovery); season handoff via export/import file. |
| Player data | Full **EA FC 26** player database (18,405 players, `value_eur` as listed value). The 5 clubs get their real in-game rosters; the pool is host-curated from the full catalog. Source of truth so drafted squads map 1:1 into the game. See `packages/server/src/data/fc26-data.sources.md`. |
| Value basis | Each player's FC 26 in-game transfer value (`value_eur`, stored as €M). |
| Pool model | Host pre-curates the pool: searches the full FC 26 catalog before the draft and hand-picks which non-club players are in play. |
| Hosting | Deployed public URL — server on Render/Fly (persistent process + volume), frontend on Vercel. Join by room code from any phone. |
| Squad-composition rules | No minimums; spending optional. Formation view is display-only, no position validation. Draft ends on the 1-hour clock, or early if all managers opt out / a group-agreed squad-size cap is reached. |
| Host | The host is also one of the five managers. |
| Identity | No accounts. Join by room code + display name + club pick. Reconnection restores the same manager slot. |

## 3. Architecture

Authoritative server owns all game state; phones are thin clients rendering broadcast state and sending intents.

```
Clients (5 phones + optional TV)          Authoritative server (Node/TS)                 Persistence
  React + Vite + TS            ⇄  ① single serialized command queue (no races)   ⇄   SQLite (live state,
  Socket.IO client               ② rules engine (pure / deterministic)              crash/reconnect recovery)
  Join · Board · Squad · Recap   ③ timers (2-min listing, 5-min anti-snipe, 1-hr)   Season export/import file
```

**Command pipeline (every state change):** `command → validate (rules engine) → apply → persist (SQLite) → broadcast state diff to all clients`.

**Why a single serialized queue:** the rules require ordered, atomic resolution of concurrent events — "deals honored in the order they close", void-to-runner-up, the 25M overcommitment fine, negative-balance unwinds. All bids, listing expirations, anti-snipe fires, and the draft clock are pushed onto one ordered stream processed by a single Node process. This eliminates race conditions and makes resolution deterministic and replayable.

## 4. Rules engine (pure, deterministic, I/O-free module)

Isolated from sockets and DB so it is exhaustively unit-testable. It is the heart of the system.

### 4.1 Budget
- On room start, each club's **reserved** = Σ listed values of its real starting squad (player by player, from the dataset). **Spendable** = total budget − reserved.
- **Budget floor:** host's total budget must be ≥ the priciest real squad's value, rounded up to a clean number (e.g. priciest 545M → floor 600M). The app blocks a lower total.
- **Cost of acting:** defending an owned player costs `bid − listedValue`; acquiring any player not already owned (rival's or pool) costs the full `bid`. A manager can never submit a quote whose cost exceeds remaining spendable — blocked outright.

### 4.2 Listing — the 2-minute window
- Every acquisition attempt starts as a listing with a 2-minute countdown.
  - **Pool player:** manager lists a direct offer at the player's listed price.
  - **Release own player:** owner lists the player back at that player's own listed value.
- If uncontested at expiry, it locks automatically — pool player joins the lister's squad at listed price; released player becomes an unowned pool player at his listed value.
- If challenged inside the 2 minutes, it escalates into a bidding war. The original listing price counts as the lister's **quote #1** (they get exactly one more raise).

### 4.3 Bidding war
- Any number of the five managers (up to all five) may join one contest; no turn order.
- **Minimum bid:** any contested bid must be strictly greater than the player's current listed value (never equal). Does not apply to an uncontested listing lock-in.
- **Quote cap:** each manager gets at most **2 quotes** per contest (opener + one raise). Once used, they're done for that contest even if the leading bid is later voided.
- **Close conditions:** 5-minute anti-snipe timer of silence (every new quote from anyone resets it), or the 1-hour draft clock — whichever first. Top bid at close wins.

### 4.4 Concurrency, ordered closes, overcommitment
- Contests run in parallel, each on its own independent timer.
- A manager may be the top bidder in more than one contest for more than they hold.
- When contests close, they resolve in **close order**:
  - First close deducts its cost from spendable normally.
  - Any later close the manager can no longer afford is **voided**: the player goes to the **runner-up** (next-highest standing bid in that same contest, at their bid, from their spendable); else reverts to the **previous owner** untouched; else to the **pool**.
  - The overcommitting manager takes a flat **25M fine** against spendable.
- **Going negative (any cause):** same unwind — the offending transaction reverts to the next claim, plus the flat 25M fine. If 25M still isn't available after the release, the manager releases additional own players (their choice) back to the pool at those players' locked-in listed value, one at a time, until the fine is fully covered.

### 4.5 Selling / cashing in
- A manager who loses an owned player (stops bidding, can't cover, or is outbid) does **not** receive the buyer's price. Instead the amount they had **reserved** for that player (its listed value) is released back into their own spendable.
- The buyer separately pays the full final price from their spendable. The premium above listed value goes to no one.
- In a multi-way fight, only the original owner ever gets a release; outbid non-owners spent nothing and get nothing. Pool players release nothing to anyone.

### 4.6 Challenge limit
- Each manager may start at most **3 challenges** against any one specific rival's currently-owned squad per season. Tracked one-directional per pair (Arsenal→Bayern is separate from Bayern→Arsenal).
- Counts only challenges initiated against a rival's **owned** players; pool players never consume it.
- Resets at the start of each new season's draft.

### 4.7 Player lock
- Once a contest resolves, the winner keeps the player for the rest of the season. No one (including losers) can re-challenge until next season. A player changes hands at most once per season.

### 4.8 Draft clock
- Fixed one-hour window. Each quote has its own short countdown (default 5 min, adjustable). A countdown running out = a pass; current bid stands. Every new quote restarts that contest's countdown.
- When the hour ends, the draft closes immediately; any live contest is decided at the last bid on the table.
- The draft ends when the hour runs out, or earlier if every manager has exhausted spendable or reached the agreed squad-size cap.

### 4.9 Season carryover
- Squads carry over as-is; no reset to real rosters.
- The price a player actually changed hands at becomes their new **listed value** permanently (Kane at 101M is now worth 101M, not 100M) — for reserved budget and for future challenges.
- A successful **defense** also permanently raises that player's listed value to the defended price.
- Leftover spendable carries forward on top of next season's base budget.
- **Renew or release:** to keep a held player, his club re-pays the locked-in price next season (or higher if challenged); or releases him to his **original dataset value**, available to anyone (including his old club) via the listing window.
- **Season-end handoff:** app exports the full draft (every listing, war, final squads, spendable) with blank fields for finishing order. Host fills finishing positions and re-uploads at the next draft. Finishing position sets each manager's new base budget in **20M increments** from the bottom up (e.g. 600M base, five teams: 5th 600M, 4th 620M, 3rd 640M, 2nd 660M, 1st 680M). Leftover spendable adds on top.
- **Reserved outgrows new budget:** if a club's reserved cost exceeds their new total at handoff, resolve like a negative balance — release players to the pool at current listed value until reserved fits, plus the 25M fine.

### 4.10 Data values & refresh
- Prices from the EA FC 26 database (`value_eur`). Club rosters only, never national teams (avoids a player appearing twice).
- Priciest pool player ≈ half a typical club's spendable; the rest scale down in proportion to real-world value so an outright pool signing stays affordable.
- Market values refresh once per season, right before the draft opens, for any player whose price hasn't been set by an in-draft transaction. Once a draft is live, values are locked; a price only moves from an actual bid.

## 5. Acceptance fixtures (from the pitch)

These worked examples are encoded as deterministic tests against the rules engine:
1. **Mbappé defense** — incumbent defends paying only the increment above listed value; challengers hit their spendable ceiling first.
2. **Five-way Haaland fight** — City/Arsenal/Bayern use 2 quotes each, Barcelona 1, Real Madrid none; closes on 5-min silence at Bayern 220M.
3. **City double deal** — Pedri closes first and pays; Musiala can't be covered → voided → reverts to Bayern + 25M fine.
4. **Barcelona 3-challenge cap** — 3 challenges against Real Madrid exhausts the per-rival limit; 4th blocked even with budget left.
5. **Mock draft budget snapshot** — end-of-hour spendable totals per club match the pitch table.
6. **Season handoff** — export → finishing order → position-stepped base budget + leftover carry; permanent price updates.

## 6. Data model (SQLite)

- **Room** — id, code, totalBudget, quoteTimerSec (default 300), draftClockSec (3600), squadSizeCap (nullable), seasonNumber, status (setup / live / closed), startedAt.
- **Manager** — id, roomId, displayName, clubId, reserved, spendable, connectionStatus.
- **Player** — id, name, position, listedValue, originalDatasetValue, ownerId (nullable = pool), lockedThisSeason.
- **Contest** — id, roomId, playerId, type (pool-listing / release-listing / challenge / war), status (listing / war / closed / voided), topBidManagerId, topBidAmount, closesAt.
- **Quote** — id, contestId, managerId, amount, timestamp.
- **ChallengeCounter** — roomId, challengerId, rivalId, count.
- **LogEntry** — id, roomId, timestamp, type, payload (feeds the live draft log, analytics, and the season export).

## 7. Player data (EA FC 26)

Source of truth is the full EA FC 26 database so drafted squads map 1:1 into the game. Ingested by `scripts/ingest-fc26.mjs`; provenance in `packages/server/src/data/fc26-data.sources.md`.

- **`fc26-catalog.json`** (server-side, 18,405 players) — every player `{ id, name, position, value(€M), overall, club, clubId }`. `id` = FC `player_id`. The host's pool-pick universe + search source. Never bundled to the browser.
- **`squads.json`** (shared, 134 players) — the five clubs' real FC 26 rosters only (`clubId` set). Light; used for room-init squad assignment and tests.
- **Listed value** = FC in-game `value_eur` (stored as €M). **Position** = mapped from FC tokens (GK / DEF / MID / FWD).
- The 5 clubs hold their **full real roster** (24–30 players). Reserved = sum of that squad's values.
- **Pool = host pre-curated:** before the draft the host searches the catalog and selects which non-club players are in play. Only the 5 squads + curated pool enter room state and sync to phones.
- Derived: squad values €911M–€1424M → **budget floor €1500M**; priciest pool player €150.5M (Wirtz).

## 8. Screens

1. **Join** — room code + display name + pick club.
2. **Setup (host)** — set total budget (floor-enforced), quote timer, optional squad-size cap; **Pool builder** — search the full FC 26 catalog (by name / club / position / value) and select the players that form the draft pool → start draft.
3. **Draft Board (main live)** — parallel contests grid (each: player, top bid, per-contest countdown, my-quote status); searchable player pool; live budget bars for all five managers; my challenge-limit tracker per rival; live draft-log feed; actions (list / bid / raise / release) with an instant on-screen alert when one of my players is challenged.
4. **Squad / Formation** — pitch graphic that fills in as players are won (display-only).
5. **Recap / Analytics** — end-of-draft recap card (biggest steal, best bargain, most spent) + full analytics dashboard (spend efficiency, bid timeline, most-contested players, bargains/overpays) + season handoff export (CSV / PDF / Excel with blank finish fields) + re-upload importer.

### Feature → screen mapping (confirmed set)
| Feature | Where |
| --- | --- |
| Draft room / room code / budget setup | Join + Setup |
| Player pool (searchable, position + value) | Draft Board |
| Budget tracker + live budget bars | Draft Board |
| Bid flow + instant challenge alert | Draft Board |
| Retention / 2-min listing + 5-min anti-snipe window | Draft Board |
| Per-quote countdown timer | Draft Board |
| Challenge-limit tracker | Draft Board |
| Draft log (live feed) | Draft Board |
| Squad + formation view | Squad / Formation |
| Challenge history | Squad / Recap (click player/team) |
| Final squads | Recap |
| Draft recap card + complete analytics | Recap / Analytics |
| Season handoff export/import + carryover | Recap + Setup |

## 9. Build phases

- **P0 — Scaffold.** Monorepo (`/server`, `/web`, shared `/types`), tooling, CI, seed dataset + validation, deploy skeleton.
- **P1 — Rules engine.** Pure/deterministic module implementing every rule in §4. TDD, validated against all §5 fixtures.
- **P2 — Server.** Command queue, timers, Socket.IO, SQLite persistence, room lifecycle, reconnection.
- **P3 — Frontend core.** Join, Setup, Draft Board, live sync.
- **P4 — Confirmed extras.** Formation view, challenge history, budget bars, challenge tracker, countdown UI, recap + analytics.
- **P5 — Season handoff.** Export/import + carryover logic (position-stepped budgets, permanent price updates, renew/release).
- **P6 — Deploy + e2e polish.** Render/Fly + Vercel, end-to-end tests, phone-browser polish.

## 10. Out of scope (deferred)

Spectator/TV big-screen view, multi-night leaderboard, squad export checklist. Revisit after the confirmed set ships (the leaderboard fits naturally once seasons carry budget forward).

## 11. Testing strategy

- Rules engine: exhaustive unit tests, TDD; every §5 fixture is an acceptance test.
- Server: integration tests over socket flows and timer-driven closes; deterministic timers (injectable clock).
- Frontend: component tests for the Draft Board interactions; a scripted multi-client e2e replay of the mock draft.
