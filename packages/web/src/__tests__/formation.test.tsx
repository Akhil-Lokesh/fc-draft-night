import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { layoutSquad, benchOf, chooseFormation } from "../lib/formation.js";
import { Pitch } from "../board/Pitch.js";
import type { Player } from "@fcdn/shared";

function p(id: string, name: string, position: Player["position"], positionDetail?: string, listedValue = 10): Player {
  return {
    id, name, position, positionDetail,
    listedValue, originalValue: listedValue, ownerId: "m_real", lockedThisSeason: true, homeClub: "real",
  };
}

test("layoutSquad caps the pitch at 11 starters, even for a much bigger squad", () => {
  const squad = Array.from({ length: 30 }, (_, i) => p(`x${i}`, `Player ${i}`, "MID", "CM", i));
  const placed = layoutSquad(squad);
  expect(placed.length).toBeLessThanOrEqual(11);
});

test("a back-three squad (3 real CBs, wingbacks, no natural fullbacks) picks a 3-x-x formation, not a 4-x-x one", () => {
  const squad = [
    p("gk1", "GK", "GK", "GK"),
    p("cb1", "CB1", "DEF", "CB"), p("cb2", "CB2", "DEF", "CB"), p("cb3", "CB3", "DEF", "CB"),
    p("lwb1", "LWB1", "DEF", "LWB"), p("rwb1", "RWB1", "DEF", "RWB"),
    p("cdm1", "CDM1", "MID", "CDM"), p("cm1", "CM1", "MID", "CM"),
    p("st1", "ST1", "FWD", "ST"), p("st2", "ST2", "FWD", "ST"),
  ];
  const name = chooseFormation(squad);
  expect(name).toMatch(/^3-/);
});

test("a standard back-four squad with two natural fullbacks picks a 4-x-x formation", () => {
  const squad = [
    p("gk1", "GK", "GK", "GK"),
    p("lb1", "LB1", "DEF", "LB"), p("cb1", "CB1", "DEF", "CB"), p("cb2", "CB2", "DEF", "CB"), p("rb1", "RB1", "DEF", "RB"),
    p("cm1", "CM1", "MID", "CM"), p("cm2", "CM2", "MID", "CM"), p("cm3", "CM3", "MID", "CM"),
    p("lw1", "LW1", "FWD", "LW"), p("st1", "ST1", "FWD", "ST"), p("rw1", "RW1", "FWD", "RW"),
  ];
  const name = chooseFormation(squad);
  expect(name).toMatch(/^4-/);
});

test("only the top-rated player per formation slot starts — a cheaper teammate in the same slot is benched", () => {
  const squad = [
    p("gk1", "Courtois", "GK", "GK", 50),
    p("lb1", "Mendy", "DEF", "LB", 60),
    p("rb1", "Carvajal", "DEF", "RB", 60),
    p("cb1", "Rüdiger", "DEF", "CB", 80),
    p("cb2", "Alaba", "DEF", "CB", 40),
    p("cb3", "Militão", "DEF", "CB", 30), // 4-x-x has only 2 CB slots, and LB/RB are filled — benched
    p("st1", "Mbappé", "FWD", "ST", 200),
  ];
  const placed = layoutSquad(squad);
  const cbNames = placed.filter(s => s.player.id.startsWith("cb")).map(s => s.player.id);
  expect(cbNames).toEqual(["cb1", "cb2"]); // the two priciest CBs, not Militão
  const bench = benchOf(squad);
  expect(bench.map(b => b.id)).toContain("cb3");
});

test("a formation slot with no exact-position player falls back to the best available player in that line", () => {
  const squad = [
    p("gk1", "Courtois", "GK", "GK"),
    p("st1", "Mbappé", "FWD", "ST", 200),
    p("st2", "Haaland", "FWD", "ST", 190), // fills a wide-forward slot — no natural winger available
  ];
  const placed = layoutSquad(squad);
  expect(placed.some(s => s.player.id === "st2")).toBe(true);
});

test("benchOf returns everyone not selected as a pitch starter", () => {
  const squad = [
    p("gk1", "Courtois", "GK", "GK", 50),
    p("cb1", "Rüdiger", "DEF", "CB", 80),
    p("cb2", "Alaba", "DEF", "CB", 40),
    p("cb3", "Militão", "DEF", "CB", 30),
  ];
  const starters = new Set(layoutSquad(squad).map(s => s.player.id));
  const bench = benchOf(squad);
  expect(bench.every(b => !starters.has(b.id))).toBe(true);
  expect(bench.length + starters.size).toBe(squad.length);
});

test("the goalkeeper sits deepest (highest y) and the striker sits furthest forward (lowest y)", () => {
  const squad = [
    p("gk1", "Courtois", "GK", "GK"),
    p("st1", "Mbappé", "FWD", "ST"),
  ];
  const placed = layoutSquad(squad);
  const gk = placed.find(s => s.player.id === "gk1")!;
  const st = placed.find(s => s.player.id === "st1")!;
  expect(gk.y).toBeGreaterThan(st.y);
});

test("renders starters on the pitch and everyone else in the bench list", () => {
  const squad = [
    p("gk1", "Courtois", "GK", "GK", 50),
    p("cb1", "Rüdiger", "DEF", "CB", 80),
    p("cb2", "Alaba", "DEF", "CB", 40),
    p("cb3", "Militão", "DEF", "CB", 30),
    p("st1", "Mbappé", "FWD", "ST", 200),
  ];
  render(<Pitch players={squad} />);
  expect(screen.getByText(/Courtois/)).toBeTruthy();
  expect(screen.getByText(/Militão/)).toBeTruthy(); // benched, but still shown somewhere
});
