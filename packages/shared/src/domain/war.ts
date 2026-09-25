import type { RoomState, Contest } from "./types.js";
import { hasOpenContest } from "./types.js";
import { canAfford } from "./budget.js";
import { finalizeContest } from "./resolution.js";

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
  // Same reasoning as openListing's guard: a challenge landing on a player who already has an
  // open listing/war (e.g. two managers challenging the same rival at once) must not spawn a
  // second, independently-resolving contest for the same player.
  if (hasOpenContest(s, a.playerId)) throw new BidError("player already has an open contest");
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
  if (player.lockedThisSeason && a.managerId !== player.ownerId)
    throw new BidError("player locked this season");

  const used = c.quoteCounts[a.managerId] ?? 0;
  if (used >= 2) throw new BidError("quote cap reached");
  if (a.amount <= player.listedValue) throw new BidError("bid must exceed current listed value");
  if (!canAfford(manager, player, a.amount)) throw new BidError("cannot afford");
  const top = c.quotes.at(-1);
  if (top && a.amount <= top.amount) throw new BidError("bid must exceed current top bid");

  // A genuinely new manager — never quoted in this contest before — joining after the original
  // pair has already formed (2+ distinct prior participants) is a fresh threat "out of the
  // blue": everyone else's quote count resets so they can respond, instead of being defenseless
  // just because they'd already spent quotes fighting a DIFFERENT rival. The normal
  // challenger-vs-owner pair forming (the second-ever participant) is exempt — that's not a
  // late arrival, it's the war starting.
  const priorParticipants = Object.keys(c.quoteCounts);
  const isNewEntrant = !priorParticipants.includes(a.managerId);
  const isLateArrival = isNewEntrant && priorParticipants.length >= 2;
  const quoteCounts = isLateArrival
    ? { ...Object.fromEntries(priorParticipants.map(id => [id, 0])), [a.managerId]: used + 1 }
    : { ...c.quoteCounts, [a.managerId]: used + 1 };

  const next: Contest = {
    ...c,
    status: "war",
    quotes: [...c.quotes, { managerId: a.managerId, amount: a.amount, at: a.now }],
    quoteCounts,
    closesAt: a.now + s.quoteTimerMs, // anti-snipe: reset off every new quote
  };
  return {
    ...s,
    contests: { ...s.contests, [c.id]: next },
    log: [...s.log, { t: "bid", at: a.now, contestId: c.id, managerId: a.managerId, amount: a.amount }],
  };
}

/**
 * A manager involved in a war voluntarily withdraws. The OWNER giving up ends the war right now
 * at whatever the current top bid is — there's nobody left to defend, so no reason to wait out
 * the anti-snipe clock. Anyone else giving up is simply barred from bidding again here; the war
 * carries on normally for whoever's left.
 */
export function forfeit(s: RoomState, a: { contestId: string; managerId: string; now: number }): RoomState {
  const c = s.contests[a.contestId];
  if (!c || c.status !== "war") throw new BidError("no active war to give up on");
  const player = s.players[c.playerId];
  if (!player) throw new Error(`unknown player ${c.playerId}`);
  const isOwner = player.ownerId === a.managerId;
  const hasQuoted = a.managerId in c.quoteCounts;
  if (!isOwner && !hasQuoted) throw new BidError("you are not part of this contest");

  if (isOwner) return finalizeContest(s, c.id, a.now);

  return {
    ...s,
    contests: { ...s.contests, [c.id]: { ...c, quoteCounts: { ...c.quoteCounts, [a.managerId]: 2 } } },
  };
}
