import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lobby } from "../screens/Lobby.js";

const room: any = {
  code: "R0002", totalBudget: 1500, quoteTimerMs: 180_000, draftClockMs: 3_600_000, squadSizeCap: null,
  capacity: 5, clubNames: {}, clubBudgets: {}, seasonNumber: 1, status: "setup", startedAt: null,
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

test("the host can't start until every seat is filled, and is told how many are missing", async () => {
  const onStart = vi.fn();
  render(<Lobby room={room} myId="m_arsenal" iAmHost onStart={onStart} />); // 1 of 5 seats taken
  const start = screen.getByRole("button", { name: /waiting for 4 more/i }) as HTMLButtonElement;
  expect(start.disabled).toBe(true);
  await userEvent.click(start);
  expect(onStart).not.toHaveBeenCalled();
});

test("once the room is full the host's Start button is live", async () => {
  const onStart = vi.fn();
  render(<Lobby room={{ ...room, capacity: 1 }} myId="m_arsenal" iAmHost onStart={onStart} />);
  await userEvent.click(screen.getByRole("button", { name: /start the draft/i }));
  expect(onStart).toHaveBeenCalledTimes(1);
});

test("the host's Leave control walks straight out, no approval needed", async () => {
  const onLeave = vi.fn();
  render(<Lobby room={room} myId="m_arsenal" iAmHost onStart={() => {}} onLeave={onLeave} />);
  await userEvent.click(screen.getByRole("button", { name: /leave room/i }));
  expect(onLeave).toHaveBeenCalledTimes(1);
});

test("a guest's Leave asks the host instead of walking out, and can be taken back", async () => {
  const onLeave = vi.fn(), onRequestLeave = vi.fn(), onCancelLeave = vi.fn();
  const { rerender } = render(
    <Lobby room={room} myId="m_arsenal" iAmHost={false} onStart={() => {}} onLeave={onLeave} onRequestLeave={onRequestLeave} onCancelLeave={onCancelLeave} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /leave room/i }));
  expect(onRequestLeave).toHaveBeenCalledTimes(1);
  expect(onLeave).not.toHaveBeenCalled();
  rerender(
    <Lobby room={{ ...room, leaveRequests: ["m_arsenal"] }} myId="m_arsenal" iAmHost={false} onStart={() => {}} onLeave={onLeave} onRequestLeave={onRequestLeave} onCancelLeave={onCancelLeave} />,
  );
  expect(screen.getByText(/waiting for the host to let you leave/i)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /^stay$/i }));
  expect(onCancelLeave).toHaveBeenCalledTimes(1);
});

test("the host sees each leave request and can let the guest go or keep them", async () => {
  const onResolveLeave = vi.fn();
  render(<Lobby room={{ ...room, leaveRequests: ["m_arsenal"] }} myId="m_host" iAmHost onStart={() => {}} onResolveLeave={onResolveLeave} />);
  expect(screen.getByText(/wants to leave/i)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /let go/i }));
  expect(onResolveLeave).toHaveBeenCalledWith("m_arsenal", true);
});

test("the guest is told when the host keeps them in", () => {
  const props = { myId: "m_arsenal", iAmHost: false, onStart: () => {}, onRequestLeave: () => {} };
  const { rerender } = render(<Lobby room={{ ...room, leaveRequests: ["m_arsenal"] }} {...props} />);
  rerender(<Lobby room={{ ...room, leaveRequests: [] }} {...props} />);
  expect(screen.getByText(/host asked you to stay/i)).toBeTruthy();
});
