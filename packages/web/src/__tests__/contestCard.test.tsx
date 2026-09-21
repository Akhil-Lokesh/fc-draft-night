import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContestCard } from "../components/ContestCard.js";

const contest = {
  id: "c1", playerId: "haaland", type: "war", status: "war", listerId: null,
  quotes: [{ managerId: "city", amount: 205, at: 0 }], quoteCounts: { city: 2 }, closesAt: 300_000,
};
const player = {
  id: "haaland", name: "Erling Haaland", position: "FWD", listedValue: 205, originalValue: 180,
  ownerId: null, lockedThisSeason: false,
};

test("shows player, top bid, and a countdown derived from closesAt - now", () => {
  render(<ContestCard contest={contest as any} player={player as any} now={60_000} myId="bay" myQuotesUsed={0} onBid={() => {}} />);
  expect(screen.getByText(/Erling Haaland/)).toBeTruthy();
  expect(screen.getByText(/205/)).toBeTruthy();
  expect(screen.getByText(/4:00/)).toBeTruthy(); // (300000-60000)/1000 = 240s = 4:00
});

test("a raise button emits a bid above the current top", async () => {
  const onBid = vi.fn();
  render(<ContestCard contest={contest as any} player={player as any} now={0} myId="bay" myQuotesUsed={0} onBid={onBid} />);
  await userEvent.click(screen.getByRole("button", { name: /raise/i }));
  expect(onBid).toHaveBeenCalledWith("c1", expect.any(Number));
});

test("raise is disabled once the manager has used two quotes", () => {
  render(<ContestCard contest={contest as any} player={player as any} now={0} myId="city" myQuotesUsed={2} onBid={() => {}} />);
  expect(screen.getByRole("button", { name: /raise/i })).toBeDisabled();
});
