import { test, expect } from "vitest";
import { recapHighlights, spendByManager, playerTrail, teamContests, mostContested } from "../domain/analytics.js";
import type { RoomState, LogEntry } from "../domain/types.js";

const log: LogEntry[] = [
  { t: "listing", at: 0, managerId: "m_ars", playerId: "wirtz", price: 60, kind: "pool-listing" },
  { t: "bid", at: 10, contestId: "c1", managerId: "m_city", amount: 181 },
  { t: "bid", at: 20, contestId: "c1", managerId: "m_bay", amount: 220 },
  { t: "win", at: 30, contestId: "c1", managerId: "m_bay", playerId: "haaland", price: 220 },
  { t: "win", at: 40, contestId: "c2", managerId: "m_ars", playerId: "wirtz", price: 60 },
];
const players = { wirtz: { originalValue: 60, listedValue: 60 }, haaland: { originalValue: 180, listedValue: 220 } };

test("spendByManager sums win prices per buyer", () => {
  const s = { log, players } as unknown as RoomState;
  expect(spendByManager(s)).toMatchObject({ m_bay: 220, m_ars: 60 });
});

test("recapHighlights surfaces most spent + biggest overpay above original value", () => {
  const s = { log, players } as unknown as RoomState;
  const h = recapHighlights(s);
  expect(h.mostSpent.managerId).toBe("m_bay");
  if (!h.biggestOverpay) throw new Error("expected a biggestOverpay entry");
  expect(h.biggestOverpay.playerId).toBe("haaland"); // paid 220 vs original 180 = +40
});

test("playerTrail returns every quote for one player's contest, in order", () => {
  const s = { log, players } as unknown as RoomState;
  expect(playerTrail(s, "c1").map(b => b.amount)).toEqual([181, 220]);
});

test("mostContested ranks players by number of distinct bidders", () => {
  const s = { log, players } as unknown as RoomState;
  const top = mostContested(s)[0];
  if (!top) throw new Error("expected at least one contested contest");
  expect(top.contestId).toBe("c1");
});
