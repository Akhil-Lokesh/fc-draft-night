import { test, expect } from "vitest";
import { cost, canAfford } from "../domain/budget.js";
import type { Player, Manager } from "../domain/types.js";

const player = (over: Partial<Player>): Player => ({
  id: "x", name: "X", position: "FWD", listedValue: 200, originalValue: 200,
  ownerId: null, lockedThisSeason: false, homeClub: null, ...over,
});
const mgr = (over: Partial<Manager>): Manager =>
  ({ id: "m", displayName: "M", clubId: "real", reserved: 0, spendable: 250, ...over });

test("acquiring a player not owned costs the full amount", () => {
  expect(cost(player({ ownerId: null }), "m", 220)).toBe(220);
});

test("defending an owned player costs only the increment above listed value", () => {
  expect(cost(player({ ownerId: "m", listedValue: 200 }), "m", 230)).toBe(30);
});

test("canAfford blocks a quote whose cost exceeds spendable", () => {
  const p = player({ ownerId: null, listedValue: 200 });
  expect(canAfford(mgr({ spendable: 210 }), p, 220)).toBe(false); // cost 220 > 210
  expect(canAfford(mgr({ spendable: 250 }), p, 220)).toBe(true);
});
