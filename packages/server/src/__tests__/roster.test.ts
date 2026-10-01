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

test("a player the database has never heard of is still seeded, but cheap: never valued like his club's stars", () => {
  // Chelsea's real players average 99.5M here. An unknown (an academy/reserve player the game lacks) must
  // NOT inherit that, or a handful of them inflate a whole squad by hundreds of millions.
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,Not A Real Player\nAtletico Madrid,J. Alvarez\n";
  const seed = parseRosterCsv(csv, catalog);
  const unknown = seed.find(p => p.name === "Not A Real Player")!;
  expect(unknown.value).toBe(0.5);
  expect(unknown.overall).toBe(55);
  expect(unknown.position).toBe("MID"); // still the squad's most common position unless the CSV says otherwise
  expect(unknown.clubId).toBe("chelsea");
});

test("unknown reserves don't add up to real money: six of them cost 3M, not 6 x the club's average", () => {
  const names = ["A. Nobody", "B. Nobody", "C. Nobody", "D. Nobody", "E. Nobody", "F. Nobody"];
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\n" + names.map(n => `Chelsea,${n}`).join("\n") + "\nAtletico Madrid,J. Alvarez\n";
  const seed = parseRosterCsv(csv, catalog);
  const fakes = seed.filter(p => names.includes(p.name));
  expect(fakes).toHaveLength(6);
  expect(fakes.reduce((t, p) => t + p.value, 0)).toBe(3);
});

test("a hand-supplied value and position still win for an unknown player", () => {
  const csv = "club,player,number,id,value,position\nChelsea,C. Palmer,,,,\nChelsea,Not A Real Player,,,12,DEF\nAtletico Madrid,J. Alvarez,,,,\n";
  const unknown = parseRosterCsv(csv, catalog).find(p => p.name === "Not A Real Player")!;
  expect(unknown.value).toBe(12);
  expect(unknown.position).toBe("DEF");
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


// ---- score (the FC26 overall rating, e.g. 90): tells namesakes apart and rates players the game lacks ----

const twins: SeedPlayer[] = [
  { id: "t1", name: "J. Bellingham", position: "MID", value: 174.5, overall: 90, club: "Real Madrid", clubId: null },
  { id: "t2", name: "J. Bellingham", position: "MID", value: 9, overall: 76, club: "Borussia Dortmund", clubId: null },
  { id: "t3", name: "B. Saka", position: "FWD", value: 118, overall: 88, club: "Arsenal", clubId: null },
];

test("a score tells two players with the same name apart, even when the stated club matches neither", () => {
  // Nobody plays for "Liverpool" here, so the club can't help; without a score the pricier one wins.
  const plain = parseRosterCsv("club,player\nLiverpool,J. Bellingham\nArsenal,B. Saka\n", twins);
  expect(plain.find(p => p.name === "J. Bellingham")!.id).toBe("t1");
  const scored = parseRosterCsv("club,player,number,id,score\nLiverpool,J. Bellingham,,,76\nArsenal,B. Saka,,,88\n", twins);
  expect(scored.find(p => p.name === "J. Bellingham")!.id).toBe("t2"); // the 76, not the 90
});

test("the score beats the club hint when they disagree about which namesake is meant", () => {
  // Says Real Madrid, but scores him 76: the 76-rated one is Dortmund's.
  const seed = parseRosterCsv("club,player,number,id,score\nReal Madrid,J. Bellingham,,,76\nArsenal,B. Saka,,,88\n", twins);
  expect(seed.find(p => p.name === "J. Bellingham")!.id).toBe("t2");
});

test("a score that matches nobody leaves ordinary matching alone", () => {
  const seed = parseRosterCsv("club,player,number,id,score\nReal Madrid,J. Bellingham,,,50\nArsenal,B. Saka,,,88\n", twins);
  expect(seed.find(p => p.name === "J. Bellingham")!.id).toBe("t1"); // the club hint still picks Real Madrid's
});

test("a real catalog player keeps the catalog's rating whatever score the file says", () => {
  const seed = parseRosterCsv("club,player,number,id,score\nChelsea,C. Palmer,,,50\nAtletico Madrid,J. Alvarez,,,50\n", catalog);
  expect(seed.find(p => p.name === "C. Palmer")!.overall).toBe(87);
});

test("a score sets the rating of a player the database has never heard of", () => {
  const seed = parseRosterCsv("club,player,number,id,score\nChelsea,C. Palmer,,,\nChelsea,Not A Real Player,,,68\nAtletico Madrid,J. Alvarez,,,\n", catalog);
  expect(seed.find(p => p.name === "Not A Real Player")!.overall).toBe(68);
});

test("an unknown player with no score gets the default rating", () => {
  const seed = parseRosterCsv("club,player,number,id,score\nChelsea,C. Palmer,,,\nChelsea,Not A Real Player,,,\nAtletico Madrid,J. Alvarez,,,\n", catalog);
  expect(seed.find(p => p.name === "Not A Real Player")!.overall).toBe(55);
});

test("a score must be a whole number from 1 to 99, and every bad one is reported", () => {
  const csv = "club,player,number,id,score\nChelsea,C. Palmer,,,ninety\nChelsea,M. Caicedo,,,0\nAtletico Madrid,J. Alvarez,,,100\n";
  expect(() => parseRosterCsv(csv, catalog)).toThrow(/bad score "ninety"[\s\S]*bad score "0"[\s\S]*bad score "100"/);
});

test("columns are read by their header names, in any order, and only the ones named are used", () => {
  const seed = parseRosterCsv("club,player,score,number\nChelsea,C. Palmer,87,20\nChelsea,Nobody Known,63,21\nAtletico Madrid,J. Alvarez,,19\n", catalog);
  const nobody = seed.find(p => p.name === "Nobody Known")!;
  expect(nobody.overall).toBe(63);
  expect(nobody.shirtNumber).toBe(21);
  expect(seed.find(p => p.name === "J. Alvarez")!.shirtNumber).toBe(19);
});

test("named value and position columns work too, next to the score", () => {
  const seed = parseRosterCsv("club,player,number,id,score,value,position\nChelsea,C. Palmer,,,,,\nChelsea,Nobody Known,,,63,12,DEF\nAtletico Madrid,J. Alvarez,,,,,\n", catalog);
  const nobody = seed.find(p => p.name === "Nobody Known")!;
  expect([nobody.overall, nobody.value, nobody.position]).toEqual([63, 12, "DEF"]);
});

test("older files with an unnamed 4th/5th/6th column (id, value, position) still read the old way", () => {
  const seed = parseRosterCsv("club,player,number\nChelsea,C. Palmer,,3\nChelsea,Nobody Known,,,12,DEF\nAtletico Madrid,J. Alvarez\n", catalog);
  expect(seed.find(p => p.name === "Nobody Known")!.value).toBe(12);
  expect(seed.find(p => p.name === "Nobody Known")!.position).toBe("DEF");
});

// ---- third try: shirt number + score within the club, when neither the id nor the name found anyone ----

const squad: SeedPlayer[] = [
  { id: "s1", name: "G. Simeone", position: "MID", value: 39.5, overall: 81, club: "Atlético Madrid", clubId: null, clubNumber: 20 },
  { id: "s2", name: "A. Griezmann", position: "FWD", value: 26, overall: 86, club: "Atlético Madrid", clubId: null, clubNumber: 7 },
  { id: "s3", name: "J. Cardozo", position: "MID", value: 5, overall: 70, club: "Atlético Madrid", clubId: null, clubNumber: 20 }, // same number, other rating
  { id: "s4", name: "B. Saka", position: "FWD", value: 118, overall: 88, club: "Arsenal", clubId: null, clubNumber: 7 },
];
const H = "club,player,number,id,score";
const found = (row: string, name: string) => parseRosterCsv(`${H}\n${row}\nArsenal,B. Saka,7,,88\n`, squad).find(p => p.name === name || p.id.startsWith("s") || p.id.startsWith("custom-"));
const pick = (row: string) => parseRosterCsv(`${H}\n${row}\nArsenal,B. Saka,7,,88\n`, squad).filter(p => p.clubId !== "arsenal")[0]!;

test("a first name alone is found by club + shirt number + rating", () => {
  const p = pick("Atlético de Madrid,Giuliano,20,,81");
  expect(p.id).toBe("s1");
  expect(p.club).toBe("Atlético de Madrid"); // still placed where the file says
});

test("the club is matched loosely for this: 'de', 'FC', 'CF' don't matter", () => {
  expect(pick("Atletico Madrid,Giuliano,20,,81").id).toBe("s1");
  expect(pick("Club Atlético Madrid,Giuliano,20,,81").id).toBe("s1");
});

test("number AND score are both needed: a number alone, or a score alone, finds nobody", () => {
  expect(pick("Atlético de Madrid,Giuliano,20,,").id).toMatch(/^custom-/);
  expect(pick("Atlético de Madrid,Giuliano,,,81").id).toMatch(/^custom-/);
});

test("a wrong rating, a wrong number, or a different club finds nobody", () => {
  expect(pick("Atlético de Madrid,Giuliano,20,,80").id).toMatch(/^custom-/);
  expect(pick("Atlético de Madrid,Giuliano,21,,81").id).toMatch(/^custom-/);
  expect(pick("Chelsea,Giuliano,20,,81").id).toMatch(/^custom-/);
});

test("the rating tells apart two players in one club who share a number", () => {
  expect(pick("Atlético de Madrid,Someone,20,,70").id).toBe("s3");
});

test("if number + score still fits two players, nobody is guessed", () => {
  const twins: SeedPlayer[] = [
    { id: "x1", name: "A. One", position: "MID", value: 1, overall: 70, club: "Atlético Madrid", clubId: null, clubNumber: 9 },
    { id: "x2", name: "B. Two", position: "MID", value: 2, overall: 70, club: "Atlético Madrid", clubId: null, clubNumber: 9 },
    { id: "x3", name: "B. Saka", position: "FWD", value: 118, overall: 88, club: "Arsenal", clubId: null, clubNumber: 7 },
  ];
  const seed = parseRosterCsv(`${H}\nAtlético de Madrid,Mystery,9,,70\nArsenal,B. Saka,7,,88\n`, twins);
  expect(seed.find(p => p.name === "Mystery")!.id).toMatch(/^custom-/);
});

test("a name that matches wins over the number, and an id wins over both", () => {
  // name says Griezmann (#7, rated 86); number+score point at Simeone: the name wins
  expect(pick("Atlético de Madrid,A. Griezmann,20,,81").id).toBe("s2");
  // an id wins over everything
  expect(pick("Atlético de Madrid,Giuliano,20,s2,81").id).toBe("s2");
});

test("a player found this way is the catalog's, not an unknown: real value and rating", () => {
  const p = pick("Atlético de Madrid,Giuliano,20,,81");
  expect([p.value, p.overall]).toEqual([39.5, 81]);
});
