import { test, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  render(<Setup onStart={() => {}} />);
  expect(screen.getByRole("button", { name: /start draft/i })).toBeDisabled();
  expect(screen.getByText(/upload your roster file/i)).toBeTruthy(); // step 1 of the instructions
  expect(screen.queryByLabelText(/how many managers/i)).toBeNull(); // nothing to size until clubs are known
  expect(screen.queryByText(/built-in/i)).toBeNull(); // the old "skip this to play the built-in 5" is gone
});

test("a roster template can be downloaded from the setup page", () => {
  render(<Setup onStart={() => {}} />);
  const link = screen.getByRole("link", { name: /template/i }) as HTMLAnchorElement;
  expect(link.getAttribute("href")).toMatch(/roster-template\.csv$/);
  expect(link.hasAttribute("download")).toBe(true);
});

test("uploading a roster enables creating the room", async () => {
  const start = vi.fn();
  render(<Setup onStart={start} />);
  await uploadRoster();
  const go = screen.getByRole("button", { name: /start draft/i });
  expect(go).toBeEnabled();
  await userEvent.click(go);
  expect(start).toHaveBeenCalledTimes(1);
});

test("the test-room switch is off unless turned on, and is sent when it is", async () => {
  const start = vi.fn();
  const { unmount } = render(<Setup onStart={start} />);
  await uploadRoster();
  const sw = screen.getByRole("checkbox", { name: /test room/i }) as HTMLInputElement;
  expect(sw.checked).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start.mock.calls[0]![0].testMode).toBeFalsy();
  unmount();

  const start2 = vi.fn();
  render(<Setup onStart={start2} />);
  await uploadRoster();
  await userEvent.click(screen.getByRole("checkbox", { name: /test room/i }));
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start2.mock.calls[0]![0].testMode).toBe(true);
});

test("host picks how many managers this room holds, sent to onStart", async () => {
  const start = vi.fn();
  render(<Setup onStart={start} />);
  await uploadRoster(THREE_CLUBS);
  await userEvent.selectOptions(screen.getByLabelText(/how many managers/i), "2");
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ capacity: 2 }));
});

test("the roster's raw contents are sent, and the manager count is sized to its clubs", async () => {
  const start = vi.fn();
  render(<Setup onStart={start} />);
  await uploadRoster(TWO_CLUBS);

  // Only 2 clubs in the file — "how many managers" must not offer more than 2.
  const select = screen.getByLabelText(/how many managers/i) as HTMLSelectElement;
  expect(Array.from(select.options).map(o => o.value)).toEqual(["2"]);

  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ rosterCsv: TWO_CLUBS, capacity: 2 }));
});

test("removing the roster takes the teams away again and blocks creating", async () => {
  render(<Setup onStart={() => {}} />);
  await uploadRoster();
  await userEvent.upload(screen.getByLabelText(/upload.*roster/i), []);
  expect(screen.getByRole("button", { name: /start draft/i })).toBeDisabled();
});

test("uploading a richer tournament-format CSV counts clubs from its SQUADS section only", async () => {
  render(<Setup onStart={() => {}} />);
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


test("there is no budget box and no squad cap: the budget is fixed, so the page just says what it is", () => {
  render(<Setup onStart={() => {}} />);
  expect(screen.queryByRole("textbox", { name: /budget/i })).toBeNull();
  expect(screen.queryByLabelText(/squad cap/i)).toBeNull();
  const note = screen.getByRole("note", { name: /budgets/i });
  expect(note).toHaveTextContent(/1500M/);
  expect(note).toHaveTextContent(/150M/); // each half star lower
  expect(note).toHaveTextContent(/leftover/i);
  expect(note).toHaveTextContent(/20M/);
});

test("the page has three parts: the roster file, the clock, and testing", () => {
  render(<Setup onStart={() => {}} />);
  const legends = screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent ?? "");
  expect(legends.join("|")).toMatch(/Roster.*Clock.*Testing/);
});

test("the room starts with no cap and the host's quote timer; no budget is sent", async () => {
  const start = vi.fn();
  render(<Setup onStart={start} />);
  await uploadRoster();
  await userEvent.click(screen.getByRole("radio", { name: /3 min/i }));
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  const cfg = start.mock.calls[0]![0];
  expect(cfg.quoteTimerMs).toBe(180_000);
  expect(cfg.squadSizeCap).toBeNull();
  expect(cfg).not.toHaveProperty("totalBudget");
});

test("the quote timer defaults to 5 minutes", async () => {
  const start = vi.fn();
  render(<Setup onStart={start} />);
  await uploadRoster();
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start.mock.calls[0]![0].quoteTimerMs).toBe(300_000);
});

test("the page no longer carries a 'Host setup' label above the logo", () => {
  render(<Setup onStart={() => {}} />);
  expect(screen.queryByText(/host setup/i)).toBeNull();
});

test("below the button there are step-by-step instructions for hosting", () => {
  render(<Setup onStart={() => {}} />);
  const how = screen.getByRole("region", { name: /how it works/i });
  const steps = within(how).getAllByRole("listitem");
  expect(steps.length).toBeGreaterThanOrEqual(4);
  expect(how).toHaveTextContent(/roster file/i);
  expect(how).toHaveTextContent(/room code/i);
  expect(how).toHaveTextContent(/start/i);
  expect(how).not.toHaveTextContent(/test/i); // the test room is a local tool, never part of the public instructions
  const button = screen.getByRole("button", { name: /start draft/i });
  expect(button.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // after the button
});

test("the two loose hint lines above the button are gone", () => {
  render(<Setup onStart={() => {}} />);
  expect(screen.queryByText(/every team and player comes from your file/i)).toBeNull();
  expect(screen.queryByText(/next you get a room code to share/i)).toBeNull();
});

test("the Test room switch only exists when running locally", () => {
  const { unmount } = render(<Setup onStart={() => {}} allowTestRoom />);
  expect(screen.getByRole("checkbox", { name: /test room/i })).toBeTruthy();
  unmount();
  render(<Setup onStart={() => {}} allowTestRoom={false} />);
  expect(screen.queryByRole("checkbox", { name: /test room/i })).toBeNull();
  expect(screen.queryByText(/testing/i)).toBeNull();
  expect(screen.queryByText(/test room/i)).toBeNull();
});

test("online, the page lists only Roster and Clock, and never sends a test room", async () => {
  const start = vi.fn();
  render(<Setup onStart={start} allowTestRoom={false} />);
  const legends = screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent ?? "").join("|");
  expect(legends).toMatch(/Roster.*Clock/);
  expect(legends).not.toMatch(/Testing/);
  await uploadRoster();
  await userEvent.click(screen.getByRole("button", { name: /start draft/i }));
  expect(start.mock.calls[0]![0].testMode).toBeFalsy();
});

test("the local-host check recognises localhost, 127.0.0.1 and ::1 only", async () => {
  const { isLocalHost } = await import("../lib/env.js");
  for (const h of ["localhost", "127.0.0.1", "[::1]", "::1"]) expect(isLocalHost(h)).toBe(true);
  for (const h of ["fc-draft-night.fly.dev", "example.com", "localhost.evil.com", "192.168.1.5"]) expect(isLocalHost(h)).toBe(false);
});
