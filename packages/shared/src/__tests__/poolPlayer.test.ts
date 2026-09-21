import { test, expect } from "vitest";
import { createRoom, addManager, addPoolPlayer, type RoomState } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

test("addPoolPlayer inserts an unowned, unlocked player into room state", () => {
  const s: RoomState = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  const out = addPoolPlayer(s, { id: "new1", name: "New Player", position: "MID", value: 40, overall: 80, club: "Some Club", clubId: null });
  expect(out.players["new1"]).toBeTruthy();
  expect(out.players["new1"]!.ownerId).toBe(null);
  expect(out.players["new1"]!.listedValue).toBe(40);
  expect(out.players["new1"]!.originalValue).toBe(40);
  expect(out.players["new1"]!.lockedThisSeason).toBe(false);
});

test("addPoolPlayer is a no-op if the player id is already present", () => {
  const s: RoomState = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  const before = s.players["mbappe"];
  const out = addPoolPlayer(s, { id: "mbappe", name: "Different", position: "FWD", value: 999, overall: 99, club: "X", clubId: null });
  expect(out.players["mbappe"]).toEqual(before); // untouched, not overwritten
});
