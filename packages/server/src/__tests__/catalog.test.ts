import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Catalog } from "../catalog.js";

test("search ranks by value descending", () => {
  const c = new Catalog();
  const res = c.search({ q: "a", limit: 20 });
  expect(res.length).toBe(20);
  for (let i = 1; i < res.length; i++) expect(res[i - 1]!.value).toBeGreaterThanOrEqual(res[i]!.value);
  expect(c.search({ q: "wirtz", limit: 5 })[0]!.name).toMatch(/Wirtz/);
});

test("search finds the stars of the five built-in clubs too, not just everyone else", () => {
  const c = new Catalog();
  // Each of these plays for one of the five built-in clubs; hiding them made search look broken.
  for (const [q, club] of [["musiala", "FC Bayern München"], ["pedri", "FC Barcelona"], ["saka", "Arsenal"], ["mbappé", "Real Madrid"], ["haaland", "Manchester City"]] as const) {
    const hit = c.search({ q, limit: 50 }).find(p => p.club === club);
    expect(hit, `${q} at ${club}`).toBeTruthy();
  }
});

test("search understands accents and full first names, like the game's own player names", () => {
  const c = new Catalog();
  expect(c.search({ q: "odegaard" }).some(p => p.name === "M. Ødegaard")).toBe(true);
  expect(c.search({ q: "mbappe" }).some(p => p.name === "K. Mbappé")).toBe(true);
  const erling = c.search({ q: "erling haaland" });
  expect(erling.some(p => p.name === "E. Haaland")).toBe(true);
  expect(erling.some(p => p.name === "M. Haaland")).toBe(false); // the namesake at Brann
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

test("byIds returns any catalog player by exact id, including a built-in club's (the room decides who is already taken)", () => {
  const rawPath = fileURLToPath(new URL("../data/fc26-catalog.json", import.meta.url));
  const raw = JSON.parse(readFileSync(rawPath, "utf-8")) as { id: string; clubId: string | null }[];
  const clubPlayer = raw.find(p => p.clubId === "real");
  expect(clubPlayer).toBeTruthy();

  const c = new Catalog();
  expect(c.byIds([clubPlayer!.id]).map(p => p.id)).toEqual([clubPlayer!.id]);
});
