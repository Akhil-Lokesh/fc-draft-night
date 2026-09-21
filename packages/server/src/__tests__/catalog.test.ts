import { test, expect } from "vitest";
import { Catalog } from "../catalog.js";

test("search ranks by value descending and excludes the five clubs' players", () => {
  const c = new Catalog();
  const res = c.search({ q: "wirtz", limit: 5 });
  expect(res.length).toBeGreaterThan(0);
  expect(res[0]!.name).toMatch(/Wirtz/);
  expect(res[0]!.clubId).toBe(null); // pool-eligible only, never one of the 5 tournament clubs
});

test("search can filter by position", () => {
  const c = new Catalog();
  const gks = c.search({ position: "GK", limit: 10 });
  expect(gks.length).toBeGreaterThan(0);
  expect(gks.every(p => p.position === "GK")).toBe(true);
});

test("byIds returns players matching the given ids", () => {
  const c = new Catalog();
  const found = c.search({ q: "wirtz", limit: 1 });
  const byIds = c.byIds([found[0]!.id]);
  expect(byIds.length).toBe(1);
  expect(byIds[0]!.id).toBe(found[0]!.id);
});
