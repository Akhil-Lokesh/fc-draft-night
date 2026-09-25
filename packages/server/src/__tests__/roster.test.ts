import { test, expect } from "vitest";
import { parseRosterCsv } from "../roster.js";
import type { SeedPlayer } from "@fcdn/shared";

const catalog: SeedPlayer[] = [
  { id: "1", name: "C. Palmer", position: "MID", value: 109, overall: 87, club: "Chelsea", clubId: null },
  { id: "2", name: "M. Caicedo", position: "MID", value: 90, overall: 85, club: "Chelsea", clubId: null },
  { id: "3", name: "J. Alvarez", position: "FWD", value: 150, overall: 88, club: "Atlético Madrid", clubId: null },
  { id: "4", name: "Pablo Barrios", position: "MID", value: 60, overall: 82, club: "Atlético Madrid", clubId: null },
];

test("parses a roster CSV, cross-checking every player against the database", () => {
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\nAtletico Madrid,Pablo Barrios\n";
  const seed = parseRosterCsv(csv, catalog);
  expect(seed).toHaveLength(4);
  expect(new Set(seed.map(p => p.clubId))).toEqual(new Set(["chelsea", "atletico-madrid"]));
  // pulls canonical stats from the database, not from the (absent) CSV columns
  const palmer = seed.find(p => p.name === "C. Palmer")!;
  expect(palmer.value).toBe(109);
  expect(palmer.club).toBe("Chelsea"); // canonical spelling from the database, not the CSV's
});

test("club and player names match loosely — accents/case/whitespace don't matter", () => {
  const csv = "club,player\n  chelsea , c. palmer \nATLETICO MADRID,j. alvarez\n";
  const seed = parseRosterCsv(csv, catalog);
  expect(seed).toHaveLength(2);
});

test("a player the database has never heard of at all is still seeded, using their club's average stats", () => {
  // Chelsea's real players average (109+90)/2=99.5 value, (87+85)/2=86 overall, all MID here.
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,Not A Real Player\nAtletico Madrid,J. Alvarez\n";
  const seed = parseRosterCsv(csv, catalog);
  const unknown = seed.find(p => p.name === "Not A Real Player")!;
  expect(unknown.value).toBe(99.5);
  expect(unknown.overall).toBe(86);
  expect(unknown.position).toBe("MID");
  expect(unknown.clubId).toBe("chelsea");
});

test("a player at a club the database has never heard of either just gets the database's overall average", () => {
  const csv = "club,player\nSome Sunday League FC,Nobody Famous\nChelsea,C. Palmer\n";
  const seed = parseRosterCsv(csv, catalog);
  const unknown = seed.find(p => p.name === "Nobody Famous")!;
  expect(unknown.value).toBeGreaterThan(0);
  expect(unknown.clubId).toBe("some-sunday-league-fc"); // still the CSV's own club, not folded into Chelsea
});

test("a transferred player is accepted even though the CSV's club doesn't match the database's — the database only verifies the player is real", () => {
  // J. Alvarez is Atlético Madrid in the database, but the host says he's now at Arsenal.
  const csv = "club,player\nArsenal,J. Alvarez\nChelsea,C. Palmer\n";
  const seed = parseRosterCsv(csv, catalog);
  const alvarez = seed.find(p => p.name === "J. Alvarez")!;
  expect(alvarez.clubId).toBe("arsenal"); // the CSV's club wins, not the database's
  expect(alvarez.value).toBe(150); // stats still pulled from the database
});

test("a loosely-typed club still resolves a shared name when it clearly points at one candidate", () => {
  // Regression: O. Kökçü is real at both "Beşiktaş JK" and (a reserve/namesake at) "FC Volendam" —
  // a host typing the plain ASCII "Besiktas" must resolve to the Beşiktaş one, not be told it's
  // ambiguous just because the database's official name has a "JK" suffix the host didn't type.
  const withKokcu: SeedPlayer[] = [
    ...catalog,
    { id: "6", name: "O. Kökçü", position: "MID", value: 43.5, overall: 82, club: "Beşiktaş JK", clubId: null },
    { id: "7", name: "O. Kökçü", position: "MID", value: 0.7, overall: 55, club: "FC Volendam", clubId: null },
  ];
  const csv = "club,player\nBesiktas,O. Kökçü\nChelsea,C. Palmer\n";
  const seed = parseRosterCsv(csv, withKokcu);
  const kokcu = seed.find(p => p.name === "O. Kökçü")!;
  expect(kokcu.value).toBe(43.5);
  expect(kokcu.clubId).toBe("besiktas");
});

test("a name shared by two different real players never blocks the upload — the exact club still wins when given", () => {
  const dupCatalog: SeedPlayer[] = [
    ...catalog,
    { id: "5", name: "C. Palmer", position: "DEF", value: 20, overall: 65, club: "Some Lower League Club", clubId: null },
  ];
  const csv = "club,player\nChelsea,C. Palmer\nAtletico Madrid,J. Alvarez\n";
  const seed = parseRosterCsv(csv, dupCatalog);
  expect(seed.find(p => p.name === "C. Palmer")!.value).toBe(109); // Chelsea's Palmer, not the lower-league namesake
});

test("a name shared by two players with no usable club hint just takes the higher-value one, never blocking", () => {
  const dupCatalog: SeedPlayer[] = [
    ...catalog,
    { id: "5", name: "C. Palmer", position: "DEF", value: 20, overall: 65, club: "Some Lower League Club", clubId: null },
  ];
  const csv = "club,player\nArsenal,C. Palmer\nAtletico Madrid,J. Alvarez\n"; // "Arsenal" matches neither candidate's club
  const seed = parseRosterCsv(csv, dupCatalog);
  const palmer = seed.find(p => p.name === "C. Palmer")!;
  expect(palmer.value).toBe(109); // the €109M Chelsea Palmer beats the €20M namesake
  expect(palmer.clubId).toBe("arsenal"); // team assignment still comes from the CSV, not the database
});

test("an optional third column is parsed as a shirt number, validated and cross-checked", () => {
  const csv = "club,player,number\nChelsea,C. Palmer,20\nChelsea,M. Caicedo,25\nAtletico Madrid,J. Alvarez,\n";
  const seed = parseRosterCsv(csv, catalog);
  expect(seed.find(p => p.name === "C. Palmer")!.shirtNumber).toBe(20);
  expect(seed.find(p => p.name === "J. Alvarez")!.shirtNumber).toBeUndefined(); // left blank
});

test("a non-positive-integer shirt number is rejected", () => {
  const csv = "club,player,number\nChelsea,C. Palmer,0\nChelsea,M. Caicedo,\n";
  expect(() => parseRosterCsv(csv, catalog)).toThrow(/shirt number/i);
});

test("the same shirt number can repeat, within a club or across clubs", () => {
  const csv = "club,player,number\nChelsea,C. Palmer,7\nChelsea,M. Caicedo,7\nAtletico Madrid,J. Alvarez,7\n";
  const seed = parseRosterCsv(csv, catalog);
  expect(seed.every(p => p.shirtNumber === 7)).toBe(true);
});

test("a roster naming fewer than 2 clubs is rejected", () => {
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\n";
  expect(() => parseRosterCsv(csv, catalog)).toThrow(/at least 2 clubs/i);
});

test("a file without the expected header is rejected", () => {
  expect(() => parseRosterCsv("not,a,roster\n", catalog)).toThrow(/header/i);
});

/**
 * The FC26 catalog stores EA's short display name ("K. Mbappé"), but a host typing a roster by
 * hand naturally types the full first name ("Kylian Mbappé") — 83% of the real catalog uses this
 * initial-dot short form, so without a surname+initial fallback almost every famous player upload
 * would silently miss the database and get a synthetic placeholder instead of real stats.
 */
test("a full first name still matches the database's short-name entry by surname + initial", () => {
  const withShortNames: SeedPlayer[] = [
    ...catalog,
    { id: "8", name: "K. Mbappé", position: "FWD", value: 230, overall: 91, club: "Real Madrid", clubId: null },
  ];
  const csv = "club,player\nReal Madrid,Kylian Mbappé\nChelsea,C. Palmer\n";
  const seed = parseRosterCsv(csv, withShortNames);
  const mbappe = seed.find(p => p.name === "K. Mbappé")!;
  expect(mbappe).toBeTruthy();
  expect(mbappe.value).toBe(230); // real database stats, not a synthetic average
  expect(mbappe.id).toBe("8");
});

test("a mononym catalog entry (no initial at all) still matches on surname alone", () => {
  const withMononym: SeedPlayer[] = [
    ...catalog,
    { id: "10", name: "Carvajal", position: "DEF", value: 12, overall: 82, club: "Real Madrid", clubId: null },
  ];
  const csv = "club,player\nReal Madrid,Dani Carvajal\nChelsea,C. Palmer\n";
  const seed = parseRosterCsv(csv, withMononym);
  const carvajal = seed.find(p => p.name === "Carvajal")!;
  expect(carvajal.id).toBe("10");
  expect(carvajal.value).toBe(12);
});

test("surname+initial fallback still prefers the club match when the same short name exists at two clubs", () => {
  const withShortNames: SeedPlayer[] = [
    ...catalog,
    { id: "8", name: "K. Mbappé", position: "FWD", value: 230, overall: 91, club: "Real Madrid", clubId: null },
    { id: "9", name: "K. Mbappé", position: "FWD", value: 0.5, overall: 60, club: "Some Lower League Club", clubId: null },
  ];
  const csv = "club,player\nReal Madrid,Kylian Mbappé\nChelsea,C. Palmer\n";
  const seed = parseRosterCsv(csv, withShortNames);
  const mbappe = seed.find(p => p.name === "K. Mbappé")!;
  expect(mbappe.id).toBe("8");
  expect(mbappe.value).toBe(230);
});

test("a 4th 'id' column matches the exact catalog player directly, bypassing name matching entirely", () => {
  const ambiguous: SeedPlayer[] = [
    ...catalog,
    { id: "5", name: "C. Palmer", position: "DEF", value: 20, overall: 65, club: "Some Lower League Club", clubId: null },
  ];
  // Name alone would resolve to Chelsea's Palmer (higher value) — the id pins the OTHER one on purpose.
  const csv = "club,player,number,id\nChelsea,C. Palmer,,5\nAtletico Madrid,J. Alvarez,,\n";
  const seed = parseRosterCsv(csv, ambiguous);
  const palmer = seed.find(p => p.id === "5")!;
  expect(palmer).toBeTruthy();
  expect(palmer.value).toBe(20); // the lower-league namesake, exactly as pinned by id
  expect(palmer.clubId).toBe("chelsea"); // team assignment still comes from the CSV's club column
});

// Reversed 2026-09-24 after a real upload hit this at scale: ~20 rows across two sections all
// had ids from a bigger/different database than this app's catalog. Hard-blocking the whole
// upload over that was too harsh — an id the catalog doesn't know now just falls back to
// ordinary name matching, exactly as if the cell were left blank, same as any other row.
test("an id that isn't in the catalog quietly falls back to matching by name, same as a blank id", () => {
  const csv = "club,player,number,id\nChelsea,C. Palmer,,not-a-real-id\nAtletico Madrid,J. Alvarez,,\n";
  const seed = parseRosterCsv(csv, catalog);
  const palmer = seed.find(p => p.name === "C. Palmer")!;
  expect(palmer.value).toBe(109); // resolved by name, real catalog stats
});

test("an id that isn't in the catalog, for a name the database has also never heard of, still doesn't block — synthetic stats, same as a blank id", () => {
  const csv = "club,player,number,id\nChelsea,Totally Unknown Player,,not-a-real-id\nAtletico Madrid,J. Alvarez,,\n";
  const seed = parseRosterCsv(csv, catalog);
  const unknown = seed.find(p => p.name === "Totally Unknown Player")!;
  expect(unknown.clubId).toBe("chelsea");
  expect(unknown.value).toBeGreaterThan(0); // synthetic club-average stats, not a block
});

test("a blank id column still falls back to ordinary name matching", () => {
  const csv = "club,player,number,id\nChelsea,C. Palmer,,\nAtletico Madrid,J. Alvarez,,\n";
  const seed = parseRosterCsv(csv, catalog);
  expect(seed.find(p => p.name === "C. Palmer")!.value).toBe(109);
});

test("an id match finds a player even when the CSV's name is garbled or unrecognizable by itself", () => {
  const csv = "club,player,number,id\nChelsea,???totally unmatched???,,1\nAtletico Madrid,J. Alvarez,,\n";
  const seed = parseRosterCsv(csv, catalog);
  const byId = seed.find(p => p.id === "1")!;
  expect(byId.name).toBe("C. Palmer"); // real catalog name wins, not the CSV's garbled text
  expect(byId.value).toBe(109);
});

test("multiple genuinely-bad rows (not unknown ids — those no longer error) are all reported together, not just the first", () => {
  const csv = "club,player,number\nChelsea,C. Palmer,0\nAtletico Madrid,J. Alvarez,-1\nChelsea,M. Caicedo,\n";
  let message = "";
  try { parseRosterCsv(csv, catalog); } catch (e) { message = (e as Error).message; }
  expect(message).toMatch(/row 2:.*shirt number "0"/);
  expect(message).toMatch(/row 3:.*shirt number "-1"/);
});

test("an unmatched player's optional 5th/6th columns (value, position) supply real stats instead of the club average", () => {
  const csv = "club,player,number,id,value,position\nChelsea,C. Palmer,,,,\nAtletico Madrid,J. Alvarez,,,,\nChelsea,A Real Youth Player,,,0.5,DEF\n";
  const seed = parseRosterCsv(csv, catalog);
  const youth = seed.find(p => p.name === "A Real Youth Player")!;
  expect(youth.id.startsWith("custom-")).toBe(true); // still synthetic — no catalog match — but with real stats now
  expect(youth.value).toBe(0.5);
  expect(youth.position).toBe("DEF");
  expect(youth.overall).toBeGreaterThan(0); // rating still falls back to the club average — not overridden
});

test("value/position overrides are ignored once a real player is matched by name — a real match always wins", () => {
  // "C. Palmer" resolves for real; the override columns must never touch a real match's stats.
  const csv = "club,player,number,id,value,position\nChelsea,C. Palmer,,,999,GK\nAtletico Madrid,J. Alvarez,,,,\n";
  const seed = parseRosterCsv(csv, catalog);
  const palmer = seed.find(p => p.name === "C. Palmer")!;
  expect(palmer.value).toBe(109); // real catalog value, not the bogus 999 override
  expect(palmer.position).toBe("MID"); // real position, not the bogus GK override
});

test("a bad manual value or position on an unmatched row is a clear, batched error", () => {
  const csv = "club,player,number,id,value,position\nChelsea,Fake One,,,not-a-number,DEF\nAtletico Madrid,Fake Two,,,0.5,WING\nAtletico Madrid,J. Alvarez,,,,\n";
  let message = "";
  try { parseRosterCsv(csv, catalog); } catch (e) { message = (e as Error).message; }
  expect(message).toMatch(/row 2:.*bad value "not-a-number"/);
  expect(message).toMatch(/row 3:.*bad position "WING"/);
});

