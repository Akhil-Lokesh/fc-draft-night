import { test, expect } from "vitest";
import { positionStepBudgets, startNextSeason, releaseToOriginal } from "../domain/season.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

test("finishing position sets base budgets in 20M steps from the bottom", () => {
  // order = worst..best; base for last place = floor
  const bases = positionStepBudgets(["5th","4th","3rd","2nd","1st"], 600, 20);
  expect(bases).toEqual({ "5th": 600, "4th": 620, "3rd": 640, "2nd": 660, "1st": 680 });
});

test("next season carries leftover spendable on top of the new base and keeps risen prices", () => {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "real", displayName: "R", clubId: "real" });
  const realBefore = s.managers["real"];
  const mbappeBefore = s.players["mbappe"];
  if (!realBefore || !mbappeBefore) throw new Error("expected real manager and mbappe player to exist");
  // simulate: real held 10 spendable leftover, Mbappe now permanently 250
  s = { ...s,
    managers: { ...s.managers, real: { ...realBefore, spendable: 10 } },
    players: { ...s.players, mbappe: { ...mbappeBefore, listedValue: 250 } } };
  const next = startNextSeason(s, { finishingOrder: ["real"], base: 600, step: 20 });
  const realAfter = next.managers["real"];
  const mbappeAfter = next.players["mbappe"];
  if (!realAfter || !mbappeAfter) throw new Error("expected real manager and mbappe player to exist after startNextSeason");
  // one team: base 600 + leftover 10; reserved recomputed off current listed values (Mbappe 250)
  expect(realAfter.spendable).toBe(600 + 10 - realAfter.reserved);
  expect(mbappeAfter.listedValue).toBe(250); // permanent
  expect(mbappeAfter.lockedThisSeason).toBe(false); // unlocked for the new draft
  expect(next.seasonNumber).toBe(2);
});

test("releasing a held player resets him to his original dataset value", () => {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "real", displayName: "R", clubId: "real" });
  const mbappeBefore = s.players["mbappe"];
  if (!mbappeBefore) throw new Error("expected mbappe player to exist");
  s = { ...s, players: { ...s.players, mbappe: { ...mbappeBefore, listedValue: 250 } } };
  const out = releaseToOriginal(s, "real", "mbappe");
  const mbappeAfter = out.players["mbappe"];
  if (!mbappeAfter) throw new Error("expected mbappe player to exist after release");
  expect(mbappeAfter.ownerId).toBe(null);
  expect(mbappeAfter.listedValue).toBe(mbappeAfter.originalValue); // back to 200
});
