import type { RoomState, LogEntry } from "./types.js";

export function spendByManager(s: RoomState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of s.log) if (e.t === "win") out[e.managerId] = (out[e.managerId] ?? 0) + e.price;
  return out;
}

export function playerTrail(s: RoomState, contestId: string): { managerId: string; amount: number; at: number }[] {
  return s.log.filter((e): e is Extract<LogEntry, { t: "bid" }> => e.t === "bid" && e.contestId === contestId)
    .map(e => ({ managerId: e.managerId, amount: e.amount, at: e.at }));
}

export function teamContests(s: RoomState, managerId: string) {
  const started = s.log.filter(e => e.t === "listing" && e.managerId === managerId);
  const won = s.log.filter(e => e.t === "win" && e.managerId === managerId);
  const joined = new Set(
    s.log
      .filter((e): e is Extract<LogEntry, { t: "bid" }> => e.t === "bid" && e.managerId === managerId)
      .map(e => e.contestId)
  );
  return { started, won, joined: [...joined] };
}

export function mostContested(s: RoomState): { contestId: string; bidders: number }[] {
  const byContest = new Map<string, Set<string>>();
  for (const e of s.log) {
    if (e.t === "bid") {
      const set = byContest.get(e.contestId) ?? new Set<string>();
      set.add(e.managerId);
      byContest.set(e.contestId, set);
    }
  }
  return [...byContest.entries()]
    .map(([contestId, set]) => ({ contestId, bidders: set.size }))
    .sort((a, b) => b.bidders - a.bidders);
}

export function recapHighlights(s: RoomState) {
  const spend = spendByManager(s);
  const mostSpentEntry = Object.entries(spend).sort((a, b) => b[1] - a[1])[0];
  const mostSpent = { managerId: mostSpentEntry?.[0] ?? "", amount: mostSpentEntry?.[1] ?? 0 };

  const wins = s.log.filter((e): e is Extract<LogEntry, { t: "win" }> => e.t === "win");
  const withDelta = wins.map(w => ({
    ...w,
    delta: w.price - (s.players[w.playerId]?.originalValue ?? w.price),
  }));
  const biggestOverpay = [...withDelta].sort((a, b) => b.delta - a.delta)[0];
  const bestBargain = [...withDelta].sort((a, b) => a.delta - b.delta)[0];

  return { mostSpent, biggestOverpay, bestBargain };
}
