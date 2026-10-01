import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FullTime } from "../screens/FullTime.js";

function room(): any {
  return {
    code: "AB", totalBudget: 600, seasonNumber: 1, status: "closed",
    managers: {
      m_real: { id: "m_real", displayName: "Real", clubId: "real", reserved: 200, spendable: 400 },
      m_bar: { id: "m_bar", displayName: "Bar", clubId: "barca", reserved: 0, spendable: 600 },
    },
    players: {
      mbappe: {
        id: "mbappe", name: "Kylian Mbappé", position: "FWD", positionDetail: "ST",
        listedValue: 200, originalValue: 200, ownerId: "m_real", lockedThisSeason: true, homeClub: "real",
      },
    },
    challenges: {}, log: [], seq: 1,
  };
}

test("a draft where nobody bought anyone shows no 'Most spent' award", () => {
  render(<FullTime room={room()} myId="m_real" onExport={() => {}} />); // log is empty: no wins
  expect(screen.queryByText(/most spent/i)).toBeNull();
});

test("once someone buys a player, 'Most spent' names them", () => {
  const r = room();
  r.log = [{ t: "win", at: 1, contestId: "c1", managerId: "m_bar", playerId: "mbappe", price: 210 }];
  render(<FullTime room={r} myId="m_real" onExport={() => {}} />);
  expect(screen.getByText(/most spent/i)).toBeTruthy();
  expect(screen.getByText(/^Bar$/)).toBeTruthy();
});

test("defaults to the list view, showing each manager's squad as a strip", () => {
  render(<FullTime room={room()} myId="m_real" onExport={() => {}} />);
  expect(screen.getByText(/Mbappé/)).toBeTruthy();
  expect(screen.queryByText(/^pitch$/i)).toBeTruthy(); // the toggle itself exists
});

test("switching to the Pitch tab renders the ground view with the same players", async () => {
  render(<FullTime room={room()} myId="m_real" onExport={() => {}} />);
  await userEvent.click(screen.getByRole("tab", { name: /^pitch$/i }));
  expect(screen.getByText(/Mbappé/)).toBeTruthy();
  expect(document.querySelector(".pitch-field")).toBeTruthy();
});

test("a back-to-home control is always available on the closed screen", async () => {
  const onHome = vi.fn();
  render(<FullTime room={room()} myId="m_real" onExport={() => {}} onHome={onHome} />);
  await userEvent.click(screen.getByRole("button", { name: /home/i }));
  expect(onHome).toHaveBeenCalled();
});

test("the header names the tournament beside Full time when the room has one", () => {
  const r = room();
  r.tournamentName = "APL S01";
  render(<FullTime room={r} myId="m_real" onExport={() => {}} />);
  const tag = screen.getByText(/full time/i).closest("p")!;
  expect(tag.textContent).toMatch(/Full time.*APL S01.*Season 1/i);
});

test("without a tournament name the header is just Full time and the season", () => {
  render(<FullTime room={room()} myId="m_real" onExport={() => {}} />);
  const tag = screen.getByText(/full time/i).closest("p")!;
  expect(tag.textContent).toMatch(/^Full time\s*Season 1$/i);
});
