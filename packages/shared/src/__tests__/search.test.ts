import { test, expect } from "vitest";
import { matchesName } from "../domain/search.js";

test("an empty query matches everyone", () => {
  expect(matchesName("E. Haaland", "")).toBe(true);
  expect(matchesName("E. Haaland", "   ")).toBe(true);
});

test("case and accents don't matter, either way round", () => {
  expect(matchesName("K. Mbappé", "mbappe")).toBe(true);
  expect(matchesName("M. Ødegaard", "odegaard")).toBe(true);
  expect(matchesName("M. Ødegaard", "ØDEGAARD")).toBe(true);
  expect(matchesName("J. Musiala", "MUSIALA")).toBe(true);
  expect(matchesName("Vini Jr.", "vini")).toBe(true);
  expect(matchesName("Pedri", "ped")).toBe(true);
});

test("part of a name is enough", () => {
  expect(matchesName("J. Bellingham", "belling")).toBe(true);
  expect(matchesName("J. Bellingham", "j. bell")).toBe(true);
});

test("a full first name finds the player the game writes as an initial", () => {
  expect(matchesName("E. Haaland", "erling haaland")).toBe(true);
  expect(matchesName("J. Bellingham", "jude bellingham")).toBe(true);
  expect(matchesName("B. Saka", "bukayo saka")).toBe(true);
  expect(matchesName("E. Haaland", "haaland erling")).toBe(true); // order doesn't matter
});

test("the first-name hint tells namesakes apart", () => {
  expect(matchesName("M. Haaland", "erling haaland")).toBe(false); // wrong initial
  expect(matchesName("Jobe Bellingham", "jude bellingham")).toBe(false); // spelled-out first name differs
  expect(matchesName("Jobe Bellingham", "jobe bellingham")).toBe(true);
});

test("a single letter is an initial, not 'any name containing that letter'", () => {
  expect(matchesName("E. Haaland", "e haaland")).toBe(true);
  expect(matchesName("M. Haaland", "e haaland")).toBe(false);
  expect(matchesName("E. Haaland", "e. haaland")).toBe(true);
});

test("every word has to match something", () => {
  expect(matchesName("E. Haaland", "erling mbappe")).toBe(false);
  expect(matchesName("E. Haaland", "zzz")).toBe(false);
});
