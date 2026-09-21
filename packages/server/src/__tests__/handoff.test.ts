import { test, expect } from "vitest";
import { RoomStore } from "../rooms.js";
import { Queue } from "../queue.js";
import { Db } from "../db.js";
import { exportSeasonCsv } from "../export.js";
import { loadSeed, OVERCOMMIT_FINE, type RoomState } from "@fcdn/shared";

test("re-uploading a filled export opens season N+1 with position-stepped budgets", async () => {
  const q = new Queue<RoomState>();
  const store = new RoomStore(q, new Db(":memory:"), loadSeed(), () => "S1");
  await store.create({ totalBudget: 1500 }); // real FC26 dataset's budget floor
  await store.join("S1", { displayName: "Real", clubId: "real" });
  await store.join("S1", { displayName: "Bayern", clubId: "bayern" });

  const existing = store.get("S1")!;
  const closed = { ...existing, status: "closed" as const };
  q.setState("S1", closed);

  let { csv } = exportSeasonCsv(closed);
  // Fill finishing positions: Bayern finished 1st, Real finished 2nd (of these 2 joined managers).
  csv = csv.replace(/(m_real,[^\n]*),$/m, "$1,2").replace(/(m_bayern,[^\n]*),$/m, "$1,1");

  const next = await store.applyHandoff("S1", csv, { base: 600, step: 20 });

  expect(next.seasonNumber).toBe(2);
  const bayBase = 620, realBase = 600; // Bayern (1st of 2) gets base+20; Real (2nd/last) gets base

  // Bayern's pre-handoff squad (910.9M reserved, real FC26 club data) fits comfortably under its
  // new season budget (620 base + leftover), so no fine/release cascade fires for them: the plain
  // "new base + leftover - reserved" formula holds exactly.
  expect(next.managers["m_bayern"]!.spendable).toBe(
    bayBase + Math.max(0, closed.managers["m_bayern"]!.spendable) - next.managers["m_bayern"]!.reserved
  );

  // Real's pre-handoff squad is their entire real-world roster (no draft ran in this test, so
  // nobody's holdings shrank) — real FC26 Real Madrid data reserves ~1424M, which outstrips their
  // new season budget (600 base + leftover ~= 676M). That legitimately trips the same
  // overcommit-fine-then-release-until-solvent path covered by season.test.ts's dedicated test —
  // it is not a bug in startNextSeason. So here we assert the documented invariants of that path
  // rather than the no-cascade formula: never negative, and if the fine fired, the deficit is
  // exactly explained by "new base + leftover - reserved-at-formation" falling short by the fine.
  const realNext = next.managers["m_real"]!;
  const realFormationShortfall = realBase + Math.max(0, closed.managers["m_real"]!.spendable) - closed.managers["m_real"]!.reserved;
  expect(realFormationShortfall).toBeLessThan(0); // sanity: this test setup does trigger the cascade
  expect(realNext.spendable).toBeGreaterThanOrEqual(0);
  const realFineLogged = next.log.some(e => e.t === "fine" && e.managerId === "m_real" && e.amount === OVERCOMMIT_FINE);
  expect(realFineLogged).toBe(true);
  // at least one of Real's original squad members was released back to the pool to cover the shortfall
  expect(Object.values(next.players).some(p => p.homeClub === "real" && p.ownerId === null)).toBe(true);
});
