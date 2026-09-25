import { test, expect } from "vitest";
import { placeBid, BidError } from "../domain/war.js";
import type { RoomState } from "../domain/types.js";

function lockedRoomWithContestOnLockedPlayer(): { s: RoomState; contestId: string } {
  const player = { id: "p", name: "P", position: "FWD" as const, listedValue: 100, originalValue: 100, ownerId: "a", lockedThisSeason: true, homeClub: null };
  const contest = { id: "c1", playerId: "p", type: "war" as const, status: "war" as const, listerId: null, quotes: [{ managerId: "a", amount: 100, at: 0 }], quoteCounts: { a: 1 }, closesAt: 999 };
  const s: RoomState = {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs: 3_600_000, squadSizeCap: null,
    capacity: 5, clubNames: {}, clubBudgets: {}, seasonNumber: 1, status: "live", startedAt: 0,
    managers: { a: { id: "a", displayName: "A", clubId: "x", reserved: 100, spendable: 200 },
                b: { id: "b", displayName: "B", clubId: "y", reserved: 0, spendable: 200 } },
    players: { p: player }, contests: { c1: contest }, challenges: {}, log: [], seq: 1,
  };
  return { s, contestId: "c1" };
}

test("a player locked this season cannot be challenged again", () => {
  const { s, contestId } = lockedRoomWithContestOnLockedPlayer();
  expect(() => placeBid(s, { contestId, managerId: "b", amount: 150, now: 10 })).toThrow(/locked/i);
});
