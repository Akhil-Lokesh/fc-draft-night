import { test, expect } from "vitest";
import { RoomStore, uniqueCode } from "../rooms.js";
import { Queue } from "../queue.js";
import { Db } from "../db.js";
import { loadSeed, type SeedPlayer } from "@fcdn/shared";
import { Catalog } from "../catalog.js";

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

test("a store with no built-in squads refuses a room that brings no roster, and accepts one that does", async () => {
  const rs = new RoomStore(new Queue(), new Db(":memory:"), [], () => "CODE1", fullCatalog);
  await expect(rs.create({ totalBudget: 1500 })).rejects.toThrow(/roster/i); // no dataset, no teams
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\n";
  await expect(rs.create({ totalBudget: 1500, rosterCsv: csv })).resolves.toEqual({ code: "CODE1" });
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
  const { code } = await rs.create({ totalBudget: 1500, rosterCsv: csv });
  const { managerId } = await rs.join(code, { displayName: "Ana", clubId: "chelsea" });
  const room = rs.get(code)!;
  expect(room.managers[managerId]!.reserved).toBe(199); // Palmer + Caicedo
  expect(room.clubNames["chelsea"]).toBe("Chelsea");
  await rs.join(code, { displayName: "Bo", clubId: "atletico-madrid" });
  await expect(rs.join(code, { displayName: "Cy", clubId: "arsenal" })).rejects.toThrow(/full/i); // capacity = 2 clubs in this roster
});

test("an uploaded roster's club budget comes from its FC26 star rating, scaled from the 5-star budget", async () => {
  const rs = storeWithCatalog();
  // Chelsea and Atlético Madrid are both 4.5-star clubs in the ratings file => €1350M each
  // when the host's 5-star budget is the default €1500M.
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\n";
  const { code } = await rs.create({ totalBudget: 1500, rosterCsv: csv });
  const { managerId } = await rs.join(code, { displayName: "Ana", clubId: "chelsea" });
  const room = rs.get(code)!;
  expect(room.managers[managerId]!.spendable).toBe(1350 - 199); // 1350M budget - 199M reserved
});

test("the budget the host types is what a 5-star club gets; lower-rated clubs get 150M less per half star", async () => {
  const rs = storeWithCatalog();
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\n"; // both 4.5 stars
  const { code } = await rs.create({ totalBudget: 1800, rosterCsv: csv });
  const { managerId } = await rs.join(code, { displayName: "Ana", clubId: "chelsea" });
  const room = rs.get(code)!;
  expect(room.clubBudgets["chelsea"]).toBe(1650); // 1800 for 5 stars, minus 150 for the half star
  expect(room.managers[managerId]!.spendable).toBe(1650 - 199);
});

test("a club whose squad is worth more than its budget starts in the red, not refused", async () => {
  const catalog = new Catalog().raw();
  const rs = new RoomStore(new Queue(), new Db(":memory:"), [], () => "CODE1", catalog);
  const real = catalog.filter(p => p.club === "Real Madrid");
  const extras = catalog.filter(p => p.club !== "Real Madrid").sort((a, b) => b.value - a.value).slice(0, 2); // two more stars: ~1730M vs 1500M
  const csv = "club,player\n" + [...real, ...extras].map(p => `Real Madrid,${p.name}`).join("\n") + "\nArsenal,B. Saka\n";
  const { code } = await rs.create({ totalBudget: 1500, rosterCsv: csv }); // a 5-star budget of 1500 vs a ~1730 squad
  const { managerId } = await rs.join(code, { displayName: "Ana", clubId: "real-madrid" });
  const m = rs.get(code)!.managers[managerId]!;
  expect(m.spendable).toBeLessThan(0);
  expect(m.spendable).toBeCloseTo(1500 - m.reserved, 5);
});

test("a 5-star budget under 1500M is refused, so even a half-star club keeps some money", async () => {
  const rs = storeWithCatalog();
  const csv = "club,player\nChelsea,C. Palmer\nAtletico Madrid,J. Alvarez\n";
  await expect(rs.create({ totalBudget: 1499, rosterCsv: csv })).rejects.toThrow(/budget too low/i);
});

test("a club the ratings file has never heard of just falls back to the flat totalBudget", async () => {
  const rs = storeWithCatalog();
  const csv = "club,player\nSome Sunday League FC,Nobody Famous\nChelsea,C. Palmer\n";
  const { code } = await rs.create({ totalBudget: 1500, rosterCsv: csv });
  const { managerId } = await rs.join(code, { displayName: "Ana", clubId: "some-sunday-league-fc" });
  const room = rs.get(code)!;
  expect(room.managers[managerId]!.spendable).toBe(1500 - room.managers[managerId]!.reserved);
});

test("an uploaded roster with a player the database doesn't know creates the room anyway, using average stats", async () => {
  const rs = storeWithCatalog();
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,Not A Real Player\nAtletico Madrid,J. Alvarez\n";
  const { code } = await rs.create({ totalBudget: 1500, rosterCsv: csv });
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
