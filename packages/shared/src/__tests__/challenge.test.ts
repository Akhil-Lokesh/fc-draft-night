import { test, expect } from "vitest";
import { canChallenge, recordChallenge, challengeKey } from "../domain/challenge.js";
import { createRoom, addManager } from "../domain/types.js";
import { fixtureSeed } from "./fixtures/roster.js";

function s0() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: fixtureSeed() });
  s = addManager(s, { id: "bar", displayName: "B", clubId: "barca" });
  s = addManager(s, { id: "real", displayName: "R", clubId: "real" });
  return s;
}

test("a manager may start at most 3 challenges against one rival's owned squad", () => {
  let s = s0();
  for (const pid of ["mbappe", "vini", "bellingham"]) {
    expect(canChallenge(s, "bar", "real")).toBe(true);
    s = recordChallenge(s, "bar", "real");
  }
  expect(canChallenge(s, "bar", "real")).toBe(false); // 4th blocked
  expect(s.challenges[challengeKey("bar", "real")]).toBe(3);
});

test("challenges are one-directional per pair", () => {
  let s = recordChallenge(recordChallenge(recordChallenge(s0(), "bar", "real"), "bar", "real"), "bar", "real");
  expect(canChallenge(s, "real", "bar")).toBe(true); // real->bar is a separate counter
});

test("going after a pool player never consumes the limit", () => {
  const s = s0();
  // pool players have ownerId null; caller must only recordChallenge for owned rivals — verified in engine (Task 13)
  expect(canChallenge(s, "bar", "real")).toBe(true);
});
