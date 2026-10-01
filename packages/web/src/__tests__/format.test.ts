import { test, expect } from "vitest";
import { money, mmss, positionLabel } from "../lib/format.js";

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

test("positionLabel shows the exact slot plus alternates, not the coarse bucket", () => {
  expect(positionLabel({ position: "FWD", positionDetail: "ST", altPositions: ["CAM", "CM", "CDM"] }))
    .toBe("ST · CAM/CM/CDM");
});

test("positionLabel with no alternates just shows the exact slot", () => {
  expect(positionLabel({ position: "FWD", positionDetail: "ST" })).toBe("ST");
});

test("positionLabel falls back to the coarse bucket for a synthetic player with no exact slot", () => {
  expect(positionLabel({ position: "MID" })).toBe("MID");
});

import { crestUrl } from "../lib/crests.js";

test("crests: a club finds its logo by room id or by any common spelling of its name", () => {
  expect(crestUrl("as-roma", "AS Roma")).toBe("/crests/roma.png");
  expect(crestUrl("roma")).toBe("/crests/roma.png");
  expect(crestUrl("bayern")).toBe("/crests/fc-bayern-munchen.png"); // built-in short id
  expect(crestUrl("psv", "PSV")).toBe("/crests/psv.png");
  expect(crestUrl("fc-porto", "FC Porto")).toBe("/crests/fc-porto.png");
});

test("crests: a club outside the top 50 gets no logo (keeps the lettered shield)", () => {
  expect(crestUrl("sheffield-wednesday", "Sheffield Wednesday")).toBeNull();
  expect(crestUrl("afc-wimbledon", "AFC Wimbledon")).toBeNull(); // "AFC" alone must not match Arsenal
});

test("a negative amount reads as a proper minus, not a stray dash", () => {
  expect(money(-195.7)).toBe("\u2212195.7M");
  expect(money(-3)).toBe("\u22123M");
  expect(money(0)).toBe("0M");
});
