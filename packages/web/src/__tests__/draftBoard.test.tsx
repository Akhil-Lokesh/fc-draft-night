import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DraftBoard } from "../screens/DraftBoard.js";

function room(): any {
  return {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs: 3_600_000, squadSizeCap: null,
    seasonNumber: 1, status: "live", startedAt: 0,
    managers: { m_real: { id: "m_real", displayName: "Real", clubId: "real", reserved: 425, spendable: 175 } },
    players: { mbappe: { id: "mbappe", name: "Kylian Mbappé", position: "FWD", listedValue: 200, originalValue: 200, ownerId: "m_real", lockedThisSeason: false } },
    contests: { c1: { id: "c1", playerId: "mbappe", type: "war", status: "war", listerId: "m_bar", quotes: [{ managerId: "m_bar", amount: 220, at: 0 }], quoteCounts: { m_bar: 1 }, closesAt: 300_000 } },
    challenges: {}, log: [], seq: 1,
  };
}

const actions = { bid: () => {}, openListing: () => {}, challenge: () => {} };

test("an alert appears when one of my players is under challenge", () => {
  render(<DraftBoard room={room()} myId="m_real" now={0} actions={actions} />);
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(/your player .* challenged/i);
  expect(alert).toHaveTextContent(/Mbappé/);
});

test("no alert when none of my players are under challenge", () => {
  const defendActions = { bid: vi.fn(), openListing: () => {}, challenge: () => {} };
  // Viewed as m_bar (the challenger), my own players aren't under threat here.
  render(<DraftBoard room={room()} myId="m_bar" now={0} actions={defendActions} />);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the challenged contest still renders in the grid so the owner can defend", () => {
  render(<DraftBoard room={room()} myId="m_real" now={0} actions={actions} />);
  // The live war's ContestCard exposes a Raise action (owner can outbid to defend).
  expect(screen.getByRole("button", { name: /raise/i })).toBeTruthy();
  // Top bid of 220 shows in both the alert and the card.
  expect(screen.getAllByText(/220/).length).toBeGreaterThanOrEqual(2);
});
