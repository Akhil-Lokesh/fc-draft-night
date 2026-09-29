import { test, expect } from "vitest";
import { createRoom, addManager } from "../domain/types.js";
import { teamColors, TEAM_PALETTE } from "../domain/colors.js";
import { fixtureSeed } from "./fixtures/roster.js";

const room = () => createRoom({ code: "ABCD", totalBudget: 600, seed: fixtureSeed() });

test("a club's colour comes from its place in the room's club list, whatever order people join in", () => {
  const clubs = Object.keys(room().clubNames);
  const want = Object.fromEntries(clubs.map((c, i) => [c, TEAM_PALETTE[i]!.id]));
  for (const order of [clubs, [...clubs].reverse()]) {
    let s = room();
    for (const c of order) s = addManager(s, { id: `m_${c}`, displayName: c, clubId: c });
    for (const c of order) expect(s.managers[`m_${c}`]!.colorId).toBe(want[c]);
  }
});

test("every team in a full room has its own colour", () => {
  let s = room();
  for (const c of ["arsenal", "bayern", "real", "barca", "city"]) s = addManager(s, { id: `m_${c}`, displayName: c, clubId: c });
  const ids = Object.values(teamColors(s)).map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("a room saved before colours existed gets unique ones assigned on read", () => {
  let s = room();
  for (const c of ["arsenal", "bayern"]) s = addManager(s, { id: `m_${c}`, displayName: c, clubId: c });
  for (const m of Object.values(s.managers)) delete m.colorId;
  const colors = teamColors(s);
  expect(colors.m_arsenal!.id).not.toBe(colors.m_bayern!.id);
  expect(TEAM_PALETTE).toContain(colors.m_arsenal);
});

/** Hue (0-360) of a #rrggbb colour. */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return -1; // grey: no hue
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

test("there are exactly 10 constant team colours, all different, and none of them green", () => {
  expect(TEAM_PALETTE).toHaveLength(10);
  expect(new Set(TEAM_PALETTE.map((c) => c.color)).size).toBe(10);
  for (const c of TEAM_PALETTE) {
    const h = hue(c.color);
    expect(h < 75 || h > 170, `${c.id} ${c.color} is green (hue ${Math.round(h)})`).toBe(true);
  }
});

test("ten teams in one room all get different colours", () => {
  let s = createRoom({ code: "ABCD", totalBudget: 600, seed: [] }); // clubs not in the list: first free colour
  for (let i = 0; i < 10; i++) s = addManager(s, { id: `m_c${i}`, displayName: `T${i}`, clubId: `club-${i}` });
  expect(new Set(Object.values(s.managers).map((m) => m.colorId)).size).toBe(10);
});

test("a roster with more than 10 clubs never gives two joined managers the same colour", () => {
  let s = createRoom({ code: "ABCD", totalBudget: 600, seed: [] });
  s = { ...s, clubNames: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`c${i}`, `Club ${i}`])) };
  s = addManager(s, { id: "m_c0", displayName: "A", clubId: "c0" });   // slot 0 → red
  s = addManager(s, { id: "m_c10", displayName: "B", clubId: "c10" }); // slot 10 wraps to red → must not
  expect(s.managers.m_c0!.colorId).toBe("red");
  expect(s.managers.m_c10!.colorId).not.toBe("red");
});
