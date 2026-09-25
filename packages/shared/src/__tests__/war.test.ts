import { test, expect } from "vitest";
import { placeBid, openChallenge, forfeit, BidError } from "../domain/war.js";
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

/**
 * A brand-new manager joining a war "out of the blue" — after the original two have already
 * traded up to their 2-quote cap each — must give the ORIGINAL fighters a clean slate to defend
 * against this new threat. Without this, whoever exhausted their quotes fighting the first rival
 * would be defenseless against any later party who simply hadn't bid yet.
 */
test("a third manager entering a fully-capped war resets everyone else's quotes so they can respond", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 }); // bar #1
  let st = placeBid(state, { contestId, managerId: "real", amount: 230, now: 10 }); // real #1
  st = placeBid(st, { contestId, managerId: "bar", amount: 240, now: 20 }); // bar #2 — bar capped
  st = placeBid(st, { contestId, managerId: "real", amount: 250, now: 30 }); // real #2 — real capped
  expect(st.contests[contestId]!.quoteCounts).toMatchObject({ bar: 2, real: 2 });

  // city, who has never quoted here, jumps in.
  st = placeBid(st, { contestId, managerId: "city", amount: 260, now: 40 });
  expect(st.contests[contestId]!.quoteCounts).toMatchObject({ bar: 0, real: 0, city: 1 });

  // bar and real are no longer locked out — each can defend again.
  st = placeBid(st, { contestId, managerId: "bar", amount: 270, now: 50 });
  expect(st.contests[contestId]!.quoteCounts.bar).toBe(1);
});

test("the normal challenger-vs-owner pair forming is never treated as a 'new entrant' reset (only a genuine 3rd+ party is)", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 }); // bar #1
  // real's first-ever bid here forms the normal pair — must NOT reset bar's count.
  const st = placeBid(state, { contestId, managerId: "real", amount: 230, now: 10 });
  expect(st.contests[contestId]!.quoteCounts).toMatchObject({ bar: 1, real: 1 });
});

/**
 * The owner giving up on defending their own player ends the war immediately at whatever the
 * current top bid is — there's no reason to keep the anti-snipe clock running when the owner has
 * explicitly conceded, and it lets the challenger claim the player without an artificial wait.
 */
test("the owner giving up resolves the war immediately to the current top bidder", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 });
  // Real (the owner) gives up without ever defending — closesAt is still 300s away.
  const out = forfeit(state, { contestId, managerId: "real", now: 5 });
  const c = out.contests[contestId]!;
  expect(c.status).toBe("closed");
  expect(out.players["mbappe"]!.ownerId).toBe("bar");
  expect(out.players["mbappe"]!.listedValue).toBe(210);
});

/**
 * A challenger (not the owner) giving up just drops them out of further bidding — the war keeps
 * running normally for whoever's left, since only the OWNER conceding ends it early.
 */
test("a challenger giving up is barred from bidding again, but the war continues", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 });
  let st = placeBid(state, { contestId, managerId: "real", amount: 230, now: 10 }); // real defends, now leading
  st = forfeit(st, { contestId, managerId: "bar", now: 20 }); // bar gives up
  const c = st.contests[contestId]!;
  expect(c.status).toBe("war"); // still open — only the owner conceding ends it early
  expect(() => placeBid(st, { contestId, managerId: "bar", amount: 240, now: 30 }))
    .toThrow(/quote cap/i); // bar can't come back
});

test("giving up on a contest you're not part of is rejected", () => {
  const s = liveRoom();
  const { state, contestId } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 });
  expect(() => forfeit(state, { contestId, managerId: "city", now: 10 })).toThrow(BidError);
});

test("openChallenge rejects challenging a player who already has an open contest", () => {
  const s = liveRoom();
  const { state } = openChallenge(s, { managerId: "bar", playerId: "mbappe", amount: 210, now: 0 });
  // "city" tries to pile a second challenge onto mbappe while bar's war on him is still live —
  // two independently-resolving contests on the same player must not coexist.
  expect(() => openChallenge(state, { managerId: "city", playerId: "mbappe", amount: 220, now: 1 }))
    .toThrow(BidError);
});
