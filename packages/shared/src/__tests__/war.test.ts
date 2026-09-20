import { test, expect } from "vitest";
import { placeBid, openChallenge, BidError } from "../domain/war.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function liveRoom() {
  // totalBudget must comfortably exceed Real Madrid's own reserved squad value (580)
  // plus the cost of defending a challenge (cost = amount - listedValue), or `real`
  // can't afford to defend mbappe in these war scenarios.
  let s = createRoom({ code: "AB", totalBudget: 700, seed: fixtureSeed(), quoteTimerMs: 300_000 });
  for (const [id, clubId] of [["ars","arsenal"],["bay","bayern"],["real","real"],["bar","barca"],["city","city"]] as const)
    s = addManager(s, { id, displayName: id, clubId });
  return { ...s, status: "live" as const, startedAt: 0 };
}

test("a challenge must strictly exceed the player's current listed value", () => {
  const s = liveRoom();
  // bar challenges real's mbappe directly (mbappe is owned by real, not a pool player)
  expect(() => openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 200, now: 0 }))
    .toThrow(BidError); // 200 == listed value, not strictly greater
});

test("a challenge on a rival's owned player opens directly as a war (no listing phase)", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 });
  const c = state.contests[contestId]!;
  expect(c.status).toBe("war");
  expect(c.quotes).toEqual([{ managerId: "bar", amount: 210, at: 0 }]);
  expect(c.quoteCounts).toEqual({ bar: 1 }); // the opening challenge DOES spend the challenger's quote cap
});

test("defending the challenge resets the anti-snipe timer", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 });
  const r = placeBid(state, { contestId, managerId: "real", amount: 230, now: 20 });
  const c = r.contests[contestId]!;
  expect(c.closesAt).toBe(20 + 300_000); // anti-snipe reset off the new quote
  expect(c.quotes.at(-1)).toMatchObject({ managerId: "real", amount: 230 });
});

test("each manager gets at most two quotes in one contest", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 }); // bar quote #1
  let st = placeBid(state, { contestId, managerId: "real", amount: 230, now: 20 }); // real quote #1
  st = placeBid(st, { contestId, managerId: "bar", amount: 240, now: 30 }); // bar quote #2
  expect(() => placeBid(st, { contestId, managerId: "bar", amount: 260, now: 40 }))
    .toThrow(/quote cap/i); // bar already used 2
});
