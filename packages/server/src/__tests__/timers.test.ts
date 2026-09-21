import { test, expect } from "vitest";
import { Ticker } from "../timers.js";
import { Queue } from "../queue.js";
import { FakeClock } from "../clock.js";
import type { RoomState } from "@fcdn/shared";

function roomWithDueWar(): RoomState {
  return {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs: 3_600_000, squadSizeCap: null,
    seasonNumber: 1, status: "live", startedAt: 0,
    managers: { city: { id: "city", displayName: "City", clubId: "city", reserved: 0, spendable: 300 } },
    players: { haaland: { id: "haaland", name: "Haaland", position: "FWD", listedValue: 180, originalValue: 180, ownerId: null, lockedThisSeason: false, homeClub: null } },
    contests: {
      c1: { id: "c1", playerId: "haaland", type: "war", status: "war", listerId: null,
            quotes: [{ managerId: "city", amount: 181, at: 10 }], quoteCounts: { city: 1 }, closesAt: 10 + 300_000 },
    },
    challenges: {}, log: [], seq: 1,
  };
}

test("a tick resolves a war whose anti-snipe window has elapsed", async () => {
  const q = new Queue<RoomState>();
  const clock = new FakeClock(0);
  q.setState("AB", roomWithDueWar());
  const ticker = new Ticker(q, clock, () => {});
  clock.set(10 + 300_000);
  await ticker.tickOnce("AB");
  expect(q.getState("AB")!.players["haaland"]!.ownerId).toBe("city");
});
