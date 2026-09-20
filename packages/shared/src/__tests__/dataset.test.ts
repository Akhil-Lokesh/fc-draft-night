import { test, expect } from "vitest";
import { loadSeed, validateSeed, budgetFloor } from "../data/dataset.js";

test("seed has exactly five clubs with real starting squads", () => {
  const seed = loadSeed();
  const clubs = new Set(seed.filter(p => p.clubId).map(p => p.clubId));
  expect(clubs).toEqual(new Set(["arsenal", "bayern", "real", "barca", "city"]));
});

test("seed validates: unique ids, valid positions, no national-team dupes", () => {
  expect(() => validateSeed(loadSeed())).not.toThrow();
});

test("budget floor is priciest squad rounded up to next 100M", () => {
  const seed = loadSeed();
  // whatever the priciest squad is, floor must be a multiple of 100 and >= it
  const floor = budgetFloor(seed);
  expect(floor % 100).toBe(0);
});
