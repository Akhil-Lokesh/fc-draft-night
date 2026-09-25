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

test("uploading a roster CSV sends its raw contents and rescopes manager count to its clubs", async () => {
  const start = vi.fn();
  render(<Setup floor={0} onStart={start} managerCount={5} maxCapacity={5} />);
  const csv = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\n";
  const file = new File([csv], "roster.csv", { type: "text/csv" });
  await userEvent.upload(screen.getByLabelText(/upload.*roster/i), file);

  // Only 2 clubs in the file — "how many managers" must not offer more than 2.
  const select = await screen.findByLabelText(/how many managers/i) as HTMLSelectElement;
  const options = Array.from(select.options).map(o => o.value);
  expect(options).toEqual(["2"]);

  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ rosterCsv: csv, capacity: 2 }));
});

test("uploading a richer tournament-format CSV counts clubs from its SQUADS section only", async () => {
  const start = vi.fn();
  render(<Setup floor={0} onStart={start} managerCount={5} maxCapacity={5} />);
  const csv = [
    "tournament,Friday Night League",
    "season,1",
    "budgetStep,0",
    "",
    "## TEAMS",
    "club,finishingPosition",
    "Chelsea,",
    "Atletico Madrid,",
    "Arsenal,",
    "",
    "## SQUADS",
    "club,player",
    "Chelsea,C. Palmer",
    "Atletico Madrid,J. Alvarez",
    "Arsenal,B. Saka",
    "",
    "## POOL",
    "club,player",
    "Liverpool,F. Wirtz",
    "Liverpool,A. Isak",
    "Liverpool,M. Salah",
  ].join("\n");
  const file = new File([csv], "tournament.csv", { type: "text/csv" });
  await userEvent.upload(screen.getByLabelText(/upload.*roster/i), file);

  // 3 clubs in SQUADS (Chelsea, Atletico Madrid, Arsenal) — TEAMS/POOL rows must not be counted.
  const select = await screen.findByLabelText(/how many managers/i) as HTMLSelectElement;
  expect(Array.from(select.options).map(o => o.value)).toEqual(["2", "3"]);
});
