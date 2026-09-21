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

test("createRoom defaults capacity to 5 and honors an explicit capacity", () => {
  const s = createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed() });
  expect(s.capacity).toBe(5);
  const s2 = createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed(), capacity: 3 });
  expect(s2.capacity).toBe(3);
});
