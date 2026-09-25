import { test, expect } from "vitest";
import { starsFor, budgetForStars } from "../clubStars.js";

test("looks up a club's star rating by exact name", () => {
  expect(starsFor("Real Madrid")).toBe(5.0);
  expect(starsFor("Arsenal")).toBe(5.0);
});

test("name matching is loose — case/whitespace/accents don't matter", () => {
  expect(starsFor("  real madrid  ")).toBe(5.0);
});

test("resolves a club by an unambiguous looser name than the ratings file uses", () => {
  // The ratings file has "Bayern"; the catalog/roster spelling is "FC Bayern München".
  expect(starsFor("FC Bayern München")).toBe(5.0);
});

test("returns null for a club the ratings file has never heard of", () => {
  expect(starsFor("Some Sunday League FC")).toBeNull();
});

test("budgetForStars is linear: 5 stars = 1500M, every 0.5 stars down = 150M less", () => {
  expect(budgetForStars(5.0)).toBe(1500);
  expect(budgetForStars(4.5)).toBe(1350);
  expect(budgetForStars(3.0)).toBe(900);
  expect(budgetForStars(0.5)).toBe(150);
});
