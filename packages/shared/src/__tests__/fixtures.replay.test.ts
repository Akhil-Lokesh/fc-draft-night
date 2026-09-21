import { test, expect } from "vitest";
import { applyCommand } from "../domain/engine.js";
import { createRoom, addManager, type Player, type Manager, type Contest, type RoomState } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function player(s: RoomState, id: string): Player {
  const p = s.players[id];
  if (!p) throw new Error(`expected player ${id} to exist`);
  return p;
}

function manager(s: RoomState, id: string): Manager {
  const m = s.managers[id];
  if (!m) throw new Error(`expected manager ${id} to exist`);
  return m;
}

function contest(s: RoomState, id: string): Contest {
  const c = s.contests[id];
  if (!c) throw new Error(`expected contest ${id} to exist`);
  return c;
}

function live(totalBudget = 600) {
  let s = createRoom({ code: "AB", totalBudget, seed: fixtureSeed(), quoteTimerMs: 300_000 });
  for (const [id, clubId] of [["ars","arsenal"],["bay","bayern"],["real","real"],["bar","barca"],["city","city"]] as const)
    s = addManager(s, { id, displayName: id, clubId });
  return applyCommand(s, { type: "StartDraft", now: 0 }).state;
}

test("five-way Haaland fight closes on Bayern 220 after 5 minutes of silence", () => {
  let s = live();
  // Haaland is a pool player at 180. OpenListing seeds the contest at listed value; it does NOT
  // spend City's quote cap — City's real first quote is their 181 bid below.
  s = applyCommand(s, { type: "OpenListing", managerId: "city", playerId: "haaland", now: 0 }).state;
  // Escalate immediately: City 181, Barca 190, Arsenal 195, Bayern 200, City 205, Arsenal 215, Bayern 220
  const bids: [string, number, number][] = [
    ["city", 181, 10], ["bar", 190, 20], ["ars", 195, 30], ["bay", 200, 40],
    ["city", 205, 50], ["ars", 215, 60], ["bay", 220, 70],
  ];
  for (const [m, amt, now] of bids) s = applyCommand(s, { type: "PlaceBid", contestId: "c1", managerId: m, amount: amt, now }).state;
  // 5 minutes of silence after the last quote (70 + 300000)
  s = applyCommand(s, { type: "Tick", now: 70 + 300_000 }).state;
  expect(player(s, "haaland").ownerId).toBe("bay");
  expect(player(s, "haaland").listedValue).toBe(220);
  expect(contest(s, "c1").status).toBe("closed");
});

test("challenging a rival's owned player goes through the Challenge command, not OpenListing", () => {
  let s = live();
  // Barcelona challenges Real's Mbappé (owned, not pool) directly — must state an amount.
  s = applyCommand(s, { type: "Challenge", managerId: "bar", playerId: "mbappe", amount: 210, now: 0 }).state;
  const contestId = Object.keys(s.contests)[0];
  if (!contestId) throw new Error("expected a contest to have been opened");
  expect(contest(s, contestId).status).toBe("war"); // no 2-minute listing phase for a challenge
  // Real never defends; 5 minutes of silence closes it in Barcelona's favor at their actual bid (210), not listed value (200).
  s = applyCommand(s, { type: "Tick", now: 300_000 }).state;
  expect(player(s, "mbappe").ownerId).toBe("bar");
  expect(player(s, "mbappe").listedValue).toBe(210);
});

test("mock-draft budget snapshot: all five clubs forced to 250 spendable, end-of-hour totals match the pitch", () => {
  let s = live(600);
  // Simplify to the pitch's flat-250M-spendable scenario for every club, per the spec's worked mock draft.
  for (const id of ["ars", "bay", "real", "bar", "city"]) {
    s = { ...s, managers: { ...s.managers, [id]: { ...manager(s, id), spendable: 250 } } };
  }

  // 1) Mbappé (200 listed, Real's): Barcelona opens 220, Real raises 230, Arsenal joins 245, Real raises to 250.
  s = applyCommand(s, { type: "Challenge", managerId: "bar", playerId: "mbappe", amount: 220, now: 0 }).state; // -> c1
  s = applyCommand(s, { type: "PlaceBid", contestId: "c1", managerId: "real", amount: 230, now: 10 }).state;
  s = applyCommand(s, { type: "PlaceBid", contestId: "c1", managerId: "ars", amount: 245, now: 20 }).state;
  s = applyCommand(s, { type: "PlaceBid", contestId: "c1", managerId: "real", amount: 250, now: 30 }).state;

  // 2) Kane (100 listed, Bayern's): City opens 101, Bayern doesn't raise.
  s = applyCommand(s, { type: "Challenge", managerId: "city", playerId: "kane", amount: 101, now: 40 }).state; // -> c2

  // 3) Arsenal picks pool player Wirtz (60), uncontested.
  s = applyCommand(s, { type: "OpenListing", managerId: "ars", playerId: "wirtz", now: 50 }).state; // -> c3

  // 4) City challenges Barcelona for Pedri (60 listed) at 90, uncontested.
  s = applyCommand(s, { type: "Challenge", managerId: "city", playerId: "pedri", amount: 90, now: 60 }).state; // -> c4

  // 5) City also challenges Bayern for Musiala (70 listed) at 80, uncontested.
  s = applyCommand(s, { type: "Challenge", managerId: "city", playerId: "musiala", amount: 80, now: 70 }).state; // -> c5

  // A single tick well past every contest's own close time resolves everything, in close order
  // (c3's 2-min listing window closes first at 50+120000; the four wars close afterward in the
  // order their own 5-min anti-snipe windows lapse: c1 @ 300030, c2 @ 300040, c4 @ 300060, c5 @ 300070 —
  // so Kane and Pedri both resolve, deducting from City's spendable, BEFORE Musiala is attempted).
  s = applyCommand(s, { type: "Tick", now: 70 + 300_000 + 1 }).state;

  expect(player(s, "mbappe").ownerId).toBe("real");
  expect(manager(s, "real").spendable).toBe(200); // paid only the 50 increment above listed value

  expect(player(s, "kane").ownerId).toBe("city");
  expect(manager(s, "bay").spendable).toBe(350); // lost Kane, banked his listed 100 back, kept Musiala untouched

  expect(player(s, "wirtz").ownerId).toBe("ars");
  expect(manager(s, "ars").spendable).toBe(190); // picked up Wirtz for 60; capped out of the Mbappé fight, spent nothing there

  expect(player(s, "pedri").ownerId).toBe("city");
  expect(manager(s, "bar").spendable).toBe(310); // lost Pedri, banked his listed 60 back; spent nothing on Mbappé

  expect(player(s, "musiala").ownerId).toBe("bay"); // City's second deal voided, Musiala reverts untouched
  expect(manager(s, "city").spendable).toBe(34); // 250 - 101 (Kane) - 90 (Pedri) - 25 (overcommit fine) = 34
});
