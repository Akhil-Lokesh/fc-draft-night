import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Market } from "../board/Market.js";

const players = {
  haaland: { id: "haaland", name: "Erling Haaland", position: "FWD", positionDetail: "ST", tags: ["Aerial threat", "Strength"], listedValue: 180, ownerId: null },
  mbappe:  { id: "mbappe",  name: "Kylian Mbappé", position: "FWD", positionDetail: "ST", tags: ["Speedster", "Dribbler"], listedValue: 200, ownerId: "m_real" },
  saka:    { id: "saka",    name: "Bukayo Saka",    position: "FWD", listedValue: 150, ownerId: "m_bay" },
};

test("search filters the list by name across every group", async () => {
  render(<Market players={players as any} myId="m_bay" onList={() => {}} onChallenge={() => {}} />);
  await userEvent.type(screen.getByPlaceholderText(/search/i), "haal");
  expect(screen.getByText(/Haaland/)).toBeTruthy();
  expect(screen.queryByText(/Mbappé/)).toBeNull();
});

test("clicking an unowned player opens a confirm card with position + specialty, not an immediate claim", async () => {
  const onList = vi.fn();
  render(<Market players={players as any} myId="m_bay" onList={onList} onChallenge={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Haaland/ }));
  expect(onList).not.toHaveBeenCalled(); // first click only opens the card
  expect(screen.getByText(/Aerial threat/)).toBeTruthy();
  expect(screen.getByText(/Strength/)).toBeTruthy();
});

test("confirming the pool card's Claim button actually lists the player", async () => {
  const onList = vi.fn();
  render(<Market players={players as any} myId="m_bay" onList={onList} onChallenge={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Haaland/ }));
  await userEvent.click(screen.getByRole("button", { name: /^claim$/i }));
  expect(onList).toHaveBeenCalledWith("haaland");
});

test("the pool card's Cancel button backs out without claiming", async () => {
  const onList = vi.fn();
  render(<Market players={players as any} myId="m_bay" onList={onList} onChallenge={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Haaland/ }));
  await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
  expect(onList).not.toHaveBeenCalled();
  expect(screen.queryByText(/Aerial threat/)).toBeNull(); // card collapsed
});

test("a rival-owned player's card also shows position + specialty, then calls onChallenge on confirm", async () => {
  const onChallenge = vi.fn();
  render(<Market players={players as any} myId="m_bay" onList={() => {}} onChallenge={onChallenge} />);
  await userEvent.click(screen.getByRole("tab", { name: /real madrid/i })); // m_real's tab
  await userEvent.click(screen.getByRole("button", { name: /Mbappé/ })); // owned by m_real, not me
  expect(screen.getByText(/Speedster/)).toBeTruthy();
  const input = screen.getByLabelText(/bid amount/i);
  await userEvent.type(input, "210");
  await userEvent.click(screen.getByRole("button", { name: /^challenge$/i }));
  expect(onChallenge).toHaveBeenCalledWith("mbappe", 210);
});

test("a rival card's Cancel button backs out without challenging", async () => {
  const onChallenge = vi.fn();
  render(<Market players={players as any} myId="m_bay" onList={() => {}} onChallenge={onChallenge} />);
  await userEvent.click(screen.getByRole("tab", { name: /real madrid/i }));
  await userEvent.click(screen.getByRole("button", { name: /Mbappé/ }));
  await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
  expect(onChallenge).not.toHaveBeenCalled();
});

test("a player with no rating or specialty data still opens a card gracefully, with no placeholder text", async () => {
  render(<Market players={players as any} myId="nobody" onList={() => {}} onChallenge={() => {}} />);
  await userEvent.click(screen.getByRole("tab", { name: /bay/i }));
  await userEvent.click(screen.getByRole("button", { name: /Saka/ })); // no tags/overall on this fixture
  expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
  expect(screen.queryByText(/no specialty data/i)).toBeNull();
  expect(document.querySelector(".scout-tags")).toBeNull();
});

test("pool, your squad, and each rival team render as separate groups, not one mixed list", () => {
  const managers = {
    m_real: { id: "m_real", displayName: "Loki", clubId: "real", reserved: 0, spendable: 0 },
    m_bay: { id: "m_bay", displayName: "Akki", clubId: "bayern", reserved: 0, spendable: 0 },
  };
  render(<Market players={players as any} myId="m_bay" managers={managers as any} onList={() => {}} onChallenge={() => {}} />);
  expect(screen.getByRole("tab", { name: /pool/i })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /your squad/i })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /loki/i })).toBeTruthy(); // rival tab names the manager
});

test("each team is its own tab, so rivals aren't buried under a long pool", async () => {
  const managers = {
    m_real: { id: "m_real", displayName: "Loki", clubId: "real", reserved: 0, spendable: 0 },
    m_bay: { id: "m_bay", displayName: "Akki", clubId: "bayern", reserved: 0, spendable: 0 },
  };
  render(<Market players={players as any} myId="m_bay" managers={managers as any} onList={() => {}} onChallenge={() => {}} />);
  expect(screen.getByText(/Haaland/)).toBeTruthy(); // pool is the default tab
  expect(screen.queryByText(/Mbappé/)).toBeNull();
  await userEvent.click(screen.getByRole("tab", { name: /loki/i }));
  expect(screen.getByText(/Mbappé/)).toBeTruthy();
  expect(screen.queryByText(/Haaland/)).toBeNull();
});

test("a rival who owns nobody right now still gets a tab", () => {
  const managers = {
    m_bay: { id: "m_bay", displayName: "Akki", clubId: "bayern", reserved: 0, spendable: 0 },
    m_city: { id: "m_city", displayName: "Moe", clubId: "city", reserved: 0, spendable: 0 },
  };
  render(<Market players={players as any} myId="m_bay" managers={managers as any} onList={() => {}} onChallenge={() => {}} />);
  expect(screen.getByRole("tab", { name: /moe/i })).toBeTruthy();
});
