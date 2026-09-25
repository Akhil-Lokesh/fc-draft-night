import { test, expect } from "vitest";
import { parseTournamentCsv } from "../roster.js";
import type { SeedPlayer } from "@fcdn/shared";

const catalog: SeedPlayer[] = [
  { id: "1", name: "C. Palmer", position: "MID", value: 109, overall: 87, club: "Chelsea", clubId: null },
  { id: "2", name: "M. Caicedo", position: "MID", value: 90, overall: 85, club: "Chelsea", clubId: null },
  { id: "3", name: "J. Alvarez", position: "FWD", value: 150, overall: 88, club: "Atlético Madrid", clubId: null },
  { id: "4", name: "Pablo Barrios", position: "MID", value: 60, overall: 82, club: "Atlético Madrid", clubId: null },
  { id: "5", name: "F. Wirtz", position: "MID", value: 130, overall: 87, club: "Bayer Leverkusen", clubId: null },
];

const season1Csv = `
# comment line, ignored
tournament,Friday Night League
season,1
budgetStep,0

## TEAMS
club,finishingPosition
Chelsea,
Atletico Madrid,

## SQUADS
club,player
Chelsea,C. Palmer
Chelsea,M. Caicedo
Atletico Madrid,J. Alvarez
Atletico Madrid,Pablo Barrios

## POOL
club,player
Bayer Leverkusen,F. Wirtz
`;

test("parses season 1: metadata, squads, and pool — no finishing order", () => {
  const r = parseTournamentCsv(season1Csv, catalog);
  expect(r.tournamentName).toBe("Friday Night League");
  expect(r.seasonNumber).toBe(1);
  expect(r.budgetStep).toBe(0);
  expect(r.seed).toHaveLength(4);
  expect(r.poolSeed).toHaveLength(1);
  expect(r.poolSeed[0]!.name).toBe("F. Wirtz");
  expect(r.finishingOrder).toEqual([]);
});

test("season 1 with a filled-in finishing position is rejected — nobody has a rank yet", () => {
  const bad = season1Csv.replace("Chelsea,\n", "Chelsea,1\n");
  expect(() => parseTournamentCsv(bad, catalog)).toThrow(/season 1/i);
});

test("season 2 requires and parses finishing positions, worst-first", () => {
  const csv = season1Csv
    .replace("season,1", "season,2")
    .replace("Chelsea,\n", "Chelsea,1\n")
    .replace("Atletico Madrid,\n", "Atletico Madrid,2\n");
  const r = parseTournamentCsv(csv, catalog);
  expect(r.seasonNumber).toBe(2);
  expect(r.finishingOrder).toEqual(["atletico-madrid", "chelsea"]); // worst (2nd) first
});

test("season 2 missing a finishing position for a squad's club is rejected", () => {
  const csv = season1Csv.replace("season,1", "season,2").replace("Chelsea,\n", "Chelsea,1\n");
  expect(() => parseTournamentCsv(csv, catalog)).toThrow(/finishing position/i);
});

test("duplicate finishing positions are rejected", () => {
  const csv = season1Csv
    .replace("season,1", "season,2")
    .replace("Chelsea,\n", "Chelsea,1\n")
    .replace("Atletico Madrid,\n", "Atletico Madrid,1\n");
  expect(() => parseTournamentCsv(csv, catalog)).toThrow(/duplicate/i);
});

test("an unmatched player is still seeded (with average stats) in the tournament format, not rejected", () => {
  const csv = season1Csv.replace("Chelsea,C. Palmer", "Chelsea,Not A Real Player");
  const r = parseTournamentCsv(csv, catalog);
  const unknown = r.seed.find(p => p.name === "Not A Real Player")!;
  expect(unknown).toBeTruthy();
  expect(unknown.clubId).toBe("chelsea");
});

test("the SQUADS/POOL sections also accept the 4th 'id' column, same as the plain roster format", () => {
  const csv = `## TEAMS
club,finishingPosition
Chelsea,
Atletico Madrid,

## SQUADS
club,player,number,id
Chelsea,Anyone,,1
Atletico Madrid,J. Alvarez,,
`;
  const result = parseTournamentCsv(csv, catalog);
  const byId = result.seed.find(p => p.id === "1")!;
  expect(byId.name).toBe("C. Palmer");
  expect(byId.clubId).toBe("chelsea");
});

test("bad rows in both SQUADS and POOL are reported together in one error, not one section at a time", () => {
  const csv = `## TEAMS
club,finishingPosition
Chelsea,
Atletico Madrid,

## SQUADS
club,player,number
Chelsea,C. Palmer,0
Atletico Madrid,J. Alvarez,

## POOL
club,player,number
Bayer Leverkusen,F. Wirtz,-1
`;
  let message = "";
  try { parseTournamentCsv(csv, catalog); } catch (e) { message = (e as Error).message; }
  expect(message).toMatch(/SQUADS row 2:.*shirt number "0"/);
  expect(message).toMatch(/POOL row 2:.*shirt number "-1"/);
});

test("an unknown id in SQUADS or POOL falls back to name matching instead of blocking the tournament upload", () => {
  const csv = `## SQUADS
club,player,number,id
Chelsea,C. Palmer,,not-a-real-id
Atletico Madrid,J. Alvarez,,
`;
  const result = parseTournamentCsv(csv, catalog);
  expect(result.seed.find(p => p.name === "C. Palmer")!.value).toBe(109);
});

test("value/position overrides work the same way in the tournament SQUADS/POOL format", () => {
  const csv = `## TEAMS
club,finishingPosition
Chelsea,
Atletico Madrid,

## SQUADS
club,player,number,id,value,position
Chelsea,A Real Youth Player,,,1.2,MID
Atletico Madrid,J. Alvarez,,,,
`;
  const result = parseTournamentCsv(csv, catalog);
  const youth = result.seed.find(p => p.name === "A Real Youth Player")!;
  expect(youth.value).toBe(1.2);
  expect(youth.position).toBe("MID");
});
