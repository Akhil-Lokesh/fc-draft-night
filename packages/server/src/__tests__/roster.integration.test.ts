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
  a.emit("create", { totalBudget: 1500, rosterCsv: csv });
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
  a.emit("create", { totalBudget: 1500, rosterCsv: csv });
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
 * Pool search is per room: it hides only the players already in THIS room (squads, pool), and lets
 * the host pick anyone else — including stars of the five built-in clubs when this room doesn't use them.
 */
test("pool search hides players already in the room but finds everyone else, built-in clubs' stars included", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  const a = client(url);
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\n";
  const created = new Promise<any>(res => a.once("created", res));
  a.emit("create", { totalBudget: 1500, rosterCsv: csv });
  const { code, hostKey } = await created;
  const joined = new Promise<any>(res => a.once("joined", res));
  a.emit("join", { code, displayName: "Ana", clubId: "chelsea", hostKey });
  await joined;

  const search = (q: Record<string, unknown>) => new Promise<any[]>(res => { a.once("catalogResults", res); a.emit("searchCatalog", q); });

  const palmers = await search({ q: "palmer", code });
  expect(palmers.some((p: any) => p.name === "C. Palmer")).toBe(false); // already in Chelsea's squad here
  expect(palmers.length).toBeGreaterThan(0); // other Palmers remain

  const musiala = await search({ q: "musiala", code });
  expect(musiala.map((p: any) => p.club)).toContain("FC Bayern München"); // Bayern isn't in this room

  a.close(); io.close(); http.close();
});

test("the host can put a built-in club's star into a roster room's pool", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  const a = client(url);
  const csv = "club,player\nChelsea,C. Palmer\nAtletico Madrid,J. Alvarez\n";
  const created = new Promise<any>(res => a.once("created", res));
  a.emit("create", { totalBudget: 1500, rosterCsv: csv });
  const { code, hostKey } = await created;
  const joined = new Promise<any>(res => a.once("joined", res));
  a.emit("join", { code, displayName: "Ana", clubId: "chelsea", hostKey });
  await joined;

  const hits = await new Promise<any[]>(res => { a.once("catalogResults", res); a.emit("searchCatalog", { q: "musiala", code }); });
  const musiala = hits.find((p: any) => p.club === "FC Bayern München")!;
  expect(musiala).toBeTruthy();

  const stateAfter = new Promise<any>(res => a.once("state", res));
  a.emit("setPool", { code, ids: [musiala.id] });
  const st = await stateAfter;
  expect(st.players[musiala.id]).toBeTruthy();
  expect(st.players[musiala.id].ownerId).toBeNull(); // a free agent anyone can claim

  a.close(); io.close(); http.close();
});

test("in a built-in room, players already in the room don't show up in pool search again", async () => {
  const { url, io, http, store } = await boot(new Db(":memory:"), new FakeClock(0));
  await store.create({ totalBudget: 1500 });
  const a = client(url);
  const hits = await new Promise<any[]>(res => { a.once("catalogResults", res); a.emit("searchCatalog", { q: "musiala", code: "TEST1" }); });
  expect(hits.filter((p: any) => p.club === "FC Bayern München")).toEqual([]); // Bayern's squad is already in this room
  a.close(); io.close(); http.close();
});

/**
 * End-to-end: the richer tournament CSV format (metadata + TEAMS + SQUADS + POOL sections)
 * over the real socket — season number, per-club finishing-position budget differential, and
 * pool players are all live in room state from the moment the room is created.
 */
test("a tournament CSV sets season, per-club budgets from leftover + standings, and seeds the pool", async () => {
  const { url, io, http } = await boot(new Db(":memory:"), new FakeClock(0));
  const a = client(url);

  const csv = `
tournament,Friday Night League
season,2

## TEAMS
club,finishingPosition,leftover
Chelsea,2,40
Atletico Madrid,1,25

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
  a.emit("create", { rosterCsv: csv });
  const { code } = await created;

  const joined = new Promise<any>(res => a.once("state", res));
  a.emit("join", { code, displayName: "Ana", clubId: "chelsea" });
  const state = await joined;

  expect(state.seasonNumber).toBe(2);
  expect(state.tournamentName).toBe("Friday Night League"); // kept on the room, shown at full time
  // Chelsea finished last: just its leftover (40). Atletico won it: leftover 25 + one place above last (20) = 45.
  const ana = Object.values(state.managers as Record<string, any>)[0] as any;
  expect(ana.spendable).toBeCloseTo(40, 5);
  const squadOf = (club: string) => (Object.values(state.players as Record<string, any>) as any[])
    .filter((p) => p.homeClub === club).reduce((sum, p) => sum + p.originalValue, 0);
  expect(state.clubBudgets["atletico-madrid"] - squadOf("atletico-madrid")).toBeCloseTo(45, 5);
  expect(state.clubBudgets["chelsea"] - squadOf("chelsea")).toBeCloseTo(40, 5);
  // pool player from the CSV's POOL section is already in the room, unowned
  const poolPlayer = Object.values(state.players as Record<string, any>).find((p: any) => p.name === "Bruno Guimarães") as any;
  expect(poolPlayer).toBeTruthy();
  expect(poolPlayer.ownerId).toBeNull();

  a.close(); io.close(); http.close();
});
