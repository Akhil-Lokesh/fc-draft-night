import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

/**
 * Bug 3 (MEDIUM — defense in depth): byIds must enforce the same pool-eligibility guarantee
 * as search (clubId === null), even when a caller requests a club-owned player by its exact
 * id. Today this is only harmless by accident of a different module's invariant (addPoolPlayer
 * is a no-op for ids that already exist in room state) — byIds/setPool must guarantee it
 * themselves, not rely on that.
 */
test("byIds excludes club-owned players even when requested by exact id", () => {
  const rawPath = fileURLToPath(new URL("../data/fc26-catalog.json", import.meta.url));
  const raw = JSON.parse(readFileSync(rawPath, "utf-8")) as { id: string; clubId: string | null }[];
  const clubPlayer = raw.find(p => p.clubId === "real");
  expect(clubPlayer).toBeTruthy();

  const c = new Catalog();
  const byIds = c.byIds([clubPlayer!.id]);
  expect(byIds).toEqual([]);
});
