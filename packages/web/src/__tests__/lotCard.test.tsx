import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LotCard } from "../board/LotCard.js";

const contest = {
  id: "c1", playerId: "haaland", type: "war", status: "war", listerId: null,
  quotes: [{ managerId: "city", amount: 205, at: 0 }], quoteCounts: { city: 2 }, closesAt: 300_000,
};
const player = {
  id: "haaland", name: "Erling Haaland", position: "FWD", listedValue: 205, originalValue: 180,
  ownerId: null, lockedThisSeason: false,
};

test("shows player, top bid, and a countdown derived from closesAt - now", () => {
  render(<LotCard contest={contest as any} player={player as any} now={60_000} myId="bay" myQuotesUsed={0} onBid={() => {}} />);
  expect(screen.getByText(/Erling Haaland/)).toBeTruthy();
  expect(screen.getByText(/205/)).toBeTruthy();
  expect(screen.getByText(/4:00/)).toBeTruthy(); // (300000-60000)/1000 = 240s = 4:00
});

test("a raise button emits a bid above the current top", async () => {
  const onBid = vi.fn();
  render(<LotCard contest={contest as any} player={player as any} now={0} myId="bay" myQuotesUsed={0} onBid={onBid} />);
  await userEvent.click(screen.getByRole("button", { name: /raise/i }));
  expect(onBid).toHaveBeenCalledWith("c1", expect.any(Number));
});

test("raise is disabled once the manager has used two quotes", () => {
  render(<LotCard contest={contest as any} player={player as any} now={0} myId="city" myQuotesUsed={2} onBid={() => {}} />);
  expect(screen.getByRole("button", { name: /raise/i })).toBeDisabled();
});

test("shows the leading bidder's team name (not just the manager) front and center", () => {
  render(
    <LotCard
      contest={contest as any} player={player as any} now={0} myId="bay" myQuotesUsed={0} onBid={() => {}}
      leader={{ displayName: "Loki", clubId: "city" }}
    />
  );
  expect(screen.getByText(/Manchester City/)).toBeTruthy(); // the team, not just the manager
  expect(screen.getByText(/Loki/)).toBeTruthy();
});

test("an untested listing with no bids yet shows no leading bidder", () => {
  const listing = { ...contest, status: "listing", quotes: [] };
  render(<LotCard contest={listing as any} player={player as any} now={0} myId="bay" myQuotesUsed={0} onBid={() => {}} />);
  expect(screen.queryByText(/leading/i)).toBeNull();
});

test("the defending owner sees a give-up option and it fires forfeit for this contest", async () => {
  const owned = { ...player, ownerId: "bay" };
  const onForfeit = vi.fn();
  render(
    <LotCard
      contest={contest as any} player={owned as any} now={0} myId="bay" myQuotesUsed={0}
      onBid={() => {}} onForfeit={onForfeit}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: /give up/i }));
  expect(onForfeit).toHaveBeenCalledWith("c1");
});

test("a challenger who has quoted also sees a give-up option", () => {
  const onForfeit = vi.fn();
  render(
    <LotCard
      contest={contest as any} player={player as any} now={0} myId="city" myQuotesUsed={1}
      onBid={() => {}} onForfeit={onForfeit}
    />
  );
  expect(screen.getByRole("button", { name: /give up/i })).toBeTruthy();
});

test("a manager not involved in the war sees no give-up option", () => {
  render(
    <LotCard
      contest={contest as any} player={player as any} now={0} myId="bay" myQuotesUsed={0}
      onBid={() => {}} onForfeit={() => {}}
    />
  );
  expect(screen.queryByRole("button", { name: /give up/i })).toBeNull();
});

test("an already-capped challenger sees no give-up option (nothing left to give up)", () => {
  render(
    <LotCard
      contest={contest as any} player={player as any} now={0} myId="city" myQuotesUsed={2}
      onBid={() => {}} onForfeit={() => {}}
    />
  );
  expect(screen.queryByRole("button", { name: /give up/i })).toBeNull();
});

test("after being outbid, the raise never offers less than the new top + 1", async () => {
  const onBid = vi.fn();
  const { rerender } = render(<LotCard contest={contest as any} player={player as any} now={0} myId="bay" myQuotesUsed={0} onBid={onBid} />);
  const outbid = { ...contest, quotes: [...contest.quotes, { managerId: "arsenal", amount: 240, at: 1 }] };
  rerender(<LotCard contest={outbid as any} player={player as any} now={0} myId="bay" myQuotesUsed={0} onBid={onBid} />);
  await userEvent.click(screen.getByRole("button", { name: /raise/i }));
  expect(onBid).toHaveBeenCalledWith("c1", 241);
});

test("quick-step buttons set the raise relative to the current top", async () => {
  const onBid = vi.fn();
  render(<LotCard contest={contest as any} player={player as any} now={0} myId="bay" myQuotesUsed={0} onBid={onBid} />);
  await userEvent.click(screen.getByRole("button", { name: "+10" }));
  await userEvent.click(screen.getByRole("button", { name: /raise/i }));
  expect(onBid).toHaveBeenCalledWith("c1", 215);
});
