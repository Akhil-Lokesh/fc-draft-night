import { test, expect } from "vitest";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

test("adding a manager reserves their club's squad value and sets spendable", () => {
  let s = createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "m_real", displayName: "Ana", clubId: "real" });
  const real = s.managers["m_real"];
  if (!real) throw new Error("expected m_real manager to exist");
  // Real's reserved = sum of real players' listed values; spendable = 600 - reserved
  expect(real.reserved).toBeGreaterThan(0);
  expect(real.spendable).toBe(600 - real.reserved);
  // every real seed player is now owned by this manager, at listed value = seed value
  const owned = Object.values(s.players).filter(p => p.ownerId === "m_real");
  expect(owned.length).toBeGreaterThan(0);
  expect(owned.every(p => p.listedValue === p.originalValue)).toBe(true);
});

test("adding a manager never takes a player another manager already owns", () => {
  let s = createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed() });
  const squad = Object.values(s.players).filter(p => p.homeClub === "real");
  const stolen = squad[0]!;
  s = { ...s, players: { ...s.players, [stolen.id]: { ...stolen, ownerId: "m_barca" } } };
  s = addManager(s, { id: "m_real", displayName: "Ana", clubId: "real" });
  expect(s.players[stolen.id]!.ownerId).toBe("m_barca"); // still with the manager who won him
  const rest = squad.slice(1).reduce((sum, p) => sum + p.listedValue, 0);
  expect(s.managers["m_real"]!.reserved).toBe(rest); // and his value isn't reserved against the newcomer
});

test("createRoom defaults capacity to 5 and honors an explicit capacity", () => {
  const s = createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed() });
  expect(s.capacity).toBe(5);
  const s2 = createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed(), capacity: 3 });
  expect(s2.capacity).toBe(3);
});

test("a manager's starting budget uses their club's override when the room has one, else the flat totalBudget", () => {
  const s = createRoom({
    code: "ABCD", totalBudget: 600, seed: fixtureSeed(),
    clubBudgets: { real: 900 },
  });
  const withOverride = addManager(s, { id: "m_real", displayName: "Ana", clubId: "real" });
  const real = withOverride.managers["m_real"]!;
  expect(real.spendable).toBe(900 - real.reserved);

  const withoutOverride = addManager(s, { id: "m_barca", displayName: "Bo", clubId: "barca" });
  const barca = withoutOverride.managers["m_barca"]!;
  expect(barca.spendable).toBe(600 - barca.reserved);
});

test("createRoom honors an explicit seasonNumber, defaulting to 1", () => {
  expect(createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() }).seasonNumber).toBe(1);
  expect(createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed(), seasonNumber: 2 }).seasonNumber).toBe(2);
});
