import type { RoomState, Contest } from "./types.js";
import { canAfford } from "./budget.js";

export class BidError extends Error {}

/** Challenge a player currently owned by someone else. Opens directly as a live war — no 2-minute listing phase. */
export function openChallenge(
  s: RoomState, a: { managerId: string; playerId: string; amount: number; now: number },
): { state: RoomState; contestId: string } {
  const player = s.players[a.playerId];
  if (!player) throw new Error(`unknown player ${a.playerId}`);
  const manager = s.managers[a.managerId];
  if (!manager) throw new Error(`unknown manager ${a.managerId}`);
  if (player.lockedThisSeason) throw new BidError("player locked this season");
  if (a.amount <= player.listedValue) throw new BidError("bid must exceed current listed value");
  if (!canAfford(manager, player, a.amount)) throw new BidError("cannot afford");
  const id = `c${s.seq + 1}`;
  const contest: Contest = {
    id, playerId: a.playerId, type: "war", status: "war",
    listerId: null,
    quotes: [{ managerId: a.managerId, amount: a.amount, at: a.now }],
    quoteCounts: { [a.managerId]: 1 }, // the opening challenge DOES spend a quote (unlike a pool/release listing)
    closesAt: a.now + s.quoteTimerMs,
  };
  return {
    state: {
      ...s, seq: s.seq + 1,
      contests: { ...s.contests, [id]: contest },
      log: [...s.log, { t: "bid", at: a.now, contestId: id, managerId: a.managerId, amount: a.amount }],
    },
    contestId: id,
  };
}

export function placeBid(
  s: RoomState, a: { contestId: string; managerId: string; amount: number; now: number },
): RoomState {
  const c = s.contests[a.contestId];
  if (!c || c.status === "closed" || c.status === "voided") throw new BidError("contest not open");
  const player = s.players[c.playerId];
  if (!player) throw new Error(`unknown player ${c.playerId}`);
  const manager = s.managers[a.managerId];
  if (!manager) throw new Error(`unknown manager ${a.managerId}`);

  const used = c.quoteCounts[a.managerId] ?? 0;
  if (used >= 2) throw new BidError("quote cap reached");
  if (a.amount <= player.listedValue) throw new BidError("bid must exceed current listed value");
  if (!canAfford(manager, player, a.amount)) throw new BidError("cannot afford");
  const top = c.quotes.at(-1);
  if (top && a.amount <= top.amount) throw new BidError("bid must exceed current top bid");

  const next: Contest = {
    ...c,
    status: "war",
    quotes: [...c.quotes, { managerId: a.managerId, amount: a.amount, at: a.now }],
    quoteCounts: { ...c.quoteCounts, [a.managerId]: used + 1 },
    closesAt: a.now + s.quoteTimerMs, // anti-snipe: reset off every new quote
  };
  return {
    ...s,
    contests: { ...s.contests, [c.id]: next },
    log: [...s.log, { t: "bid", at: a.now, contestId: c.id, managerId: a.managerId, amount: a.amount }],
  };
}
