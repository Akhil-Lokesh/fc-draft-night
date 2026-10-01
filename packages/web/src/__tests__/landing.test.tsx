import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Landing } from "../screens/Landing.js";

test("the landing page states the quote cap, challenge cap, and overcommit fine — the numbers that actually govern play", () => {
  render(<Landing onHost={() => {}} onJoin={() => {}} />);
  expect(screen.getByText(/2 raises/i)).toBeTruthy(); // war.ts: used >= 2 throws "quote cap reached"
  expect(screen.getByText(/3 times/i)).toBeTruthy(); // challenge.ts: CHALLENGE_CAP = 3
  expect(screen.getByText(/25M fine/i)).toBeTruthy(); // types.ts: OVERCOMMIT_FINE = 25
});

test("the landing page still shows the host/join actions alongside the rules", () => {
  render(<Landing onHost={() => {}} onJoin={() => {}} />);
  expect(screen.getByRole("button", { name: /host a draft/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /join with a code/i })).toBeTruthy();
});

test("the rules say the auction can't end while anyone is over budget", () => {
  render(<Landing onHost={() => {}} onJoin={() => {}} />);
  expect(screen.getByText(/in the black/i)).toBeTruthy();
  expect(screen.getByText(/can't end while anyone is over budget/i)).toBeTruthy();
  expect(screen.getByText(/release players/i)).toBeTruthy();
});
