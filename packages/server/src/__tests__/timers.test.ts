import { test, expect } from "vitest";
import { Ticker } from "../timers.js";
import { Queue } from "../queue.js";
import { Db } from "../db.js";
import { RoomStore } from "../rooms.js";
import { FakeClock } from "../clock.js";
import type { RoomState } from "@fcdn/shared";

function roomWithDueWar(): RoomState {
  return {
    code: "AB", totalBudget: 600, quoteTimerMs: 300_000, draftClockMs: 3_600_000, squadSizeCap: null,
    capacity: 5, seasonNumber: 1, status: "live", startedAt: 0,
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
  const store = new RoomStore(q, new Db(":memory:"), []);
  const clock = new FakeClock(0);
  q.setState("AB", roomWithDueWar());
  const ticker = new Ticker(store, clock, () => {});
  clock.set(10 + 300_000);
  await ticker.tickOnce("AB");
  expect(q.getState("AB")!.players["haaland"]!.ownerId).toBe("city");
});

/**
 * Bug 2 (HIGH — data loss): Ticker must route tick-driven state changes through RoomStore
 * (which persists via Db.save internally), not directly against a raw Queue. Otherwise a
 * timer-driven contest close (like this war resolution) only ever exists in memory, and a
 * crash/restart before the next CLIENT-initiated command silently resurrects the pre-tick
 * (stale) snapshot from disk, undoing a deal clients already saw as final.
 */
test("a tick that resolves a contest persists the post-tick state to the underlying Db", async () => {
  const q = new Queue<RoomState>();
  const db = new Db(":memory:");
  const store = new RoomStore(q, db, []);
  const clock = new FakeClock(0);
  q.setState("AB", roomWithDueWar());
  const ticker = new Ticker(store, clock, () => {});
  clock.set(10 + 300_000);
  await ticker.tickOnce("AB");

  // In-memory queue state reflects the resolved war (already covered above), but the real
  // guarantee under test is that the SAME resolution is durably persisted: reading back from
  // the Db (simulating a crash + reload) must show the post-tick state, not the pre-tick one.
  const persisted = db.loadAll().find(s => s.code === "AB");
  expect(persisted).toBeTruthy();
  expect(persisted!.players["haaland"]!.ownerId).toBe("city");
});
