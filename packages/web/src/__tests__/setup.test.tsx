import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Setup } from "../screens/Setup.js";

const TWO_CLUBS = "club,player\nChelsea,C. Palmer\nChelsea,M. Caicedo\nAtletico Madrid,J. Alvarez\n";
const THREE_CLUBS = TWO_CLUBS + "Arsenal,B. Saka\n";

/** A room now comes from a roster; there are no built-in teams to fall back on. */
async function uploadRoster(csv = TWO_CLUBS) {
  await userEvent.upload(screen.getByLabelText(/upload.*roster/i), new File([csv], "roster.csv", { type: "text/csv" }));
  await screen.findByLabelText(/how many managers/i);
}

test("without a roster there are no teams: creating is blocked and the page says what to do", () => {
  render(<Setup floor={600} onStart={() => {}} />);
  expect(screen.getByRole("button", { name: /start draft/i })).toBeDisabled();
  expect(screen.getByText(/upload a roster/i)).toBeTruthy();
  expect(screen.queryByLabelText(/how many managers/i)).toBeNull(); // nothing to size until clubs are known
  expect(screen.queryByText(/built-in/i)).toBeNull(); // the old "skip this to play the built-in 5" is gone
});

test("a roster template can be downloaded from the setup page", () => {
  render(<Setup floor={600} onStart={() => {}} />);
  const link = screen.getByRole("link", { name: /template/i }) as HTMLAnchorElement;
  expect(link.getAttribute("href")).toMatch(/roster-template\.csv$/);
  expect(link.hasAttribute("download")).toBe(true);
});

test("uploading a roster enables creating the room", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} />);
  await uploadRoster();
  const go = screen.getByRole("button", { name: /start draft/i });
  expect(go).toBeEnabled();
  await userEvent.click(go);
  expect(start).toHaveBeenCalledTimes(1);
});

test("budget below the floor shows an error and blocks start", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} />);
  await uploadRoster();
  const input = screen.getByLabelText(/5.star club/i);
  await userEvent.clear(input); await userEvent.type(input, "500");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(screen.getByText(/below the floor/i)).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
});

test("the test-room switch is off unless turned on, and is sent when it is", async () => {
  const start = vi.fn();
  const { unmount } = render(<Setup floor={600} onStart={start} />);
  await uploadRoster();
  const sw = screen.getByRole("checkbox", { name: /test room/i }) as HTMLInputElement;
  expect(sw.checked).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start.mock.calls[0]![0].testMode).toBeFalsy();
  unmount();

  const start2 = vi.fn();
  render(<Setup floor={600} onStart={start2} />);
  await uploadRoster();
  await userEvent.click(screen.getByRole("checkbox", { name: /test room/i }));
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start2.mock.calls[0]![0].testMode).toBe(true);
});

test("valid budget starts the draft with chosen timers", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} />);
  await uploadRoster();
  const input = screen.getByLabelText(/5.star club/i);
  await userEvent.clear(input); await userEvent.type(input, "600");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalled();
});

test("a stray unit like 'M' or '€' in the budget is tolerated, not rejected", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} />);
  await uploadRoster();
  const input = screen.getByLabelText(/5.star club/i);
  await userEvent.clear(input); await userEvent.type(input, "600M");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ totalBudget: 600 }));
});

test("host picks how many managers this room holds, sent to onStart", async () => {
  const start = vi.fn();
  render(<Setup floor={600} onStart={start} />);
  await uploadRoster(THREE_CLUBS);
  const input = screen.getByLabelText(/5.star club/i);
  await userEvent.clear(input); await userEvent.type(input, "600");
  await userEvent.selectOptions(screen.getByLabelText(/how many managers/i), "2");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ capacity: 2 }));
});

test("the roster's raw contents are sent, and the manager count is sized to its clubs", async () => {
  const start = vi.fn();
  render(<Setup floor={0} onStart={start} />);
  await uploadRoster(TWO_CLUBS);

  // Only 2 clubs in the file — "how many managers" must not offer more than 2.
  const select = screen.getByLabelText(/how many managers/i) as HTMLSelectElement;
  expect(Array.from(select.options).map(o => o.value)).toEqual(["2"]);

  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ rosterCsv: TWO_CLUBS, capacity: 2 }));
});

test("removing the roster takes the teams away again and blocks creating", async () => {
  render(<Setup floor={0} onStart={() => {}} />);
  await uploadRoster();
  await userEvent.upload(screen.getByLabelText(/upload.*roster/i), []);
  expect(screen.getByRole("button", { name: /start draft/i })).toBeDisabled();
});

test("uploading a richer tournament-format CSV counts clubs from its SQUADS section only", async () => {
  render(<Setup floor={0} onStart={() => {}} />);
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
  await uploadRoster(csv);

  // 3 clubs in SQUADS (Chelsea, Atletico Madrid, Arsenal) — TEAMS/POOL rows must not be counted.
  const select = screen.getByLabelText(/how many managers/i) as HTMLSelectElement;
  expect(Array.from(select.options).map(o => o.value)).toEqual(["2", "3"]);
});

test("the budget box says it is a 5-star club's budget, what each half star costs, and what being over means", () => {
  render(<Setup floor={1500} onStart={() => {}} />);
  expect(screen.getByLabelText(/budget for a 5.star club/i)).toBeTruthy();
  const hint = screen.getByText(/each half.star/i);
  expect(hint).toHaveTextContent(/150M/);
  expect(hint).toHaveTextContent(/release/i);
});
