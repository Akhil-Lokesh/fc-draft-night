import type { RoomState, Contest } from "./types.js";

/** Contests that must resolve at `now`, sorted by the order they close. */
export function dueContests(s: RoomState, now: number): Contest[] {
  const draftOver = s.startedAt != null && now >= s.startedAt + s.draftClockMs;
  return Object.values(s.contests)
    .filter(c => c.status === "listing" || c.status === "war")
    .filter(c => draftOver || now >= c.closesAt)
    .sort((a, b) => a.closesAt - b.closesAt || a.id.localeCompare(b.id));
}
