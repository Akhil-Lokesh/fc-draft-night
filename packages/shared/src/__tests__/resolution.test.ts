import { test, expect } from "vitest";
import { finalizeContest, resolveDue, endDraftNow } from "../domain/resolution.js";
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

/**
 * The host's manual "end auction" action force-resolves every open contest right now, whatever
 * its own closesAt says, and closes the room — unlike the natural clock, which lets an active
 * war's own timer run out on its own.
 */
test("endDraftNow force-resolves every open contest immediately and closes the room", () => {
  let s = five();
  const contest = {
    id: "c1", playerId: "mbappe", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [{ managerId: "bar", amount: 250, at: 10 }],
    quoteCounts: { bar: 1 }, closesAt: 999_999_999, // far in the future — would never naturally resolve
  };
  s = { ...s, contests: { c1: contest } };
  const out = endDraftNow(s, 20);
  expect(out.status).toBe("closed");
  expect(out.contests["c1"]!.status).toBe("closed");
  expect(out.players["mbappe"]!.ownerId).toBe("bar");
});

/**
 * The natural draft clock (not the host button) must also end the draft once time's up and
 * nothing is left contested — otherwise the room sits at 0:00 forever showing "live".
 */
test("resolveDue closes the room once the draft clock has elapsed and no contests remain open", () => {
  let s = five();
  s = { ...s, draftClockMs: 100 }; // started at 0, so the clock is up at t=100
  const out = resolveDue(s, 150); // well past the clock, nothing open
  expect(out.status).toBe("closed");
});

test("resolveDue does NOT close the room past the clock while a war is still active (its own timer wins)", () => {
  let s = five();
  s = { ...s, draftClockMs: 100 };
  const contest = { id: "c1", playerId: "mbappe", type: "war" as const, status: "war" as const, listerId: null,
    quotes: [{ managerId: "bar", amount: 210, at: 10 }], quoteCounts: { bar: 1 }, closesAt: 300_000 };
  s = { ...s, contests: { c1: contest } };
  const out = resolveDue(s, 150); // past draftClockMs, but the war's own closesAt is nowhere near due
  expect(out.status).toBe("live");
  expect(out.contests["c1"]!.status).toBe("war");
});

test("resolveDue does not close the room before the draft clock has elapsed", () => {
  let s = five();
  s = { ...s, draftClockMs: 100 };
  const out = resolveDue(s, 50);
  expect(out.status).toBe("live");
});

// Releasing your own player is instant now (see listing.test.ts) — a "release-listing" contest
// can no longer be created through normal play. finalizeContest must still resolve one correctly
// if it ever shows up in room state (e.g. a leftover in-flight listing from before that change),
// so these build the contest directly rather than through openListing.
test("a release-listing nobody bid on logs 'unsold', not 'win' — no money moves, player just goes back to the lister (locked)", () => {
  let s = five();
  const spendBefore = s.managers["real"]!.spendable;
  const contest = {
    id: "c1", playerId: "mbappe", type: "release-listing" as const, status: "listing" as const, listerId: "real",
    quotes: [{ managerId: "real", amount: 200, at: 0 }], quoteCounts: {}, closesAt: 120_000,
  };
  s = { ...s, contests: { c1: contest } };
  const out = finalizeContest(s, "c1", 120_000);
  const entry = out.log.at(-1)!;
  expect(entry.t).toBe("unsold");
  expect((entry as any).managerId).toBe("real");
  expect(out.players["mbappe"]!.ownerId).toBe("real");
  expect(out.players["mbappe"]!.lockedThisSeason).toBe(true);
  expect(out.managers["real"]!.spendable).toBe(spendBefore); // no net cost
});

test("a release-listing a rival actually wins still logs 'win' — a real sale", () => {
  let s = five();
  const contest = {
    id: "c1", playerId: "mbappe", type: "release-listing" as const, status: "listing" as const, listerId: "real",
    quotes: [{ managerId: "real", amount: 200, at: 0 }, { managerId: "bar", amount: 210, at: 1 }],
    quoteCounts: { bar: 1 }, closesAt: 120_000,
  };
  s = { ...s, contests: { c1: contest } };
  const out = finalizeContest(s, "c1", 120_000);
  const entry = out.log.at(-1)!;
  expect(entry.t).toBe("win");
  expect((entry as any).managerId).toBe("bar");
  expect(out.players["mbappe"]!.ownerId).toBe("bar");
});

test("an owner who successfully outbids a rival to KEEP their own listed player still logs a real 'win', not 'unsold'", () => {
  let s = five();
  const spendBefore = s.managers["real"]!.spendable;
  const contest = {
    id: "c1", playerId: "mbappe", type: "release-listing" as const, status: "listing" as const, listerId: "real",
    quotes: [{ managerId: "real", amount: 200, at: 0 }, { managerId: "bar", amount: 210, at: 1 }, { managerId: "real", amount: 220, at: 2 }],
    quoteCounts: { bar: 1, real: 1 }, closesAt: 120_000,
  };
  s = { ...s, contests: { c1: contest } };
  const out = finalizeContest(s, "c1", 120_000);
  const entry = out.log.at(-1)!;
  expect(entry.t).toBe("win"); // a real, paid-for defense — not a no-op
  expect((entry as any).managerId).toBe("real");
  expect(out.players["mbappe"]!.ownerId).toBe("real");
  expect(out.managers["real"]!.spendable).toBe(spendBefore - 20); // paid the 20 raise over listed value
});
