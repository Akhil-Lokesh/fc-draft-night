import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Setup } from "../screens/Setup.js";

test("budget below the floor shows an error and blocks start", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} managerCount={5} />);
  const input = screen.getByLabelText(/total budget/i);
  await userEvent.clear(input); await userEvent.type(input, "500");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(screen.getByText(/below the floor/i)).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
});

test("valid budget starts the draft with chosen timers", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} managerCount={5} />);
  const input = screen.getByLabelText(/total budget/i);
  await userEvent.clear(input); await userEvent.type(input, "600");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalled();
});

test("a stray unit like 'M' or '€' in the budget is tolerated, not rejected", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} managerCount={5} />);
  const input = screen.getByLabelText(/total budget/i);
  await userEvent.clear(input); await userEvent.type(input, "600M");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ totalBudget: 600 }));
});

test("host picks how many managers this room holds, sent to onStart", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} managerCount={5} maxCapacity={5} />);
  const input = screen.getByLabelText(/total budget/i);
  await userEvent.clear(input); await userEvent.type(input, "600");
  await userEvent.selectOptions(screen.getByLabelText(/how many managers/i), "3");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ capacity: 3 }));
});
