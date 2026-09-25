import { test, expect } from "vitest";
import { io as client } from "socket.io-client";
import { Db } from "../db.js";
import { FakeClock } from "../clock.js";
import { boot } from "./helpers.js";

/**
 * End-to-end: a host can create a room from an uploaded roster CSV naming ANY real FC26 club
 * (not just the built-in five), and managers then join by picking one of those clubs.
 */
test("a room can be created from an uploaded roster naming any real club", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  const a = client(url);

  // Find two real, non-big-5 clubs directly from the live catalog via search, so this test
  // doesn't hardcode values that could drift if the dataset changes.
  const chelseaPlayers = await new Promise<any[]>(res => {
    a.once("catalogResults", res);
    a.emit("searchCatalog", { club: "Chelsea", limit: 3 });
  });
  expect(chelseaPlayers.length).toBeGreaterThan(0);

  const csv = `club,player\n${chelseaPlayers.map(p => `Chelsea,${p.name}`).join("\n")}\nAtletico Madrid,J. Alvarez\n`;
  const created = new Promise<any>(res => a.once("created", res));
  a.emit("create", { totalBudget: 300, rosterCsv: csv });
  const { code } = await created;
  expect(code).toBeTruthy();

  const joined = new Promise<any>(res => a.once("joined", res));
  a.emit("join", { code, displayName: "Ana", clubId: "chelsea" });
  const { managerId } = await joined;
  expect(managerId).toBe("m_chelsea");

  a.close(); io.close(); http.close();
});

/**
 * setPool must never let the host accidentally add a player to the draft pool whose club is
 * already reserved by one of this room's managers — even for a custom-uploaded roster, where
 * the global catalog's own clubId tagging doesn't know this club is "taken" here.
 */
test("setPool rejects players from a club already claimed by a manager in this room", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  const a = client(url);

  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\n";
  const created = new Promise<any>(res => a.once("created", res));
  a.emit("create", { totalBudget: 300, rosterCsv: csv });
  const { code, hostKey } = await created;

  const joined = new Promise<any>(res => a.once("joined", res));
  a.emit("join", { code, displayName: "Ana", clubId: "chelsea", hostKey }); // creator claims host
  await joined;

  // A Chelsea player NOT named in the uploaded roster (so not already in the room) — Chelsea is
  // still Ana's club here, and the global catalog has no idea this room reserved it.
  const otherChelsea = await new Promise<any[]>(res => {
    a.once("catalogResults", res);
    a.emit("searchCatalog", { club: "Chelsea", limit: 30 });
  }).then(rs => rs.find((p: any) => p.name !== "C. Palmer" && p.name !== "M. Caicedo"));
  expect(otherChelsea).toBeTruthy();

  const stateAfter = new Promise<any>(res => a.once("state", res));
  a.emit("setPool", { code, ids: [otherChelsea.id] });
  const st = await stateAfter; // setPool always broadcasts state, even a no-op one
  expect(st.players[otherChelsea.id]).toBeUndefined();

  a.close(); io.close(); http.close();
});

/**
 * End-to-end: the richer tournament CSV format (metadata + TEAMS + SQUADS + POOL sections)
 * over the real socket — season number, per-club finishing-position budget differential, and
 * pool players are all live in room state from the moment the room is created.
 */
test("a tournament CSV sets season, per-club budgets from finishing position, and seeds the pool", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  const a = client(url);

  const csv = `
tournament,Friday Night League
season,2
budgetStep,50

## TEAMS
club,finishingPosition
Chelsea,2
Atletico Madrid,1

## SQUADS
club,player
Chelsea,C. Palmer
Chelsea,M. Caicedo
Atletico Madrid,J. Alvarez
Atletico Madrid,Pablo Barrios

## POOL
club,player
Newcastle United,Bruno Guimarães
`;
  const created = new Promise<any>(res => a.once("created", res));
  a.emit("create", { totalBudget: 300, rosterCsv: csv });
  const { code } = await created;

  const joined = new Promise<any>(res => a.once("state", res));
  a.emit("join", { code, displayName: "Ana", clubId: "chelsea" });
  const state = await joined;

  expect(state.seasonNumber).toBe(2);
  // worst-first: Chelsea (2nd) gets the base 300, Atletico (1st) gets base + 1*step = 350
  const ana = Object.values(state.managers as Record<string, any>)[0] as any;
  expect(ana.spendable).toBe(300 - ana.reserved);
  expect(state.clubBudgets["atletico-madrid"]).toBe(350);
  // pool player from the CSV's POOL section is already in the room, unowned
  const poolPlayer = Object.values(state.players as Record<string, any>).find((p: any) => p.name === "Bruno Guimarães") as any;
  expect(poolPlayer).toBeTruthy();
  expect(poolPlayer.ownerId).toBeNull();

  a.close(); io.close(); http.close();
});
