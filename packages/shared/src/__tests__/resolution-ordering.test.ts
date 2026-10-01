import { test, expect } from "vitest";
import { resolveDue } from "../domain/resolution.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function five(totalBudget = 600) {
  let s = createRoom({ code: "AB", totalBudget, seed: fixtureSeed() });
  for (const [id, clubId] of [["ars", "arsenal"], ["bay", "bayern"], ["real", "real"], ["bar", "barca"], ["city", "city"]] as const)
    s = addManager(s, { id, displayName: id, clubId });
  return { ...s, status: "live" as const, startedAt: 0 };
}

test("deficit repair runs once per tick batch: a still-open war contest's player is never stolen mid-batch", () => {
  let s = five();

  // real owns mbappe(200) vini(180) bellingham(170) courtois(20) real_filler(10) => reserved 580, spendable 20.
  // Trim real's roster down to just courtois(20) so courtois is the ONLY releasable player and is
  // simultaneously the subject of a still-open contest (cY, due later in the same tick).
  const real0 = s.managers["real"];
  if (!real0) throw new Error("expected real manager to exist");
  const toRelease = ["mbappe", "vini", "bellingham", "real_filler"];
  let players = { ...s.players };
  let reservedTrim = 0;
  for (const id of toRelease) {
    const p = players[id];
    if (!p) throw new Error(`expected ${id} to exist`);
    reservedTrim += p.listedValue;
    players[id] = { ...p, ownerId: null };
  }
  s = { ...s, players, managers: { ...s.managers, real: { ...real0, reserved: real0.reserved - reservedTrim } } };
  // real now: reserved 20 (courtois only), spendable 20 (unchanged - releasing didn't touch spendable in this manual trim)

  // Contest Z: real overcommits on haaland (pool, value 180) with spendable only 20 -> unaffordable,
  // voided + 25M fine. Closes first (due earliest), driving real from spendable 20 to -5.
  const contestZ = {
    id: "cZ", playerId: "haaland", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [{ managerId: "real", amount: 180, at: 1 }], quoteCounts: { real: 1 }, closesAt: 50,
  };

  // Contest Y: a rival (bay) challenges real's own courtois, still open/unresolved (due later, same tick).
  // If deficit-repair fires between cZ and cY (per-contest, buggy), coverDeficit would force-release
  // courtois (real's only owned/releasable player) via fire sale BEFORE cY gets to finalize it through
  // its own war mechanics.
  const contestY = {
    id: "cY", playerId: "courtois", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [
      { managerId: "real", amount: 20, at: 1 }, // owner's seed-equivalent standing quote
      { managerId: "bay", amount: 30, at: 2 },
    ],
    quoteCounts: { real: 1, bay: 1 }, closesAt: 100,
  };

  s = { ...s, contests: { cZ: contestZ, cY: contestY } };

  const out = resolveDue(s, 999); // both due; close order cZ(50) then cY(100)

  const realAfter = out.managers["real"];
  const courtoisAfter = out.players["courtois"];
  const cY = out.contests["cY"];
  if (!realAfter || !courtoisAfter || !cY) throw new Error("expected real, courtois, cY to exist after resolve");

  // cY must resolve through its own war mechanics (bay outbid and wins), not have courtois
  // stolen by an interleaved deficit repair before cY was finalized.
  expect(courtoisAfter.ownerId).toBe("bay");
  expect(cY.status).toBe("closed");
  // real ends the batch solvent: the fine took him to -5, then selling courtois refunded his 20.
  expect(realAfter.spendable).toBeGreaterThanOrEqual(0);
  // Crucially: no fire-sale "release" of courtois should appear in the log. A per-contest deficit
  // repair (the bug) force-releases courtois to the pool via coverDeficit BEFORE cY's war finalizes,
  // even though courtois legitimately changes hands moments later through cY's own win mechanics.
  const releaseEntries = out.log.filter(e => e.t === "release" && e.playerId === "courtois");
  expect(releaseEntries).toHaveLength(0);
});
