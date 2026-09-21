import { test, expect } from "vitest";
import { money, mmss } from "../lib/format.js";

test("mmss formats remaining milliseconds as m:ss", () => {
  expect(mmss(240_000)).toBe("4:00");
  expect(mmss(65_000)).toBe("1:05");
  expect(mmss(-5_000)).toBe("0:00"); // never negative
});

test("money trims whole numbers and keeps one decimal", () => {
  expect(money(205)).toBe("205M");
  expect(money(150.5)).toBe("150.5M");
  expect(money(150.04)).toBe("150M");
});
