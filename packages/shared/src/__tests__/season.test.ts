import { test, expect } from "vitest";
import { positionStepBudgets, startNextSeason, releaseToOriginal } from "../domain/season.js";
import { createRoom, addManager, OVERCOMMIT_FINE } from "../domain/types.js";
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
  // simulate: real held 10 spendable leftover, Mbappe now permanently 220 (risen, but still affordable
  // under the new budget so this test stays isolated from the reserved-outgrows-budget/fine path,
  // which has its own dedicated test below).
  s = { ...s,
    managers: { ...s.managers, real: { ...realBefore, spendable: 10 } },
    players: { ...s.players, mbappe: { ...mbappeBefore, listedValue: 220 } } };
  const next = startNextSeason(s, { finishingOrder: ["real"], base: 600, step: 20 });
  const realAfter = next.managers["real"];
  const mbappeAfter = next.players["mbappe"];
  if (!realAfter || !mbappeAfter) throw new Error("expected real manager and mbappe player to exist after startNextSeason");
  // one team: base 600 + leftover 10; reserved recomputed off current listed values (Mbappe 220)
  expect(realAfter.spendable).toBe(600 + 10 - realAfter.reserved);
  expect(mbappeAfter.listedValue).toBe(220); // permanent
  expect(mbappeAfter.lockedThisSeason).toBe(false); // unlocked for the new draft
  expect(next.seasonNumber).toBe(2);
});

test("reserved outgrows new budget at handoff: resolves like a negative balance PLUS the 25M fine (spec §4.9)", () => {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "real", displayName: "R", clubId: "real" });
  const realBefore = s.managers["real"];
  const mbappeBefore = s.players["mbappe"];
  if (!realBefore || !mbappeBefore) throw new Error("expected real manager and mbappe player to exist");
  // Inflate Mbappé's held value (as if won in a fierce war last season) and zero out leftover
  // spendable, so the new base budget can't cover reserved.
  s = { ...s,
    managers: { ...s.managers, real: { ...realBefore, spendable: 0 } },
    players: { ...s.players, mbappe: { ...mbappeBefore, listedValue: 250 } } };
  const logLenBefore = s.log.length;
  // New base budget of 600 (same as before) — reserved (250+180+170+20+10=630) exceeds it by 30,
  // and covering the 25M fine on top requires releasing more than one player.
  const next = startNextSeason(s, { finishingOrder: ["real"], base: 600, step: 0 });
  const realAfter = next.managers["real"];
  if (!realAfter) throw new Error("expected real manager to exist after startNextSeason");

  // (a) manager ends up solvent
  expect(realAfter.spendable).toBeGreaterThanOrEqual(0);
  // (b) log contains a "fine" entry for real with amount === 25
  const fineEntries = next.log.filter(e => e.t === "fine" && e.managerId === "real");
  expect(fineEntries).toHaveLength(1);
  expect(fineEntries[0]).toMatchObject({ amount: OVERCOMMIT_FINE });
  expect(OVERCOMMIT_FINE).toBe(25);
  // (c) at least one player was released to the pool
  expect(Object.values(next.players).some(p => p.ownerId === null)).toBe(true);
  // sanity: log actually grew (not just carried over the wiped pre-season log, since startNextSeason resets log)
  expect(next.log.length).toBeGreaterThan(0);
  void logLenBefore;
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
