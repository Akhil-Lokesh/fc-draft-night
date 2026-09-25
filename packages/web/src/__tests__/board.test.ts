import { test, expect } from "vitest";
import { myOpenListings, splitMySquad } from "../lib/board.js";

function room(overrides: Partial<any> = {}): any {
  return {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs: 3_600_000, squadSizeCap: null,
    seasonNumber: 1, status: "live", startedAt: 0,
    managers: { m_real: { id: "m_real", displayName: "Real", clubId: "real", reserved: 200, spendable: 400 } },
    players: {
      mbappe: { id: "mbappe", name: "Mbappé", position: "FWD", listedValue: 200, originalValue: 200, ownerId: "m_real", lockedThisSeason: false, homeClub: "real" },
    },
    contests: {}, challenges: {}, log: [], seq: 0,
    ...overrides,
  };
}

test("myOpenListings finds a player I have an open release-listing on", () => {
  const r = room({
    contests: {
      c1: { id: "c1", playerId: "mbappe", type: "release-listing", status: "listing", listerId: "m_real", quotes: [{ managerId: "m_real", amount: 200, at: 0 }], quoteCounts: {}, closesAt: 120_000 },
    },
  });
  const listed = myOpenListings(r, "m_real");
  expect(listed).toEqual([{ id: "mbappe", name: "Mbappé", price: 200, closesAt: 120_000, contested: false }]);
});

test("myOpenListings flags a self-release that's been challenged into a war as contested", () => {
  const r = room({
    contests: {
      c1: { id: "c1", playerId: "mbappe", type: "release-listing", status: "war", listerId: "m_real", quotes: [{ managerId: "m_real", amount: 200, at: 0 }, { managerId: "m_bar", amount: 210, at: 5 }], quoteCounts: { m_bar: 1 }, closesAt: 300_000 },
    },
  });
  const listed = myOpenListings(r, "m_real");
  expect(listed).toEqual([{ id: "mbappe", name: "Mbappé", price: 210, closesAt: 300_000, contested: true }]);
});

test("myOpenListings ignores a closed listing and a listing that isn't mine", () => {
  const r = room({
    contests: {
      c1: { id: "c1", playerId: "mbappe", type: "release-listing", status: "closed", listerId: "m_real", quotes: [], quoteCounts: {}, closesAt: 0 },
      c2: { id: "c2", playerId: "mbappe", type: "release-listing", status: "listing", listerId: "m_bar", quotes: [], quoteCounts: {}, closesAt: 0 },
    },
  });
  expect(myOpenListings(r, "m_real")).toEqual([]);
});

// Regression: a player mid-release-listing (2-minute window, nobody's bid yet) must not sit in
// Starting looking untouched — that's exactly what a user reported as "release did nothing".
test("splitMySquad pulls a currently-listed player out of Starting into its own 'listed' bucket", () => {
  const r = room({
    contests: {
      c1: { id: "c1", playerId: "mbappe", type: "release-listing", status: "listing", listerId: "m_real", quotes: [{ managerId: "m_real", amount: 200, at: 0 }], quoteCounts: {}, closesAt: 120_000 },
    },
  });
  const squad = splitMySquad(r, "m_real");
  expect(squad.starting.map((p: any) => p.id)).not.toContain("mbappe");
  expect(squad.listed.map((p) => p.id)).toEqual(["mbappe"]);
});

// Regression: without this, a self-release that a rival bids on (escalating listing -> war)
// fell straight back into a plain, still-clickable "release" row in Starting the instant it
// stopped being a plain listing — inviting a second, independently-resolving release on the
// same already-contested player (see shared/domain's matching hasOpenContest guard).
test("splitMySquad keeps a war-escalated self-release out of Starting too, not just a plain listing", () => {
  const r = room({
    contests: {
      c1: { id: "c1", playerId: "mbappe", type: "release-listing", status: "war", listerId: "m_real", quotes: [{ managerId: "m_real", amount: 200, at: 0 }, { managerId: "m_bar", amount: 210, at: 5 }], quoteCounts: { m_bar: 1 }, closesAt: 300_000 },
    },
  });
  const squad = splitMySquad(r, "m_real");
  expect(squad.starting.map((p: any) => p.id)).not.toContain("mbappe");
  expect(squad.listed.map((p) => p.id)).toEqual(["mbappe"]);
});

test("splitMySquad: a release-listing nobody else bid on reverts to Starting once closed, not Sold", () => {
  const r = room({
    contests: {
      c1: { id: "c1", playerId: "mbappe", type: "release-listing", status: "closed", listerId: "m_real", quotes: [{ managerId: "m_real", amount: 200, at: 0 }], quoteCounts: {}, closesAt: 120_000 },
    },
    log: [{ t: "win", at: 1, contestId: "c1", managerId: "m_real", playerId: "mbappe", price: 200 }],
  });
  const squad = splitMySquad(r, "m_real");
  expect(squad.listed).toEqual([]);
  expect(squad.sold).toEqual([]); // same manager won it back — not a sale
  expect(squad.starting.map((p: any) => p.id)).toContain("mbappe");
});

test("splitMySquad: a release-listing another manager wins shows in Sold, not Starting or listed", () => {
  const r = room({
    players: {
      mbappe: { id: "mbappe", name: "Mbappé", position: "FWD", listedValue: 200, originalValue: 200, ownerId: "m_bar", lockedThisSeason: true, homeClub: "real" },
    },
    contests: {
      c1: { id: "c1", playerId: "mbappe", type: "release-listing", status: "closed", listerId: "m_real", quotes: [{ managerId: "m_real", amount: 200, at: 0 }, { managerId: "m_bar", amount: 200, at: 5 }], quoteCounts: {}, closesAt: 120_000 },
    },
    log: [{ t: "win", at: 1, contestId: "c1", managerId: "m_bar", playerId: "mbappe", price: 200 }],
  });
  const squad = splitMySquad(r, "m_real");
  expect(squad.listed).toEqual([]);
  expect(squad.starting.map((p: any) => p.id)).not.toContain("mbappe");
  expect(squad.sold).toMatchObject([{ id: "mbappe", name: "Mbappé", price: 200, buyerId: "m_bar" }]);
});

import { warSides } from "../lib/board.js";

const warRoom = (quotes: { managerId: string; amount: number }[]) => ({
  players: { p: { ownerId: "m_psv" } },
  managers: {
    m_psv: { id: "m_psv", displayName: "Me", clubId: "psv", reserved: 0, spendable: 0 },
    m_roma: { id: "m_roma", displayName: "Loki", clubId: "roma", reserved: 0, spendable: 0 },
    m_ajax: { id: "m_ajax", displayName: "Kai", clubId: "ajax", reserved: 0, spendable: 0 },
  },
  contest: { id: "c", playerId: "p", type: "war", status: "war", listerId: null, quotes: quotes.map((q) => ({ ...q, at: 0 })), quoteCounts: {}, closesAt: 0 } as any,
});

test("warSides: I'm always on the left in a war I'm in, my opponent on the right", () => {
  const r = warRoom([{ managerId: "m_roma", amount: 92 }]);
  const s = warSides(r.contest, r as any, "m_psv")!;
  expect(s.left).toMatchObject({ managerId: "m_psv", you: true, leading: false });
  expect(s.right).toMatchObject({ managerId: "m_roma", leading: true });
  // Same war from Roma's seat: Roma left, PSV right.
  const t = warSides(r.contest, r as any, "m_roma")!;
  expect([t.left.managerId, t.right.managerId]).toEqual(["m_roma", "m_psv"]);
});

test("warSides: watching someone else's war shows the owner left and the leading challenger right", () => {
  const r = warRoom([{ managerId: "m_roma", amount: 92 }]);
  const s = warSides(r.contest, r as any, "m_ajax")!;
  expect([s.left.managerId, s.right.managerId]).toEqual(["m_psv", "m_roma"]);
});

test("warSides: when I lead, my opponent is the latest rival bidder", () => {
  const r = warRoom([{ managerId: "m_roma", amount: 92 }, { managerId: "m_psv", amount: 93 }]);
  const s = warSides(r.contest, r as any, "m_psv")!;
  expect(s.left.leading).toBe(true);
  expect(s.right.managerId).toBe("m_roma");
});
