import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoolBuilder } from "../components/PoolBuilder.js";

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

test("selected players show a running count", () => {
  render(<PoolBuilder results={results as any} selected={["l1"]} onSearch={() => {}} onToggle={() => {}} onConfirm={() => {}} />);
  expect(screen.getByText(/1 selected/i)).toBeTruthy();
});
