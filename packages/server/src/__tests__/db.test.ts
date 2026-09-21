import { test, expect } from "vitest";
import { Db } from "../db.js";
import { createRoom } from "@fcdn/shared";

test("saving a room snapshot and reloading returns identical state", () => {
  const db = new Db(":memory:");
  const s = createRoom({ code: "WXYZ", totalBudget: 600, seed: [] });
  db.save(s);
  const all = db.loadAll();
  expect(all.map(r => r.code)).toEqual(["WXYZ"]);
  expect(all[0]!.totalBudget).toBe(600);
});

test("saving the same room twice overwrites (write-through)", () => {
  const db = new Db(":memory:");
  const s = createRoom({ code: "WXYZ", totalBudget: 600, seed: [] });
  db.save(s);
  db.save({ ...s, status: "live" });
  expect(db.loadAll()[0]!.status).toBe("live");
});
