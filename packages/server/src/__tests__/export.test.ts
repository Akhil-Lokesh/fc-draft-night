import { test, expect } from "vitest";
import { exportSeasonCsv, exportSeasonXlsx, exportSeasonPdf } from "../export.js";
import { parseFinishingOrder, parseCsvLine } from "../import.js";
import { createRoom, addManager, loadSeed } from "@fcdn/shared";

function closedRoom() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: loadSeed() });
  s = addManager(s, { id: "m_real", displayName: "Real", clubId: "real" });
  s = addManager(s, { id: "m_bay", displayName: "Bayern", clubId: "bayern" });
  return { ...s, status: "closed" as const,
    log: [{ t: "win" as const, at: 30, contestId: "c1", managerId: "m_bay", playerId: "haaland", price: 220 }] };
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

test("xlsx export produces a non-empty buffer", () => {
  const buf = exportSeasonXlsx(closedRoom());
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.length).toBeGreaterThan(0);
});

test("pdf export produces a non-empty buffer", async () => {
  const buf = await exportSeasonPdf(closedRoom());
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.length).toBeGreaterThan(0);
});

test("export/import round-trip survives a displayName containing a comma (regression: CSV corruption)", () => {
  let s = createRoom({ code: "CD", totalBudget: 600, seed: loadSeed() });
  s = addManager(s, { id: "m_real", displayName: "O'Brien, Jr.", clubId: "real" });
  s = addManager(s, { id: "m_bay", displayName: "Bayern", clubId: "bayern" });
  const closed = { ...s, status: "closed" as const, log: [] };

  let { csv } = exportSeasonCsv(closed);
  // Fill in finishing positions the same way a human editing the exported CSV would: m_real
  // finished 2nd, m_bay finished 1st. If the comma in displayName corrupted the row, this
  // regex (anchored on the literal manager id at line-start) will still find the right line,
  // but the wrong column will end up holding "2"/"1" relative to what parseFinishingOrder reads.
  csv = csv.replace(/(m_real,[^\n]*),$/m, "$1,2").replace(/(m_bay,[^\n]*),$/m, "$1,1");

  const order = parseFinishingOrder(csv);
  // worst (highest number) first: m_real finished 2nd (worse), m_bay finished 1st (better)
  expect(order).toEqual(["m_real", "m_bay"]);
});

test("LOG column properly CSV-escapes its JSON payload and round-trips through JSON.parse (regression: lossy quote-substitution)", () => {
  let s = createRoom({ code: "EF", totalBudget: 600, seed: loadSeed() });
  s = addManager(s, { id: "m_real", displayName: "Real", clubId: "real" });
  // A reason containing both a double quote and a comma — the old `.replace(/"/g, "'")` hack
  // would mangle the quote into a literal apostrophe, making the column neither valid JSON nor
  // unambiguous CSV.
  const entry = { t: "void" as const, at: 12, contestId: "c1", managerId: "m_real", reason: 'flagged as "suspicious", pending review' };
  const closed = { ...s, status: "closed" as const, log: [entry] };

  const { csv } = exportSeasonCsv(closed);
  const logLineIdx = csv.split("\n").findIndex(l => l.startsWith("12,void,"));
  expect(logLineIdx).toBeGreaterThanOrEqual(0);
  const line = csv.split("\n")[logLineIdx]!;

  // Parse the line as CSV (respecting quoting), then JSON.parse the reconstructed detail field.
  const cols = parseCsvLine(line);
  expect(cols).toHaveLength(3); // at, type, detail — not split into extra columns by the embedded comma/quotes
  const detail = cols[2]!;
  const parsed = JSON.parse(detail);
  expect(parsed).toEqual(entry);
});
