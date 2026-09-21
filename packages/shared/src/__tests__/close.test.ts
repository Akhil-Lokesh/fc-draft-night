import { test, expect } from "vitest";
import { dueContests } from "../domain/close.js";
import type { RoomState, Contest } from "../domain/types.js";

function stateWith(contests: Contest[], draftClockMs = 3_600_000): RoomState {
  return {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs,
    squadSizeCap: null, capacity: 5, seasonNumber: 1, status: "live", startedAt: 0,
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

test("when the 1-hour draft clock passes, every open contest is due at once", () => {
  const s = stateWith([c("a", 999_999), c("b", 999_999)], 3_600_000);
  expect(dueContests(s, 3_600_001).map(x => x.id).sort()).toEqual(["a", "b"]);
});
