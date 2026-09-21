import { test, expect } from "vitest";
import { FakeClock } from "../clock.js";

test("FakeClock advances deterministically", () => {
  const c = new FakeClock(0);
  expect(c.now()).toBe(0);
  c.advance(1500);
  expect(c.now()).toBe(1500);
});
