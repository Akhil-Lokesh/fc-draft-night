import { test, expect } from "vitest";
import { RoomStore } from "../rooms.js";
import { Queue } from "../queue.js";
import { Db } from "../db.js";
import { loadSeed } from "@fcdn/shared";

function store() { return new RoomStore(new Queue(), new Db(":memory:"), loadSeed(), () => "CODE1"); }

test("creating a room generates a code and persists it", async () => {
  const rs = store();
  const { code } = await rs.create({ totalBudget: 1500 }); // real FC26 dataset's budget floor is 1500
  expect(code).toBe("CODE1");
  expect(rs.get(code)!.status).toBe("setup");
});

test("budget below the floor is rejected", async () => {
  const rs = store();
  await expect(rs.create({ totalBudget: 100 })).rejects.toThrow(/floor/i);
});

test("joining assigns a club, reserves the squad, and blocks a taken club", async () => {
  const rs = store();
  const { code } = await rs.create({ totalBudget: 1500 });
  const m = await rs.join(code, { displayName: "Ana", clubId: "real" });
  expect(rs.get(code)!.managers[m.managerId]!.reserved).toBeGreaterThan(0);
  await expect(rs.join(code, { displayName: "Bo", clubId: "real" })).rejects.toThrow(/taken/i);
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
