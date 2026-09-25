import { test, expect } from "vitest";
import { openListing, resolveListing } from "../domain/listing.js";
import { createRoom, addManager, type RoomState } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function room() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "ars", displayName: "A", clubId: "arsenal" });
  return { ...s, status: "live" as const, startedAt: 0 };
}

test("opening a pool listing creates a listing contest closing in 2 minutes", () => {
  const s = room();
  const { state, contestId } = openListing(s, { managerId: "ars", playerId: "wirtz", now: 1000 });
  const c = state.contests[contestId!]!;
  expect(c.type).toBe("pool-listing");
  expect(c.status).toBe("listing");
  expect(c.closesAt).toBe(1000 + 120_000);
  expect(c.quotes.at(-1)!.amount).toBe(state.players["wirtz"]!.listedValue); // opens at listed price
});

test("openListing rejects listing a player owned by another manager (must use openChallenge instead)", () => {
  let s: RoomState = room();
  s = addManager(s, { id: "bay", displayName: "B", clubId: "bayern" });
  // "kane" is owned by bay (his home club); ars tries to openListing it directly instead of
  // going through openChallenge -- this must be rejected at the mutation boundary itself,
  // not merely by engine.ts's applyCommand guard.
  expect(s.players["kane"]?.ownerId).toBe("bay");
  expect(() => openListing(s, { managerId: "ars", playerId: "kane", now: 1000 })).toThrow();
});

test("uncontested pool listing locks the player onto the lister at listed price", () => {
  const s = room();
  const spend0 = s.managers["ars"]!.spendable;
  const price = s.players["wirtz"]!.listedValue;
  const opened = openListing(s, { managerId: "ars", playerId: "wirtz", now: 1000 });
  const done = resolveListing(opened.state, { contestId: opened.contestId!, now: 1000 + 120_000 });
  expect(done.players["wirtz"]!.ownerId).toBe("ars");
  expect(done.managers["ars"]!.spendable).toBe(spend0 - price);
  expect(done.contests[opened.contestId!]!.status).toBe("closed");
});

test("openListing rejects a second listing on a player who already has one open", () => {
  const s = room();
  const { state } = openListing(s, { managerId: "ars", playerId: "wirtz", now: 1000 });
  // Same player, e.g. a rapid double-tap before the first request's broadcast lands — must not
  // create a second, independently-resolving contest racing the first one for ownership.
  expect(() => openListing(state, { managerId: "ars", playerId: "wirtz", now: 1001 }))
    .toThrow(/already has an open contest/);
});

/**
 * Releasing your own player is instant, not a public listing — no window for a rival to snipe
 * it (unlike a pool claim, which still opens the normal 2-minute listing above).
 */
test("releasing your own player is instant: no contest, straight back to the pool, reserved refunded immediately", () => {
  let s: RoomState = room();
  s = addManager(s, { id: "bay", displayName: "B", clubId: "bayern" });
  const before = s.managers["ars"]!;
  const kaneOwner = s.players["kane"]?.ownerId; // sanity: not ars's before this test's own release
  const saka = s.players["saka"]!; // owned by ars (Arsenal's own squad)
  expect(saka.ownerId).toBe("ars");
  const price = saka.listedValue;

  const { state, contestId } = openListing(s, { managerId: "ars", playerId: "saka", now: 1000 });

  expect(contestId).toBeNull(); // no listing contest created at all
  expect(Object.keys(state.contests)).toHaveLength(0);
  expect(state.players["saka"]!.ownerId).toBeNull(); // straight to the pool
  expect(state.managers["ars"]!.reserved).toBe(before.reserved - price);
  expect(state.managers["ars"]!.spendable).toBe(before.spendable + price); // refunded immediately
  const entry = state.log.at(-1)!;
  expect(entry).toMatchObject({ t: "release", managerId: "ars", playerId: "saka", toValue: price });
  expect(kaneOwner).toBe("bay"); // unaffected — sanity check on the fixture itself
});

test("an instantly-released player can be reclaimed by anyone (including the original owner) via a normal pool claim", () => {
  const s = room();
  const saka = s.players["saka"]!;
  const { state: released } = openListing(s, { managerId: "ars", playerId: "saka", now: 1000 });
  const { state, contestId } = openListing(released, { managerId: "ars", playerId: "saka", now: 1001 });
  // Now unowned, so a second openListing call is an ordinary pool claim (opens a real listing).
  expect(contestId).not.toBeNull();
  expect(state.contests[contestId!]!.type).toBe("pool-listing");
  expect(saka.ownerId).toBe("ars"); // (sanity on the pre-release fixture)
});
