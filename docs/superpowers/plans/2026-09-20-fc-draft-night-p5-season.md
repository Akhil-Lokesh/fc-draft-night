# FC Draft Night — Plan 5: Season Handoff (export · import · carryover)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Prerequisite:** Plans 1–4 complete. Carryover *logic* (`startNextSeason`, `positionStepBudgets`, `releaseToOriginal`) already exists and is unit-tested in Plan 1 (`domain/season.ts`). This plan adds the file I/O and UI around it.
>
> **Status:** Tasks 1–3 (export, import, handoff wiring) are done and committed — `packages/server/src/export.ts`, `import.ts`, `RoomStore.applyHandoff`, and the gateway's `exportSeason`/`importSeason` handlers all exist and are tested. **Task 4 (UI) is not started** — that's what remains here. Two things changed from this doc's original text during execution, relevant to Task 4:
> 1. **CSV escaping is real now.** `export.ts` exports `csvEscape(field): string` (RFC 4180 — quotes a field containing a comma/quote/newline, doubles internal quotes) and `import.ts` exports `parseCsvLine(line): string[]` (a real quoted-field-aware parser). This was added after a review caught that an unescaped manager `displayName` containing a comma (e.g. "O'Brien, Jr.") corrupted the export/import round-trip. The UI doesn't need to do anything with this directly — it's transparent, the CSV text is just a string the UI downloads/uploads as-is — but don't hand-roll any client-side CSV parsing/preview; if Task 4 wants a preview of the parsed finishing order, ask the server (there's no client-side CSV parser and there shouldn't be one).
> 2. **`applyHandoff`/`startNextSeason` now validates the finishing order against the room's actual managers** and throws a clear error (surfaced via the existing `error` socket event) if a manager id is missing or doesn't match — so `SeasonImport`'s error-handling path (already planned below) will correctly catch and display this, no extra UI work needed for it beyond what's already specified.

**Goal:** At draft close, export the full season (every listing, bid, win, release, final squads + spendable) with blank finishing-position fields. Host fills finishing order and re-uploads; the app applies position-stepped base budgets (20M steps), leftover carry, permanent price updates, renew/release, and reserved-overflow unwind to open season N+1.

**Architecture:** Export/import are server-side serializers over `RoomState`. Import parses the finishing order, then calls the existing pure `startNextSeason`. CSV is the canonical format (round-trippable); PDF/Excel are presentation exports generated from the same data.

**Tech Stack:** Node serializers (csv hand-rolled, `xlsx` for Excel, `pdfkit` for PDF) · React upload/download UI.

**Spec:** §4.9 + §8 (season handoff export/import + carryover).

---

## File structure

```
packages/server/src/export.ts         # RoomState -> { csv, rows } with blank finish fields
packages/server/src/import.ts         # parse re-uploaded CSV -> finishing order + validation
packages/server/src/__tests__/{export,import,handoff}.test.ts
packages/server/src/gateway.ts        # + "exportSeason" / "importSeason" handlers (modify)
packages/web/src/screens/Recap.tsx    # + export buttons (modify)
packages/web/src/screens/Setup.tsx    # + import upload (modify)
```

---

## Task 1: Season export (CSV canonical + blank finish fields)

**Files:** Create `packages/server/src/export.ts`, `src/__tests__/export.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { exportSeasonCsv } from "../export.js";
import { createRoom, addManager } from "@fcdn/shared";
import { loadSeed } from "@fcdn/shared";

function closedRoom() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: loadSeed() });
  s = addManager(s, { id: "m_real", displayName: "Real", clubId: "real" });
  s = addManager(s, { id: "m_bay", displayName: "Bayern", clubId: "bayern" });
  return { ...s, status: "closed" as const,
    log: [{ t: "win", at: 30, contestId: "c1", managerId: "m_bay", playerId: "haaland", price: 220 }] };
}

test("export includes a managers section with a blank 'finishingPosition' column", () => {
  const { csv } = exportSeasonCsv(closedRoom());
  expect(csv).toMatch(/finishingPosition/);
  expect(csv).toMatch(/m_real,.*,$/m); // trailing blank finishing cell
});

test("export includes every log entry", () => {
  const { csv } = exportSeasonCsv(closedRoom());
  expect(csv).toMatch(/haaland/);
  expect(csv).toMatch(/220/);
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test export`
- [ ] **Step 3: Implement** `export.ts`
```ts
import type { RoomState } from "@fcdn/shared";

export function exportSeasonCsv(s: RoomState): { csv: string; filename: string } {
  const lines: string[] = [];
  lines.push(`# FC Draft Night season ${s.seasonNumber} — code ${s.code}`);
  lines.push("");
  lines.push("## MANAGERS");
  lines.push("managerId,displayName,clubId,reserved,spendable,finishingPosition");
  for (const m of Object.values(s.managers))
    lines.push(`${m.id},${m.displayName},${m.clubId},${m.reserved},${m.spendable},`); // blank to fill
  lines.push("");
  lines.push("## SQUADS");
  lines.push("managerId,playerId,name,position,listedValue");
  for (const p of Object.values(s.players))
    if (p.ownerId) lines.push(`${p.ownerId},${p.id},${p.name},${p.position},${p.listedValue}`);
  lines.push("");
  lines.push("## LOG");
  lines.push("at,type,detail");
  for (const e of s.log) lines.push(`${e.at},${e.t},"${JSON.stringify(e).replace(/"/g, "'")}"`);
  return { csv: lines.join("\n"), filename: `fcdn-season-${s.seasonNumber}-${s.code}.csv` };
}
```
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(export): season CSV export with blank finishing-position fields + full log"`

- [ ] **Step 6 (Excel/PDF wrappers):** Add `exportSeasonXlsx(s)` using `xlsx` (one sheet per section) and `exportSeasonPdf(s)` using `pdfkit` (final squads + recap). Add a test per format asserting a non-empty Buffer is produced. Commit: `feat(export): xlsx + pdf presentation exports`.

---

## Task 2: Season import (parse finishing order + validate)

**Files:** Create `packages/server/src/import.ts`, `src/__tests__/import.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { parseFinishingOrder } from "../import.js";

const csv = [
  "## MANAGERS",
  "managerId,displayName,clubId,reserved,spendable,finishingPosition",
  "m_real,Real,real,425,175,2",
  "m_bay,Bayern,bayern,220,350,1",
  "m_city,City,city,300,34,5",
  "m_ars,Arsenal,arsenal,260,190,4",
  "m_bar,Barca,barca,240,310,3",
].join("\n");

test("parses finishing positions into a worst-first ordered array of managerIds", () => {
  expect(parseFinishingOrder(csv)).toEqual(["m_city", "m_ars", "m_bar", "m_real", "m_bay"]); // 5..1
});

test("rejects missing or duplicate finishing positions", () => {
  const bad = csv.replace("m_bay,Bayern,bayern,220,350,1", "m_bay,Bayern,bayern,220,350,2");
  expect(() => parseFinishingOrder(bad)).toThrow(/finishing position/i);
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test import`
- [ ] **Step 3: Implement** `import.ts`
```ts
export function parseFinishingOrder(csv: string): string[] {
  const lines = csv.split(/\r?\n/);
  const start = lines.findIndex(l => l.startsWith("managerId,displayName"));
  if (start < 0) throw new Error("managers section not found");
  const rows: { id: string; pos: number }[] = [];
  for (let i = start + 1; i < lines.length && lines[i].trim() && !lines[i].startsWith("#"); i++) {
    const cols = lines[i].split(",");
    const pos = Number(cols[5]);
    if (!Number.isInteger(pos) || pos < 1) throw new Error(`bad finishing position for ${cols[0]}`);
    rows.push({ id: cols[0], pos });
  }
  const positions = rows.map(r => r.pos);
  if (new Set(positions).size !== positions.length) throw new Error("duplicate finishing position");
  return rows.sort((a, b) => b.pos - a.pos).map(r => r.id); // worst (highest number) first
}
```
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(import): parse + validate re-uploaded finishing order (worst-first)"`

---

## Task 3: Wire import → startNextSeason (integration)

**Files:** Create `src/__tests__/handoff.test.ts`; Modify `src/gateway.ts` (add handlers), `src/rooms.ts` (add `applyHandoff`)

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from "vitest";
import { RoomStore } from "../rooms.js";
import { Queue } from "../queue.js";
import { Db } from "../db.js";
import { exportSeasonCsv } from "../export.js";
import { loadSeed, type RoomState } from "@fcdn/shared";

test("re-uploading a filled export opens season N+1 with position-stepped budgets", async () => {
  const q = new Queue<RoomState>();
  const store = new RoomStore(q, new Db(":memory:"), loadSeed(), () => "S1");
  await store.create({ totalBudget: 1500 }); // real FC26 dataset's budget floor — RoomStore.create enforces it
  await store.join("S1", { displayName: "Real", clubId: "real" });
  await store.join("S1", { displayName: "Bayern", clubId: "bayern" }); // RoomStore.join mints id `m_${clubId}` -> "m_bayern", NOT "m_bay"
  // pretend the season closed; export, fill finishing order, re-import
  const closed = { ...store.get("S1")!, status: "closed" as const };
  q.setState("S1", closed);
  let { csv } = exportSeasonCsv(closed);
  csv = csv.replace(/(m_real,[^\n]*),$/m, "$1,2").replace(/(m_bayern,[^\n]*),$/m, "$1,1");
  const next = await store.applyHandoff("S1", csv, { base: 600, step: 20 }); // rebase `base`/`step` are independent test params, unrelated to the room's original floor-satisfying totalBudget
  expect(next.seasonNumber).toBe(2);
  // Bayern finished 1st (of two) => base 620; Real 2nd/last => base 600
  const bayBase = 620, realBase = 600;
  expect(next.managers["m_bayern"]!.spendable).toBe(bayBase + Math.max(0, closed.managers["m_bayern"]!.spendable) - next.managers["m_bayern"]!.reserved);
  expect(next.managers["m_real"]!.spendable).toBe(realBase + Math.max(0, closed.managers["m_real"]!.spendable) - next.managers["m_real"]!.reserved);
});
```
**Also note:** `startNextSeason` (in `@fcdn/shared`) validates that `finishingOrder` exactly matches the room's manager ids — a mismatched/typo'd id throws `"finishing order does not match room managers"` rather than silently misassigning a budget (a real bug found and fixed during Plan 2 execution). If this test's CSV-filling regex doesn't produce ids that exactly match both room managers, `applyHandoff` will throw here instead of returning a rebased state — keep the `m_real`/`m_bayern` replacements in sync with whatever ids `store.join` actually minted.

- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/server test handoff`
- [ ] **Step 3: Implement** — add to `RoomStore`:
```ts
import { startNextSeason } from "@fcdn/shared";
import { parseFinishingOrder } from "./import.js";
// ...
async applyHandoff(code: string, csv: string, opts: { base: number; step: number }): Promise<RoomState> {
  const finishingOrder = parseFinishingOrder(csv);
  const { state } = await this.q.run(code, (s) => ({ state: startNextSeason(s, { finishingOrder, ...opts }), events: [] }));
  this.db.save(state);
  return state;
}
```
Add gateway handlers: `socket.on("exportSeason", ...)` → emit `{ csv, filename }` from `exportSeasonCsv(store.get(code))`; `socket.on("importSeason", { code, csv, base, step })` → `store.applyHandoff(...)` then broadcast.
- [ ] **Step 4:** Run — PASS
- [ ] **Step 5:** `git commit -am "feat(server): season handoff wiring (export -> fill -> import -> startNextSeason)"`

---

## Task 4: Export/import UI

**Files:** Modify `packages/web/src/screens/Recap.tsx` (export buttons) and `Setup.tsx` (import upload); Create `src/__tests__/handoffUi.test.tsx`

- [ ] **Step 1: Failing test**
```tsx
import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeasonExport } from "../components/SeasonExport.js";
import { SeasonImport } from "../components/SeasonImport.js";

test("export buttons request CSV/PDF/Excel", async () => {
  const onExport = vi.fn();
  render(<SeasonExport onExport={onExport} />);
  await userEvent.click(screen.getByRole("button", { name: /csv/i }));
  expect(onExport).toHaveBeenCalledWith("csv");
});

test("import reads a chosen file and submits its text", async () => {
  const onImport = vi.fn();
  render(<SeasonImport onImport={onImport} />);
  const file = new File(["## MANAGERS\n..."], "s.csv", { type: "text/csv" });
  await userEvent.upload(screen.getByLabelText(/upload/i), file);
  await userEvent.click(screen.getByRole("button", { name: /start next season/i }));
  expect(onImport).toHaveBeenCalledWith(expect.stringContaining("MANAGERS"));
});
```
- [ ] **Step 2:** Run — FAIL. `pnpm -C packages/web test handoffUi`
- [ ] **Step 3: Implement** `SeasonExport` (three buttons → `onExport(format)`; on CSV response, trigger a browser download of the returned text) and `SeasonImport` (file input → read `.text()` → on submit call `onImport(text)`). Mount `SeasonExport` in `Recap` (wired to `exportSeason` socket event + download) and `SeasonImport` in `Setup` (wired to `importSeason`).
- [ ] **Step 4:** Run — PASS. Full suites: `pnpm -r test`
- [ ] **Step 5:** `git commit -am "feat(web): season export buttons + import upload UI wired to handoff"`

---

## Self-review

- **Export full draft + blank finish fields** → Task 1. ✅
- **CSV/PDF/Excel** → Task 1 (CSV canonical + Step 6 wrappers). ✅
- **Import + validate finishing order** → Task 2. ✅
- **Position-stepped budgets + leftover carry + permanent prices + reserved-overflow unwind** → Task 3 via `startNextSeason` (already unit-tested in Plan 1). ✅
- **Renew/release** → `releaseToOriginal` (Plan 1) surfaced in Squad/Recap UI; add a "release to original value" action in the pre-draft setup for held players (small follow-up in Task 4 if the group wants it pre-season). ✅
- **UI download/upload** → Task 4. ✅
- **Consistency:** `exportSeasonCsv(state)→{csv,filename}`, `parseFinishingOrder(csv)→string[]` (worst-first), `RoomStore.applyHandoff(code,csv,{base,step})`, and `startNextSeason(s,{finishingOrder,base,step})` line up exactly with Plan 1's `season.ts` signature.
