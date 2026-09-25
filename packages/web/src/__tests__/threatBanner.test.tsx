import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreatBanner } from "../board/ThreatBanner.js";

const room = (topAmount: number) =>
  ({
    players: { saibari: { id: "saibari", name: "I. Saibari", ownerId: "m_psv" } },
    managers: { m_roma: { id: "m_roma", displayName: "Loki", clubId: "roma" } },
    contests: {
      c1: {
        id: "c1", playerId: "saibari", type: "challenge", status: "war", listerId: null,
        quotes: [{ managerId: "m_roma", amount: topAmount }], quoteCounts: {}, closesAt: 0,
      },
    },
  }) as any;

test("the cross hides a threat alert without defending", async () => {
  const onDefend = vi.fn();
  render(<ThreatBanner room={room(92)} myId="m_psv" onDefend={onDefend} />);
  await userEvent.click(screen.getByRole("button", { name: /dismiss alert for i\. saibari/i }));
  expect(screen.queryByText(/under threat/i)).toBeNull();
  expect(onDefend).not.toHaveBeenCalled();
});

test("a dismissed alert comes back when the rival raises again", async () => {
  const { rerender } = render(<ThreatBanner room={room(92)} myId="m_psv" onDefend={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
  rerender(<ThreatBanner room={room(95)} myId="m_psv" onDefend={() => {}} />);
  expect(screen.getByText(/under threat/i)).toBeTruthy();
});
