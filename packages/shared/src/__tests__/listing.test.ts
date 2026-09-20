import { test, expect } from "vitest";
import { openListing, resolveListing } from "../domain/listing.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function room() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "ars", displayName: "A", clubId: "arsenal" });
  return { ...s, status: "live" as const, startedAt: 0 };
}

test("opening a pool listing creates a listing contest closing in 2 minutes", () => {
  const s = room();
  const { state, contestId } = openListing(s, { managerId: "ars", playerId: "wirtz", now: 1000 });
  const c = state.contests[contestId]!;
  expect(c.type).toBe("pool-listing");
  expect(c.status).toBe("listing");
  expect(c.closesAt).toBe(1000 + 120_000);
  expect(c.quotes.at(-1)!.amount).toBe(state.players["wirtz"]!.listedValue); // opens at listed price
});

test("uncontested pool listing locks the player onto the lister at listed price", () => {
  const s = room();
  const spend0 = s.managers["ars"]!.spendable;
  const price = s.players["wirtz"]!.listedValue;
  const opened = openListing(s, { managerId: "ars", playerId: "wirtz", now: 1000 });
  const done = resolveListing(opened.state, { contestId: opened.contestId, now: 1000 + 120_000 });
  expect(done.players["wirtz"]!.ownerId).toBe("ars");
  expect(done.managers["ars"]!.spendable).toBe(spend0 - price);
  expect(done.contests[opened.contestId]!.status).toBe("closed");
});
