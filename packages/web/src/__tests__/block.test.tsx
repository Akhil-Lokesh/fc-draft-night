import { test, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftBoard } from "../screens/DraftBoard.js";
import { windowFor } from "../lib/board.js";

// An in-memory localStorage: Node's own half-built global shadows jsdom's in this test environment.
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  });
});

const actions = { bid: () => {}, openListing: () => {}, challenge: () => {}, forfeit: () => {} };

/** Me (m_ars) and two rivals; `n` wars, lot c1 oldest. Lots 1-2 are on MY players (rivals bidding),
 *  lot 3 is one I bid on, the rest are between rivals. */
function busyRoom(n: number): any {
  const managers = {
    m_ars: { id: "m_ars", displayName: "Me", clubId: "arsenal", reserved: 300, spendable: 900 },
    m_bar: { id: "m_bar", displayName: "Bo", clubId: "barca", reserved: 300, spendable: 900 },
    m_real: { id: "m_real", displayName: "Ra", clubId: "real", reserved: 300, spendable: 900 },
  };
  const players: any = {};
  const contests: any = {};
  for (let i = 1; i <= n; i++) {
    const owner = i <= 2 ? "m_ars" : i === 3 ? "m_real" : "m_real";
    const bidder = i === 3 ? "m_ars" : "m_bar";
    players[`p${i}`] = { id: `p${i}`, name: `Player ${String(i).padStart(2, "0")}`, position: "MID", listedValue: 10, originalValue: 10, ownerId: owner, lockedThisSeason: false, homeClub: "x" };
    contests[`c${i}`] = { id: `c${i}`, playerId: `p${i}`, type: "war", status: "war", listerId: null, quotes: [{ managerId: bidder, amount: 20, at: i }], quoteCounts: { [bidder]: 1 }, closesAt: 300_000 };
  }
  return {
    code: "AB", totalBudget: 1500, quoteTimerMs: 300_000, draftClockMs: 3_600_000, squadSizeCap: null,
    seasonNumber: 1, status: "live", startedAt: 0, managers, players, contests, challenges: {}, log: [], seq: n,
  };
}

const lotNames = () => screen.getAllByRole("article").map((a) => within(a).getByRole("heading", { level: 3 }).textContent);
const block = () => screen.getByRole("region", { name: /on the block/i });

test("the block shows at most 9 wars a page, oldest first; the rest are on page 2", async () => {
  render(<DraftBoard room={busyRoom(12)} myId="m_ars" now={0} actions={actions} />);
  expect(lotNames()).toEqual(Array.from({ length: 9 }, (_, i) => `Player ${String(i + 1).padStart(2, "0")}`));
  expect(within(block()).getByText(/page 1 of 2/i)).toBeTruthy();
  await userEvent.click(within(block()).getByRole("button", { name: /next page/i }));
  expect(lotNames()).toEqual(["Player 10", "Player 11", "Player 12"]);
  expect(within(block()).getByText(/page 2 of 2/i)).toBeTruthy();
  await userEvent.click(within(block()).getByRole("button", { name: /previous page/i }));
  expect(lotNames()[0]).toBe("Player 01");
});

test("9 or fewer wars need no pages", () => {
  render(<DraftBoard room={busyRoom(9)} myId="m_ars" now={0} actions={actions} />);
  expect(lotNames()).toHaveLength(9);
  expect(within(block()).queryByText(/page 1 of/i)).toBeNull();
});

test("the block has All, Shortlist, Defending and My bids filters, each with a count", () => {
  render(<DraftBoard room={busyRoom(5)} myId="m_ars" now={0} actions={actions} />);
  const group = within(block()).getByRole("group", { name: /filter the block/i });
  const names = within(group).getAllByRole("button").map((b) => b.textContent);
  expect(names).toEqual(["All5", "Shortlist0", "Defending2", "My bids1"]);
});

test("Defending shows only wars where rivals are bidding on my players", async () => {
  render(<DraftBoard room={busyRoom(5)} myId="m_ars" now={0} actions={actions} />);
  await userEvent.click(within(block()).getByRole("button", { name: /^defending/i }));
  expect(lotNames()).toEqual(["Player 01", "Player 02"]);
});

test("My bids shows only wars I have quoted in", async () => {
  render(<DraftBoard room={busyRoom(5)} myId="m_ars" now={0} actions={actions} />);
  await userEvent.click(within(block()).getByRole("button", { name: /^my bids/i }));
  expect(lotNames()).toEqual(["Player 03"]);
});

test("Shortlist a war from its card, then filter to just the shortlist; it survives a reload", async () => {
  const { unmount } = render(<DraftBoard room={busyRoom(5)} myId="m_ars" now={0} actions={actions} />);
  const card = screen.getAllByRole("article")[4]!; // Player 05, a war between two rivals
  const star = within(card).getByRole("button", { name: /shortlist/i });
  expect(star).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(star);
  expect(star).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(within(block()).getByRole("button", { name: /^shortlist/i }));
  expect(lotNames()).toEqual(["Player 05"]);
  unmount();

  render(<DraftBoard room={busyRoom(5)} myId="m_ars" now={0} actions={actions} />);
  await userEvent.click(within(block()).getByRole("button", { name: /^shortlist/i }));
  expect(lotNames()).toEqual(["Player 05"]);
});

test("each seat has its own shortlist", async () => {
  const { unmount } = render(<DraftBoard room={busyRoom(5)} myId="m_ars" now={0} actions={actions} />);
  await userEvent.click(within(screen.getAllByRole("article")[4]!).getByRole("button", { name: /shortlist/i }));
  unmount();
  render(<DraftBoard room={busyRoom(5)} myId="m_bar" now={0} actions={actions} />);
  expect(within(screen.getAllByRole("article")[4]!).getByRole("button", { name: /shortlist/i })).toHaveAttribute("aria-pressed", "false");
});

test("an empty filter says so instead of showing a blank block", async () => {
  render(<DraftBoard room={busyRoom(5)} myId="m_ars" now={0} actions={actions} />);
  await userEvent.click(within(block()).getByRole("button", { name: /^shortlist/i }));
  expect(screen.queryAllByRole("article")).toHaveLength(0);
  expect(within(block()).getByText(/nothing on your shortlist/i)).toBeTruthy();
});

test("switching filter goes back to page 1", async () => {
  render(<DraftBoard room={busyRoom(12)} myId="m_ars" now={0} actions={actions} />);
  await userEvent.click(within(block()).getByRole("button", { name: /next page/i }));
  await userEvent.click(within(block()).getByRole("button", { name: /^all/i }));
  expect(lotNames()[0]).toBe("Player 01");
});

test("the countdown bar measures a reply against 2 minutes, the opening bid against the full timer", () => {
  const opening: any = { type: "war", status: "war", listerId: null, quotes: [{}] };
  const replied: any = { ...opening, quotes: [{}, {}] };
  expect(windowFor(opening, 300_000, 120_000)).toBe(300_000);
  expect(windowFor(replied, 300_000, 120_000)).toBe(120_000);
  const listingWar: any = { type: "pool-listing", status: "war", listerId: "a", quotes: [{}, {}] }; // seed + first bid
  expect(windowFor(listingWar, 300_000, 120_000)).toBe(300_000);
  expect(windowFor({ ...listingWar, quotes: [{}, {}, {}] }, 300_000, 120_000)).toBe(120_000);
});
