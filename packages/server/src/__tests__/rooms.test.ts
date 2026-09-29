import { test, expect } from "vitest";
import { RoomStore, uniqueCode } from "../rooms.js";
import { Queue } from "../queue.js";
import { Db } from "../db.js";
import { loadSeed, type SeedPlayer } from "@fcdn/shared";

const fullCatalog: SeedPlayer[] = [
  { id: "1", name: "C. Palmer", position: "MID", value: 109, overall: 87, club: "Chelsea", clubId: null },
  { id: "2", name: "M. Caicedo", position: "MID", value: 90, overall: 85, club: "Chelsea", clubId: null },
  { id: "3", name: "J. Alvarez", position: "FWD", value: 150, overall: 88, club: "Atlético Madrid", clubId: null },
];

function store() { return new RoomStore(new Queue(), new Db(":memory:"), loadSeed(), () => "CODE1"); }
function storeWithCatalog() { return new RoomStore(new Queue(), new Db(":memory:"), loadSeed(), () => "CODE1", fullCatalog); }

test("creating a room generates a code and persists it", async () => {
  const rs = store();
  const { code } = await rs.create({ totalBudget: 1500 }); // real FC26 dataset's budget floor is 1500
  expect(code).toBe("CODE1");
  expect(rs.get(code)!.status).toBe("setup");
});

test("budget below the floor is rejected", async () => {
  const rs = store();
  await expect(rs.create({ totalBudget: 100 })).rejects.toThrow(/budget too low/i);
});

test("joining assigns a club, reserves the squad, and blocks a taken club", async () => {
  const rs = store();
  const { code } = await rs.create({ totalBudget: 1500 });
  const m = await rs.join(code, { displayName: "Ana", clubId: "real" });
  expect(rs.get(code)!.managers[m.managerId]!.reserved).toBeGreaterThan(0);
  await expect(rs.join(code, { displayName: "Bo", clubId: "real" })).rejects.toThrow(/taken/i);
});

test("nobody can join once the draft has started, even with a free seat and an unclaimed club", async () => {
  const rs = store();
  const { code } = await rs.create({ totalBudget: 1500, capacity: 3 });
  await rs.join(code, { displayName: "Ana", clubId: "real" });
  await rs.join(code, { displayName: "Bo", clubId: "bayern" });
  await rs.run(code, s => ({ state: { ...s, status: "live" }, events: [] }));
  await expect(rs.join(code, { displayName: "Cy", clubId: "arsenal" })).rejects.toThrow(/already started/i);
  expect(Object.keys(rs.get(code)!.managers)).toHaveLength(2);
});

test("capacity outside 2..number-of-real-clubs is rejected", async () => {
  const rs = store();
  await expect(rs.create({ totalBudget: 1500, capacity: 1 })).rejects.toThrow(/capacity/i);
  await expect(rs.create({ totalBudget: 1500, capacity: 6 })).rejects.toThrow(/capacity/i);
});

test("a room at capacity rejects a new manager, even for an unclaimed club", async () => {
  const rs = store();
  const { code } = await rs.create({ totalBudget: 1500, capacity: 2 });
  await rs.join(code, { displayName: "Ana", clubId: "real" });
  await rs.join(code, { displayName: "Bo", clubId: "bayern" });
  await expect(rs.join(code, { displayName: "Cy", clubId: "arsenal" })).rejects.toThrow(/full/i);
});

test("an uploaded roster CSV seeds the room with any real club, not just the built-in five", async () => {
  const rs = storeWithCatalog();
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\n";
  const { code } = await rs.create({ totalBudget: 300, rosterCsv: csv });
  const { managerId } = await rs.join(code, { displayName: "Ana", clubId: "chelsea" });
  const room = rs.get(code)!;
  expect(room.managers[managerId]!.reserved).toBe(199); // Palmer + Caicedo
  expect(room.clubNames["chelsea"]).toBe("Chelsea");
  await rs.join(code, { displayName: "Bo", clubId: "atletico-madrid" });
  await expect(rs.join(code, { displayName: "Cy", clubId: "arsenal" })).rejects.toThrow(/full/i); // capacity = 2 clubs in this roster
});

test("an uploaded roster's club budget comes from its FC26 star rating, not the flat totalBudget", async () => {
  const rs = storeWithCatalog();
  // Chelsea and Atlético Madrid are both 4.5-star clubs in the ratings file => €1350M each,
  // regardless of the (much lower) totalBudget the host typed.
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\n";
  const { code } = await rs.create({ totalBudget: 300, rosterCsv: csv });
  const { managerId } = await rs.join(code, { displayName: "Ana", clubId: "chelsea" });
  const room = rs.get(code)!;
  expect(room.managers[managerId]!.spendable).toBe(1350 - 199); // 1350M budget - 199M reserved
});

test("a club the ratings file has never heard of just falls back to the flat totalBudget", async () => {
  const rs = storeWithCatalog();
  const csv = "club,player\nSome Sunday League FC,Nobody Famous\nChelsea,C. Palmer\n";
  const { code } = await rs.create({ totalBudget: 300, rosterCsv: csv });
  const { managerId } = await rs.join(code, { displayName: "Ana", clubId: "some-sunday-league-fc" });
  const room = rs.get(code)!;
  expect(room.managers[managerId]!.spendable).toBe(300 - room.managers[managerId]!.reserved);
});

test("an uploaded roster with a player the database doesn't know creates the room anyway, using average stats", async () => {
  const rs = storeWithCatalog();
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,Not A Real Player\nAtletico Madrid,J. Alvarez\n";
  const { code } = await rs.create({ totalBudget: 300, rosterCsv: csv });
  expect(code).toBeTruthy();
});

test("after a restart, new room codes skip ones already saved instead of overwriting them", async () => {
  const db = new Db(":memory:");
  // First "process": counter hands out A1.
  const first = new RoomStore(new Queue(), db, loadSeed(), uniqueCode(db, (() => { let n = 0; return () => `A${++n}`; })()));
  await first.create({ totalBudget: 1500 });
  // Restarted "process": its counter starts over at A1, which is taken — it must move on.
  const second = new RoomStore(new Queue(), db, loadSeed(), uniqueCode(db, (() => { let n = 0; return () => `A${++n}`; })()));
  second.loadFrom(db);
  const { code } = await second.create({ totalBudget: 1500 });
  expect(code).toBe("A2");
  expect(db.has("A1")).toBe(true);
});
