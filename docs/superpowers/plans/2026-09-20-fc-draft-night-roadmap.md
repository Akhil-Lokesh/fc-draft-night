# FC Draft Night — Implementation Roadmap

> Master roadmap. The build ships as six sequential plans; each produces working, testable software on its own. Full bite-sized detail lives in the per-phase plan files. Plan 1 is written in full; Plans 2–6 are outlined here and expanded to full detail when reached.
>
> **Status (as of the non-frontend execution pass):** Plans 1 and 2 are fully done and independently reviewed — `@fcdn/shared` (40 tests) and `@fcdn/server` (32 tests), both `pnpm -r build` clean. Plan 4 Task 1 (analytics), Plan 5 Tasks 1–3 (export/import/handoff), and Plan 6 Tasks 1/2/4 (env config, Dockerfile+Fly, CI) are also done. **Everything remaining is frontend** — Plan 3 entirely, Plan 4 Tasks 2–5, Plan 5 Task 4, and Plan 6 Tasks 3/5/6 (the last three blocked on Plan 3 since they need `packages/web` to exist). Each affected plan doc has its own `Status:` note near the top with specifics and any drift between the original doc text and what actually got built (mainly: the `Challenge` command is separate from `openListing`, not merged into it — see Plan 3's drift note before starting).

**Spec:** `docs/superpowers/specs/2026-09-20-fc-draft-night-design.md`

**Goal:** A deployed, real-time, five-manager auction-draft web app for FC 26/27 tournaments.

**Architecture:** Authoritative Node/TS server owns all state and resolves every action through one serialized command queue (`command → validate → apply → persist → broadcast`). React phones are thin clients. SQLite persists live + season state.

**Tech stack:** TypeScript everywhere · Node + Socket.IO · SQLite (better-sqlite3) · React + Vite · Vitest · pnpm workspaces · Render/Fly + Vercel.

## Monorepo file structure

```
fc-draft-night/
  package.json                 # pnpm workspace root
  pnpm-workspace.yaml
  tsconfig.base.json
  scripts/ingest-fc26.mjs      # FC 26 CSV -> catalog.json + squads.json (already run)
  packages/
    shared/                    # shared types + pure rules engine (no I/O)
      src/domain/
        types.ts               # Room, Manager, Player, Contest, Quote, events, commands
        budget.ts              # reserved / spendable / floor / cost-of-acting
        listing.ts             # 2-min listing window
        war.ts                 # min bid, quote cap, anti-snipe close
        resolution.ts          # ordered closes, overcommit void + 25M fine, negative unwind
        challenge.ts           # 3-per-rival challenge limit
        season.ts              # carryover, handoff, position-stepped budgets
        engine.ts              # applyCommand(state, command) reducer
      src/data/
        dataset.ts             # squads loader + validation
        seed/squads.json       # 5 clubs' real FC26 rosters (134 players) [generated]
    server/                    # Socket.IO + command queue + SQLite
      src/queue.ts             # serialized command processor
      src/timers.ts            # injectable clock, listing/anti-snipe/draft timers
      src/db.ts                # SQLite persistence + recovery
      src/catalog.ts           # FC26 catalog search (pool-eligible players)
      src/sockets.ts           # Socket.IO gateway (+ searchCatalog / setPool)
      src/room.ts              # room lifecycle
      src/data/fc26-catalog.json  # full 18,405-player FC26 catalog [generated, server-only]
    web/                       # React + Vite phone client
      src/screens/{Join,Setup,DraftBoard,Squad,Recap}.tsx
      src/state/socket.ts      # client store synced to broadcast diffs
```

## Plan sequence

### Plan 1 — Foundation + Rules Engine  *(written in full: `2026-09-20-fc-draft-night-p1-foundation.md`)*
Scaffold monorepo, load + validate the FC 26 data (`squads.json`, already generated), and implement the entire pure rules engine TDD-first. Rules fixtures use a controlled synthetic roster (pitch scenarios), not the live data. **Deliverable:** `pnpm test` green — the whole ruleset provably correct with zero I/O.

### Plan 2 — Server (command queue, timers, sockets, persistence)
- **Files:** `packages/server/src/{queue,timers,db,sockets,room}.ts`.
- **Key tasks:** injectable clock + timer wheel (TDD); serialized command queue wrapping `engine.applyCommand` (TDD with concurrent-command fixtures); SQLite schema + write-through persistence + crash recovery (load state on boot); Socket.IO gateway (join/reconnect by room code, emit state diffs, receive intents); room lifecycle (setup → live → closed).
- **Acceptance:** a scripted multi-socket integration test replays the mock draft over real timers (injected clock) and reproduces the §5 budget snapshot; kill+restart mid-draft recovers full state.

### Plan 3 — Frontend core (Join, Setup, Draft Board, live sync)
- **Files:** `packages/web/src/screens/{Join,Setup,DraftBoard}.tsx`, `src/state/socket.ts`.
- **Key tasks:** client socket store applying diffs; Join (code + name + club); Setup (budget floor-enforced, timers, squad cap, **Pool Builder** — search FC26 catalog + set pool); Draft Board — contests grid with per-contest countdown, searchable pool, live budget bars, challenge-limit tracker, draft-log feed, list/bid/raise/release actions, instant challenge alert.
- **Acceptance:** five browser contexts run a live draft end-to-end; a bid shows on every screen within ~1s.

### Plan 4 — Confirmed extras (formation, history, recap, analytics)
- **Files:** `packages/web/src/screens/{Squad,Recap}.tsx` + analytics components.
- **Key tasks:** Squad/Formation pitch view (display-only); challenge history (per-player + per-team trail); recap card (biggest steal / best bargain / most spent); full analytics dashboard (spend efficiency, bid timeline, most-contested, bargains/overpays) built from `LogEntry`.
- **Acceptance:** after a completed draft, recap + analytics render correct figures from the log.

### Plan 5 — Season handoff (export/import + carryover)
- **Files:** `packages/shared/src/domain/season.ts` (extended), `packages/server/src/export.ts`, importer UI in `Recap`/`Setup`.
- **Key tasks:** export full draft + blank finish fields (CSV/PDF/Excel); import → validate → apply position-stepped base budgets (20M steps) + leftover carry + permanent price updates + renew/release + reserved-overflow unwind. (Carryover *logic* is unit-tested in Plan 1; Plan 5 adds the file I/O + UI.)
- **Acceptance:** export → fill finishing order → re-import produces correct new base budgets and reserved/spendable for season N+1.

### Plan 6 — Deploy + e2e polish
- **Files:** `render.yaml`/`fly.toml`, `packages/web` Vercel config, CI workflow.
- **Key tasks:** deploy server (persistent process + volume for SQLite) and web (Vercel); wire client to prod socket URL; phone-browser responsive polish; full multi-client e2e smoke on the deployed URL.
- **Acceptance:** five real phones join a deployed room by code and complete a draft.

## Deferred (post-confirmed-set)
Spectator/TV view · multi-night leaderboard · squad export checklist.
