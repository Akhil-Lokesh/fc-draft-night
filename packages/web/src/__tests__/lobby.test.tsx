import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lobby } from "../screens/Lobby.js";

const room: any = {
  code: "R0002", totalBudget: 1500, quoteTimerMs: 180_000, draftClockMs: 3_600_000, squadSizeCap: null,
  capacity: 5, seasonNumber: 1, status: "setup", startedAt: null,
  managers: {
    m_arsenal: { id: "m_arsenal", displayName: "loki", clubId: "arsenal", reserved: 1145, spendable: 355 },
  },
  players: {
    saka:  { id: "saka",  name: "B. Saka",  position: "FWD", listedValue: 120, originalValue: 120, ownerId: "m_arsenal", lockedThisSeason: false, homeClub: "arsenal" },
    pool1: { id: "pool1", name: "Free Agent", position: "MID", listedValue: 50, originalValue: 50, ownerId: null, lockedThisSeason: false, homeClub: null },
  },
  contests: {}, challenges: {}, log: [], seq: 0,
};

test("tapping a manager reveals their existing squad; pool players are excluded", async () => {
  render(<Lobby room={room} myId="m_arsenal" iAmHost={false} onStart={() => {}} />);
  expect(screen.queryByText(/B\. Saka/)).toBeNull(); // collapsed by default
  await userEvent.click(screen.getByRole("button", { name: /loki/i }));
  expect(screen.getByText(/B\. Saka/)).toBeTruthy();
  expect(screen.queryByText(/Free Agent/)).toBeNull(); // unowned → not in any squad
});
