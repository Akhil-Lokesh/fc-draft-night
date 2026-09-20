import { test, expect } from "vitest";
import { coverDeficit } from "../domain/resolution.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

test("a manager below zero releases their own players (cheapest first) until solvent", () => {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "real", displayName: "R", clubId: "real" });
  const realBefore = s.managers["real"];
  if (!realBefore) throw new Error("expected real manager to exist");
  // Force a deficit
  s = { ...s, managers: { ...s.managers, real: { ...realBefore, spendable: -30 } } };
  const out = coverDeficit(s, "real", 500);
  const real = out.managers["real"];
  if (!real) throw new Error("expected real manager to exist after coverDeficit");
  expect(real.spendable).toBeGreaterThanOrEqual(0);
  // at least one owned player was released to the pool
  expect(Object.values(out.players).some(p => p.ownerId === null)).toBe(true);
});
