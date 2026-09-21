import { test, expect } from "vitest";
import { createRoom } from "@fcdn/shared";

test("shared package is importable from server", () => {
  expect(createRoom({ code: "AB", totalBudget: 600, seed: [] }).status).toBe("setup");
});
