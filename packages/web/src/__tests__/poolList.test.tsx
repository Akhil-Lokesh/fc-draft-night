import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoolList } from "../components/PoolList.js";

const players = {
  haaland: { id: "haaland", name: "Erling Haaland", position: "FWD", listedValue: 180, ownerId: null },
  mbappe:  { id: "mbappe",  name: "Kylian Mbappé", position: "FWD", listedValue: 200, ownerId: "m_real" },
};

test("search filters the list by name", async () => {
  render(<PoolList players={players as any} myId="m_bay" onList={() => {}} onChallenge={() => {}} />);
  await userEvent.type(screen.getByPlaceholderText(/search/i), "haal");
  expect(screen.getByText(/Haaland/)).toBeTruthy();
  expect(screen.queryByText(/Mbappé/)).toBeNull();
});

test("clicking an unowned player claims it at listed value", async () => {
  const onList = vi.fn();
  render(<PoolList players={players as any} myId="m_bay" onList={onList} onChallenge={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Haaland/ }));
  expect(onList).toHaveBeenCalledWith("haaland");
});

test("a rival-owned player opens a bid-amount input, then calls onChallenge", async () => {
  const onChallenge = vi.fn();
  render(<PoolList players={players as any} myId="m_bay" onList={() => {}} onChallenge={onChallenge} />);
  await userEvent.click(screen.getByRole("button", { name: /Mbappé/ })); // owned by m_real, not me
  const input = screen.getByLabelText(/bid amount/i);
  await userEvent.type(input, "210");
  await userEvent.click(screen.getByRole("button", { name: /challenge/i }));
  expect(onChallenge).toHaveBeenCalledWith("mbappe", 210);
});
