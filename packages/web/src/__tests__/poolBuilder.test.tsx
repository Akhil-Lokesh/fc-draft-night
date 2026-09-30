import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoolBuilder } from "../board/PoolBuilder.js";

const results = [
  { id: "l1", name: "F. Wirtz", position: "MID", value: 150.5, club: "Liverpool", clubId: null },
  { id: "l2", name: "A. Isak", position: "FWD", value: 111, club: "Liverpool", clubId: null },
];

test("typing a query calls search; picking players and confirming emits the chosen ids", async () => {
  const onSearch = vi.fn(), onConfirm = vi.fn();
  render(<PoolBuilder results={results as any} selected={[]} onSearch={onSearch} onToggle={() => {}} onConfirm={onConfirm} />);
  await userEvent.type(screen.getByPlaceholderText(/search the fc 26 catalog/i), "wirtz");
  expect(onSearch).toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /confirm pool/i }));
  expect(onConfirm).toHaveBeenCalled();
});

test("a search that finds nobody says why, instead of repeating the starting hint", async () => {
  render(<PoolBuilder results={[]} selected={[]} onSearch={() => {}} onToggle={() => {}} onConfirm={() => {}} />);
  expect(screen.getByText(/search to add pool players/i)).toBeTruthy(); // nothing typed yet
  await userEvent.type(screen.getByPlaceholderText(/search the fc 26 catalog/i), "zzzz");
  expect(screen.queryByText(/search to add pool players/i)).toBeNull();
  expect(screen.getByText(/no one found/i)).toBeTruthy();
  expect(screen.getByText(/already in this room/i)).toBeTruthy(); // the usual reason for a known name
});

test("selected players show a running count", () => {
  render(<PoolBuilder results={results as any} selected={["l1"]} onSearch={() => {}} onToggle={() => {}} onConfirm={() => {}} />);
  expect(screen.getByText(/1 selected/i)).toBeTruthy();
});

test("each row exposes its catalog id, separately from the pick toggle", async () => {
  const onToggle = vi.fn();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<PoolBuilder results={results as any} selected={[]} onSearch={() => {}} onToggle={onToggle} onConfirm={() => {}} />);

  await userEvent.click(screen.getByRole("button", { name: /id l1/i }));
  expect(writeText).toHaveBeenCalledWith("l1");
  expect(onToggle).not.toHaveBeenCalled(); // copying the id must not also pick/unpick the player
  expect(await screen.findByRole("button", { name: /copied/i })).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: /Wirtz/i }));
  expect(onToggle).toHaveBeenCalledWith("l1");
});
