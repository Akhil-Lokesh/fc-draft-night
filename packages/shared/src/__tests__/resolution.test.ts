import { test, expect } from "vitest";
import { finalizeContest, resolveDue } from "../domain/resolution.js";
import { createRoom, addManager, OVERCOMMIT_FINE } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function five(totalBudget = 600) {
  let s = createRoom({ code: "AB", totalBudget, seed: fixtureSeed() });
  for (const [id, clubId] of [["ars","arsenal"],["bay","bayern"],["real","real"],["bar","barca"],["city","city"]] as const)
    s = addManager(s, { id, displayName: id, clubId });
  return { ...s, status: "live" as const, startedAt: 0 };
}

test("Mbappé: owner keeps player; a losing owner would release reserved back to spendable", () => {
  // Barcelona wins Mbappé (owned by real) at 250; real releases his 200 reserved back to spendable.
  let s = five();
  const realBefore = s.managers["real"];
  const barBefore = s.managers["bar"];
  if (!realBefore || !barBefore) throw new Error("expected real and bar managers to exist");
  const contest = {
    id: "c1", playerId: "mbappe", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [{ managerId: "bar", amount: 250, at: 10 }],
    quoteCounts: { bar: 1 }, closesAt: 10,
  };
  s = { ...s, contests: { c1: contest } };
  const out = finalizeContest(s, "c1", 300_010);
  const mbappe = out.players["mbappe"];
  const bar = out.managers["bar"];
  const real = out.managers["real"];
  if (!mbappe || !bar || !real) throw new Error("expected mbappe, bar, real to exist after finalize");
  expect(mbappe.ownerId).toBe("bar");
  expect(mbappe.listedValue).toBe(250); // transfer price becomes new listed value
  expect(bar.spendable).toBe(barBefore.spendable - 250); // buyer pays full
  expect(real.reserved).toBe(realBefore.reserved - 200); // released reserved
  expect(real.spendable).toBe(realBefore.spendable + 200);
});

test("City double-deal: first close pays; the unaffordable second voids to prev owner + 25M fine", () => {
  let s = five();
  // Give city exactly enough for one deal (Pedri 90) but not both (+ Musiala 80).
  const cityBefore = s.managers["city"];
  if (!cityBefore) throw new Error("expected city manager to exist");
  s = { ...s, managers: { ...s.managers, city: { ...cityBefore, spendable: 149 } } };
  const pedri = { id: "cP", playerId: "pedri", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [{ managerId: "city", amount: 90, at: 1 }], quoteCounts: { city: 1 }, closesAt: 100 };
  const musiala = { id: "cM", playerId: "musiala", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [{ managerId: "city", amount: 80, at: 2 }], quoteCounts: { city: 1 }, closesAt: 200 };
  s = { ...s, contests: { cP: pedri, cM: musiala } };
  const out = resolveDue(s, 999); // both due; close in order cP then cM
  const pedriPlayer = out.players["pedri"];
  const musialaPlayer = out.players["musiala"];
  const cityAfter = out.managers["city"];
  const cM = out.contests["cM"];
  if (!pedriPlayer || !musialaPlayer || !cityAfter || !cM) throw new Error("expected pedri, musiala, city, cM to exist after resolve");
  expect(pedriPlayer.ownerId).toBe("city");        // first deal honored
  expect(cityAfter.spendable).toBe(149 - 90 - OVERCOMMIT_FINE); // 34
  expect(musialaPlayer.ownerId).toBe("bay");       // reverts to Bayern
  expect(cM.status).toBe("voided");
});
