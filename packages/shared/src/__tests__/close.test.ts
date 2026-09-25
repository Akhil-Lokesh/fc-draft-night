import { test, expect } from "vitest";
import { dueContests } from "../domain/close.js";
import type { RoomState, Contest } from "../domain/types.js";

function stateWith(contests: Contest[], draftClockMs = 3_600_000): RoomState {
  return {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs,
    squadSizeCap: null, capacity: 5, clubNames: {}, clubBudgets: {}, seasonNumber: 1, status: "live", startedAt: 0,
    managers: {}, players: {},
    contests: Object.fromEntries(contests.map(c => [c.id, c])),
    challenges: {}, log: [], seq: contests.length,
  };
}
const c = (id: string, closesAt: number): Contest =>
  ({ id, playerId: id, type: "war", status: "war", listerId: null, quotes: [], quoteCounts: {}, closesAt });

test("contests whose anti-snipe timer has elapsed are due, in close order", () => {
  const s = stateWith([c("a", 500), c("b", 200), c("c", 900)]);
  expect(dueContests(s, 600).map(x => x.id)).toEqual(["b", "a"]); // sorted by closesAt asc
});

/**
 * A live war's own anti-snipe timer must win even past the draft's nominal 1-hour mark — a bid
 * placed right before the deadline still gets its full 5-minute window, so nobody can snipe a
 * contest just by timing a bid for the last second of the draft. The overall draft clock is a
 * target end time, not a hard cutoff that cuts an active war short.
 */
test("a contest whose own timer hasn't elapsed yet is NOT force-closed just because the draft clock has passed", () => {
  const s = stateWith([c("a", 3_700_000)], 3_600_000); // closesAt is past the 1hr draft clock (a late reset)
  expect(dueContests(s, 3_600_001)).toEqual([]); // draft clock alone doesn't close it
  expect(dueContests(s, 3_700_001).map(x => x.id)).toEqual(["a"]); // its own timer eventually does
});
