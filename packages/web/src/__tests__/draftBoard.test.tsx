import { test, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftBoard } from "../screens/DraftBoard.js";

function room(): any {
  return {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs: 3_600_000, squadSizeCap: null,
    seasonNumber: 1, status: "live", startedAt: 0,
    managers: { m_real: { id: "m_real", displayName: "Real", clubId: "real", reserved: 425, spendable: 175 } },
    players: { mbappe: { id: "mbappe", name: "Kylian Mbappé", position: "FWD", listedValue: 200, originalValue: 200, ownerId: "m_real", lockedThisSeason: false, homeClub: "real" } },
    contests: { c1: { id: "c1", playerId: "mbappe", type: "war", status: "war", listerId: "m_bar", quotes: [{ managerId: "m_bar", amount: 220, at: 0 }], quoteCounts: { m_bar: 1 }, closesAt: 300_000 } },
    challenges: {}, log: [], seq: 1,
  };
}

const actions = { bid: () => {}, openListing: () => {}, challenge: () => {}, forfeit: () => {} };

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

test("History / Sold / Squads tabs each show a distinct view of the room", async () => {
  const r = room();
  r.log = [
    { t: "bid", at: 0, contestId: "c1", managerId: "m_bar", amount: 220 },
    { t: "win", at: 1, contestId: "c0", managerId: "m_real", playerId: "mbappe", price: 200 },
  ];
  render(<DraftBoard room={r} myId="m_real" now={0} actions={actions} />);

  // The ticker also repeats headline moves, so scope assertions to the feed itself.
  const feed = () => within(document.querySelector(".feed") as HTMLElement);

  // History (default): both the bid and the win show.
  expect(feed().getByText(/m_bar/)).toBeTruthy(); // the bid entry's manager fallback text
  expect(feed().getByText(/won/i)).toBeTruthy();

  // Sold: only the win remains.
  await userEvent.click(screen.getByRole("tab", { name: /^sold$/i }));
  expect(feed().queryByText(/m_bar/)).toBeNull();
  expect(feed().getByText(/won/i)).toBeTruthy();

  // Squads: lists the manager, revealing their players on tap. (Mbappé already shows in the
  // "Your squad" pane too, since myId owns him — just prove the reveal adds more.)
  await userEvent.click(screen.getByRole("tab", { name: /^squads$/i }));
  const before = screen.getAllByText(/Mbappé/).length;
  const teams = document.querySelector(".pane-room .teams") as HTMLElement;
  await userEvent.click(within(teams).getByRole("button", { name: /real/i }));
  expect(screen.getAllByText(/Mbappé/).length).toBeGreaterThan(before);
});

test("the defending owner can give up on a war straight from the board", async () => {
  const forfeit = vi.fn();
  render(<DraftBoard room={room()} myId="m_real" now={0} actions={{ ...actions, forfeit }} />);
  await userEvent.click(screen.getByRole("button", { name: /give up/i }));
  expect(forfeit).toHaveBeenCalledWith("c1");
});

test("the host sees an End auction button; a non-host manager does not", () => {
  const { rerender } = render(
    <DraftBoard room={room()} myId="m_real" now={0} actions={actions} iAmHost onEndDraft={() => {}} />,
  );
  expect(screen.getByRole("button", { name: /end auction/i })).toBeTruthy();

  rerender(<DraftBoard room={room()} myId="m_real" now={0} actions={actions} />);
  expect(screen.queryByRole("button", { name: /end auction/i })).toBeNull();
});

test("End auction needs a second confirming tap before it fires onEndDraft", async () => {
  const onEndDraft = vi.fn();
  render(<DraftBoard room={room()} myId="m_real" now={0} actions={actions} iAmHost onEndDraft={onEndDraft} />);
  await userEvent.click(screen.getByRole("button", { name: /end auction/i }));
  expect(onEndDraft).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /confirm end/i }));
  expect(onEndDraft).toHaveBeenCalledTimes(1);
});

test("backing out of End auction keeps the draft running", async () => {
  const onEndDraft = vi.fn();
  render(<DraftBoard room={room()} myId="m_real" now={0} actions={actions} iAmHost onEndDraft={onEndDraft} />);
  await userEvent.click(screen.getByRole("button", { name: /end auction/i }));
  await userEvent.click(screen.getByRole("button", { name: /keep going/i }));
  expect(onEndDraft).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /end auction/i })).toBeTruthy();
});

test("the mobile dock switches which pane is active", async () => {
  const { container } = render(<DraftBoard room={room()} myId="m_real" now={0} actions={actions} />);
  const board = container.querySelector(".board")!;
  expect(board.getAttribute("data-pane")).toBe("live");
  await userEvent.click(screen.getByRole("button", { name: /^market/i }));
  expect(board.getAttribute("data-pane")).toBe("market");
});

test("your squad strip has no acquired-players divider when everyone is from your own starting squad", () => {
  render(<DraftBoard room={room()} myId="m_real" now={0} actions={actions} />);
  expect(screen.queryByText(/acquired/i)).toBeNull();
});

test("a player won from another club during the draft shows below a divider, separate from your starting squad", () => {
  const r = room();
  r.players.pedri = {
    id: "pedri", name: "Pedri", position: "MID", listedValue: 90, originalValue: 90,
    ownerId: "m_real", lockedThisSeason: true, homeClub: "barca", // not Real's own club — won during the draft
  };
  render(<DraftBoard room={r} myId="m_real" now={0} actions={actions} />);
  expect(screen.getByText(/acquired/i)).toBeTruthy();
  expect(screen.getAllByText(/Pedri/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Mbappé/).length).toBeGreaterThan(0);
});

test("no sold section when you haven't released-and-lost any player", () => {
  render(<DraftBoard room={room()} myId="m_real" now={0} actions={actions} />);
  expect(screen.queryByText(/^taken by rivals$/i)).toBeNull();
});

test("a player you released that another manager won shows in a Sold section, above the starting squad", () => {
  const r = room();
  // Real self-listed Vinícius (release-listing); Bayern ended up winning it away from Real.
  r.players.vini = {
    id: "vini", name: "Vinícius Jr.", position: "FWD", listedValue: 70, originalValue: 70,
    ownerId: "m_bay", lockedThisSeason: true, homeClub: "real",
  };
  r.contests.cRelease = {
    id: "cRelease", playerId: "vini", type: "release-listing", status: "closed", listerId: "m_real",
    quotes: [{ managerId: "m_real", amount: 70, at: 0 }, { managerId: "m_bay", amount: 70, at: 5 }],
    quoteCounts: {}, closesAt: 120_000,
  };
  r.log = [{ t: "win", at: 10, contestId: "cRelease", managerId: "m_bay", playerId: "vini", price: 70 }];
  render(<DraftBoard room={r} myId="m_real" now={0} actions={actions} />);
  expect(screen.getByText(/^taken by rivals$/i)).toBeTruthy();
  expect(screen.getAllByText(/Vinícius/).length).toBeGreaterThan(0);
});

test("a release-listing nobody else bid on (still yours) does NOT count as sold — the domain logs this as 'unsold', not 'win'", () => {
  const r = room();
  r.contests.cRelease = {
    id: "cRelease", playerId: "mbappe", type: "release-listing", status: "closed", listerId: "m_real",
    quotes: [{ managerId: "m_real", amount: 200, at: 0 }],
    quoteCounts: {}, closesAt: 120_000,
  };
  r.log = [{ t: "unsold", at: 10, contestId: "cRelease", managerId: "m_real", playerId: "mbappe", price: 200 }];
  render(<DraftBoard room={r} myId="m_real" now={0} actions={actions} />);
  expect(screen.queryByText(/^taken by rivals$/i)).toBeNull();
  // History still shows it, but reads as a no-op, not a fresh purchase.
  const feed = within(document.querySelector(".feed") as HTMLElement);
  expect(feed.getByText(/no bids/i)).toBeTruthy();
});

// Defensive: even an (unreachable, pre-fix-shaped) "win" entry for a self-revert must still not
// be misread as a sale — belt and braces alongside the domain-level "unsold" fix above.
test("a same-manager 'win' log entry (belt-and-braces) still does NOT count as sold", () => {
  const r = room();
  r.contests.cRelease = {
    id: "cRelease", playerId: "mbappe", type: "release-listing", status: "closed", listerId: "m_real",
    quotes: [{ managerId: "m_real", amount: 200, at: 0 }],
    quoteCounts: {}, closesAt: 120_000,
  };
  r.log = [{ t: "win", at: 10, contestId: "cRelease", managerId: "m_real", playerId: "mbappe", price: 200 }];
  render(<DraftBoard room={r} myId="m_real" now={0} actions={actions} />);
  expect(screen.queryByText(/^taken by rivals$/i)).toBeNull();
});

test("there's no way to walk out of a live draft — it runs until the host ends it", () => {
  render(<DraftBoard room={room()} myId="m_real" now={0} actions={actions} />);
  expect(screen.queryByRole("button", { name: /leave/i })).toBeNull();
});

test("a player a rival won off you in a challenge war shows at the top, with the club that took him", () => {
  const r = room();
  r.managers.m_roma = { id: "m_roma", displayName: "Loki", clubId: "roma", reserved: 0, spendable: 0 };
  // Never released — Roma challenged for him and won the war.
  r.players.saibari = {
    id: "saibari", name: "I. Saibari", position: "MID", positionDetail: "CAM", shirtNumber: 34,
    listedValue: 92, originalValue: 26.5, ownerId: "m_roma", lockedThisSeason: true, homeClub: "real",
  };
  r.log = [{ t: "win", at: 10, contestId: "cWar", managerId: "m_roma", playerId: "saibari", price: 92 }];
  render(<DraftBoard room={r} myId="m_real" now={0} actions={actions} />);
  const band = document.querySelector(".band-sold") as HTMLElement;
  expect(within(band).getByText(/^taken by rivals$/i)).toBeTruthy();
  expect(within(band).getByText(/Saibari/)).toBeTruthy();
  expect(within(band).getByText(/CAM/)).toBeTruthy();
  expect(within(band).getByText(/roma/i, { selector: ".sq-to" })).toBeTruthy();
});

test("a player you lost and then won back is no longer listed as taken", () => {
  const r = room();
  r.managers.m_roma = { id: "m_roma", displayName: "Loki", clubId: "roma", reserved: 0, spendable: 0 };
  r.log = [
    { t: "win", at: 10, contestId: "w1", managerId: "m_roma", playerId: "mbappe", price: 210 },
    { t: "win", at: 20, contestId: "w2", managerId: "m_real", playerId: "mbappe", price: 230 },
  ];
  render(<DraftBoard room={r} myId="m_real" now={0} actions={actions} />);
  expect(screen.queryByText(/^taken by rivals$/i)).toBeNull();
});
