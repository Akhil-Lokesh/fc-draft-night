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

// ---- the season export is a roster file in exactly the upload format ----
import { exportRosterCsv } from "../export.js";
import { parseTournamentCsv } from "../roster.js";
import { Catalog } from "../catalog.js";
import { addPoolPlayer } from "@fcdn/shared";

const UP = `
tournament,Friday Night League
season,1
budgetStep,0

## TEAMS
club,finishingPosition
Chelsea,
Atletico Madrid,

## SQUADS
club,player,number,id,score,value,position
Chelsea,C. Palmer,20,,87,,
Chelsea,J. Newplayer,99,,63,12,MID
Atletico Madrid,J. Alvarez,19,,87,,
Atletico Madrid,Pablo Barrios,24,,82,,

## POOL
club,player,number,id,score
Liverpool,F. Wirtz,7,,89
`;

function finishedRoom() {
  const t = parseTournamentCsv(UP, new Catalog().raw());
  let s = createRoom({ code: "XY", totalBudget: 1500, seed: t.seed, seasonNumber: 1, tournamentName: t.tournamentName });
  for (const p of t.poolSeed) s = addPoolPlayer(s, p);
  s = addManager(s, { id: "m_chelsea", displayName: "Ana", clubId: "chelsea" });
  s = addManager(s, { id: "m_atletico-madrid", displayName: "Bo", clubId: "atletico-madrid" });
  return { ...s, status: "closed" as const };
}
/** Fill in last season's places the way a host would: Chelsea 2nd, the other club champions. */
const fill = (csv: string) => csv.replace(/(## TEAMS\nclub,finishingPosition,leftover\n)([^\n]*)\n([^\n]*)\n/, (_m, head, a, b) => {
  const put = (row: string) => { const [club, , left] = row.split(","); return `${club},${/chelsea/i.test(club!) ? 2 : 1},${left}`; };
  return `${head}${put(a)}\n${put(b)}\n`;
});

test("the season export is a roster file for the NEXT season: tournament, season N+1, a TEAMS section to rank", () => {
  const { csv, filename } = exportRosterCsv(finishedRoom());
  const lines = csv.split("\n").filter(l => !l.startsWith("# "));
  expect(lines.slice(0, 2)).toEqual(["tournament,Friday Night League", "season,2"]);
  expect(lines).toContain("## TEAMS");
  expect(lines).toContain("club,finishingPosition,leftover");
  // the place is blank (the host fills in the standings); the leftover is already filled in from the season
  expect(lines.some(l => /^Chelsea,,\d/.test(l))).toBe(true);
  expect(lines).toContain("## SQUADS");
  expect(lines).toContain("club,player,number,id,score,value,position");
  expect(filename).toMatch(/season-2/);
});

test("it carries no budget column: each team's leftover money is what it keeps, standings add the bonus", () => {
  const { csv } = exportRosterCsv(finishedRoom());
  expect(csv).not.toMatch(/spendable|reserved|managerId|budgetStep/i);
  expect(csv.split("\n").filter(l => !l.startsWith("# ") && /budget/i.test(l))).toEqual([]);
});

test("each team's leftover is the money it had left at the end of the season", () => {
  const room = finishedRoom();
  const left = Object.fromEntries(Object.values(room.managers).map(m => [m.clubId, m.spendable]));
  const back = parseTournamentCsv(fill(exportRosterCsv(room).csv), new Catalog().raw());
  expect(back.leftovers["chelsea"]).toBeCloseTo(Math.max(0, left["chelsea"]!), 1);
  expect(back.leftovers["atletico-madrid"]).toBeCloseTo(Math.max(0, left["atletico-madrid"]!), 1);
});

test("filled in with the places, it uploads straight back: same squads, next season, same tournament", () => {
  const { csv } = exportRosterCsv(finishedRoom());
  const back = parseTournamentCsv(fill(csv), new Catalog().raw());
  expect(back.tournamentName).toBe("Friday Night League");
  expect(back.seasonNumber).toBe(2);
  expect(back.finishingOrder).toEqual(["chelsea", "atletico-madrid"]); // worst first: Chelsea 2nd, Atletico 1st
  expect(back.seed.filter(p => p.clubId === "chelsea").map(p => p.name).sort()).toEqual(["C. Palmer", "J. Newplayer"]);
  expect(back.seed.filter(p => p.clubId === "atletico-madrid")).toHaveLength(2);
  expect(back.poolSeed.map(p => p.name)).toEqual(["F. Wirtz"]);
});

test("a player FC26 doesn't know keeps his value and position through the export", () => {
  const { csv } = exportRosterCsv(finishedRoom());
  const back = parseTournamentCsv(fill(csv), new Catalog().raw());
  const n = back.seed.find(p => p.name === "J. Newplayer")!;
  expect([n.value, n.position, n.overall, n.shirtNumber]).toEqual([12, "MID", 63, 99]);
});

test("a player who changed club in the draft is exported under the club that owns him now", () => {
  const room = finishedRoom();
  const palmer = Object.values(room.players).find(p => p.name === "C. Palmer")!;
  const moved = { ...room, players: { ...room.players, [palmer.id]: { ...palmer, ownerId: "m_atletico-madrid" } } };
  const back = parseTournamentCsv(fill(exportRosterCsv(moved).csv), new Catalog().raw());
  expect(back.seed.find(p => p.name === "C. Palmer")!.clubId).toBe("atletico-madrid");
});

test("until the places are filled in the file is refused as a season-2 upload", () => {
  expect(() => parseTournamentCsv(exportRosterCsv(finishedRoom()).csv, new Catalog().raw())).toThrow();
});

test("a room with no tournament name still exports with a sensible league name", () => {
  const r = finishedRoom();
  const { tournamentName: _drop, ...rest } = r as any;
  expect(exportRosterCsv(rest).csv).toMatch(/^tournament,FC Draft Night$/m);
});
