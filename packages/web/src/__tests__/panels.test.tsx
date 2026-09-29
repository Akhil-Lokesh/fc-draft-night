import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Standings } from "../board/Standings.js";
import { Feed } from "../board/Feed.js";
import { TeamList } from "../board/TeamList.js";
import { MySquad } from "../board/MySquad.js";
import { ClubNames } from "../lib/clubs.js";

const managers = {
  m_city: { id: "m_city", displayName: "City", clubId: "city", reserved: 300, spendable: 34 },
  m_bay:  { id: "m_bay",  displayName: "Bayern", clubId: "bayern", reserved: 200, spendable: 350 },
};

test("standings show each manager's spendable, richest first", () => {
  render(<Standings managers={managers as any} totalBudget={600} myId="m_city" challenges={{}} />);
  const rows = screen.getAllByRole("row").slice(1); // skip header
  expect(rows[0]).toHaveTextContent(/Bayern/);
  expect(rows[1]).toHaveTextContent(/City/);
  expect(screen.getByText(/34M/)).toBeTruthy();
});

test("standings show my used/remaining challenges against each rival", () => {
  render(<Standings managers={managers as any} totalBudget={600} myId="m_bay" challenges={{ "m_bay->m_city": 2 }} />);
  expect(screen.getByText(/2\s*\/\s*3/)).toBeTruthy();
});

test("feed renders newest entries", () => {
  render(<Feed log={[{ t: "win", at: 1, contestId: "c1", managerId: "m_city", playerId: "pedri", price: 90 }] as any} players={{ pedri: { name: "Pedri" } } as any} managers={managers as any} />);
  expect(screen.getByText(/Pedri/)).toBeTruthy();
});

test("feed shows the team name alongside the manager, not just the manager", () => {
  render(<Feed log={[{ t: "win", at: 1, contestId: "c1", managerId: "m_city", playerId: "pedri", price: 90 }] as any} players={{ pedri: { name: "Pedri" } } as any} managers={managers as any} />);
  expect(screen.getByText(/Manchester City \(City\)/)).toBeTruthy();
});

test("an uploaded club uses the room's real display name, not its slug", () => {
  const m = { m_atm: { id: "m_atm", displayName: "Loki", clubId: "atletico-madrid", reserved: 0, spendable: 0 } };
  render(
    <ClubNames.Provider value={{ "atletico-madrid": "Atlético Madrid" }}>
      <Feed log={[{ t: "bid", at: 1, contestId: "c1", managerId: "m_atm", amount: 5 }] as any} players={{}} managers={m as any} />
    </ClubNames.Provider>,
  );
  expect(screen.getByText(/Atlético Madrid \(Loki\)/)).toBeTruthy();
});

test("team list shows every manager, revealing their players on tap", async () => {
  const players = {
    pedri: { id: "pedri", name: "Pedri", position: "MID", listedValue: 90, ownerId: "m_city", lockedThisSeason: false },
    isak: { id: "isak", name: "Isak", position: "FWD", listedValue: 60, ownerId: "m_bay", lockedThisSeason: false },
    free: { id: "free", name: "Free Agent", position: "MID", listedValue: 5, ownerId: null, lockedThisSeason: false },
  };
  render(<TeamList players={players as any} managers={managers as any} myId="m_city" />);
  expect(screen.queryByText(/Pedri/)).toBeNull(); // collapsed by default
  expect(screen.queryByText(/Free Agent/)).toBeNull(); // unowned isn't anyone's squad
  await userEvent.click(screen.getByRole("button", { name: /manchester city/i }));
  expect(screen.getByText(/Pedri/)).toBeTruthy();
  expect(screen.queryByText(/Isak/)).toBeNull(); // Bayern still collapsed
});

test("tapping a squad player opens a scout card with rating + specialty, not an immediate release", async () => {
  const released: string[] = [];
  const mk = (id: string, name: string, locked: boolean) =>
    ({ id, name, position: "MID", listedValue: 10, originalValue: 10, ownerId: "m_city", lockedThisSeason: locked,
      homeClub: "city", overall: 88, tags: ["Playmaker", "Tactician"] });
  render(
    <MySquad listed={[]} sold={[]} starting={[mk("a", "Rodri", false), mk("b", "Foden", true)] as any} acquired={[]}
      managers={managers as any} now={0} onRelease={(id) => released.push(id)} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Rodri/ }));
  expect(released).toEqual([]); // first tap only opens the scout card
  expect(document.querySelector(".pc-ovr")?.textContent).toBe("88");
  expect(screen.getByText(/Playmaker/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Foden/ })).toBeDisabled(); // locked, can't even open its card
});

test("confirming the scout card's Release button actually releases the player", async () => {
  const released: string[] = [];
  const rodri = { id: "a", name: "Rodri", position: "MID", listedValue: 10, originalValue: 10, ownerId: "m_city", lockedThisSeason: false, homeClub: "city" };
  render(
    <MySquad listed={[]} sold={[]} starting={[rodri] as any} acquired={[]}
      managers={managers as any} now={0} onRelease={(id) => released.push(id)} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Rodri/ }));
  await userEvent.click(screen.getByRole("button", { name: /^release/i }));
  expect(released).toEqual(["a"]);
});

test("the scout card's Cancel button backs out without releasing", async () => {
  const released: string[] = [];
  const rodri = { id: "a", name: "Rodri", position: "MID", listedValue: 10, originalValue: 10, ownerId: "m_city", lockedThisSeason: false, homeClub: "city" };
  render(
    <MySquad listed={[]} sold={[]} starting={[rodri] as any} acquired={[]}
      managers={managers as any} now={0} onRelease={(id) => released.push(id)} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Rodri/ }));
  await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
  expect(released).toEqual([]);
  expect(screen.queryByRole("button", { name: /^release/i })).toBeNull(); // card collapsed
});

test("a squad player with no rating or specialty data still opens a scout card gracefully, with no placeholder text", async () => {
  const rodri = { id: "a", name: "Rodri", position: "MID", listedValue: 10, originalValue: 10, ownerId: "m_city", lockedThisSeason: false, homeClub: "city" };
  render(
    <MySquad listed={[]} sold={[]} starting={[rodri] as any} acquired={[]}
      managers={managers as any} now={0} onRelease={() => {}} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Rodri/ }));
  expect(screen.getByRole("button", { name: /^release/i })).toBeTruthy(); // card opened fine
  expect(screen.queryByText(/no specialty data/i)).toBeNull(); // no "nothing here" flag
  expect(document.querySelector(".scout-tags")).toBeNull(); // and no empty tags row at all
});

test("a player currently up for release shows in its own Listed band, not Starting", () => {
  const mk = (id: string, name: string) =>
    ({ id, name, position: "MID", listedValue: 10, originalValue: 10, ownerId: "m_city", lockedThisSeason: false, homeClub: "city" });
  render(
    <MySquad listed={[{ id: "a", name: "Rodri", price: 10, closesAt: 90_000, contested: false }]} sold={[]}
      starting={[mk("b", "Foden")] as any} acquired={[]}
      managers={managers as any} now={30_000} onRelease={() => {}} />,
  );
  expect(screen.getByText(/^listed/i)).toBeTruthy();
  expect(screen.getByText(/closes in 1:00/i)).toBeTruthy();
  expect(screen.getByText(/Foden/)).toBeTruthy();
});

test("a listed player that's been challenged into a war reads as contested, not a plain listing", () => {
  render(
    <MySquad listed={[{ id: "a", name: "Rodri", price: 15, closesAt: 90_000, contested: true }]} sold={[]}
      starting={[]} acquired={[]} managers={managers as any} now={30_000} onRelease={() => {}} />,
  );
  expect(screen.getByText(/bidding war/i)).toBeTruthy();
});

test("no Listed band when nothing is currently up for release", () => {
  render(<MySquad listed={[]} sold={[]} starting={[]} acquired={[]} managers={managers as any} now={0} onRelease={() => {}} />);
  expect(screen.queryByText(/awaiting a buyer/i)).toBeNull();
});

test("a player in a live contest can be scouted but not released", async () => {
  const released: string[] = [];
  const rodri = { id: "a", name: "Rodri", position: "MID", listedValue: 10, originalValue: 10, ownerId: "m_city", lockedThisSeason: false, homeClub: "city" };
  render(
    <MySquad listed={[]} sold={[]} starting={[rodri] as any} acquired={[]} managers={managers as any} now={0}
      onRelease={(id) => released.push(id)} inContest={new Set(["a"])} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Rodri/ }));
  expect(screen.getByRole("button", { name: /^release/i })).toBeDisabled();
  expect(screen.getByText(/live contest/i)).toBeTruthy();
});
