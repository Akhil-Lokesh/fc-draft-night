import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetBars } from "../components/BudgetBars.js";
import { ChallengeTracker } from "../components/ChallengeTracker.js";
import { DraftLog } from "../components/DraftLog.js";

const managers = {
  m_city: { id: "m_city", displayName: "City", clubId: "city", reserved: 300, spendable: 34 },
  m_bay:  { id: "m_bay",  displayName: "Bayern", clubId: "bayern", reserved: 200, spendable: 350 },
};

test("budget bars render each manager's spendable", () => {
  render(<BudgetBars managers={managers as any} totalBudget={600} />);
  expect(screen.getByText(/City/)).toBeTruthy();
  expect(screen.getByText(/34/)).toBeTruthy();
});

test("challenge tracker shows used/remaining per rival", () => {
  render(<ChallengeTracker challenges={{ "m_bay->m_real": 2 }} myId="m_bay" managers={{ m_real: { displayName: "Real" } } as any} />);
  expect(screen.getByText(/Real/)).toBeTruthy();
  expect(screen.getByText(/2\s*\/\s*3/)).toBeTruthy();
});

test("draft log renders newest entries", () => {
  render(<DraftLog log={[{ t: "win", at: 1, contestId: "c1", managerId: "m_city", playerId: "pedri", price: 90 }] as any} players={{ pedri: { name: "Pedri" } } as any} managers={managers as any} />);
  expect(screen.getByText(/Pedri/)).toBeTruthy();
});
