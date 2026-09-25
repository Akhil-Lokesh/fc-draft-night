import type { RoomState, Contest } from "./types.js";

/**
 * Contests that must resolve at `now`, sorted by the order they close. A contest is due purely
 * on its OWN anti-snipe timer (`closesAt`) — the draft's overall clock (`draftClockMs`) is a
 * target end time, not a hard cutoff, so a war whose timer was just reset by a late bid still
 * gets its full window even past that mark. Otherwise a bid timed right at the deadline could
 * snipe a contest with no chance to respond.
 */
export function dueContests(s: RoomState, now: number): Contest[] {
  return Object.values(s.contests)
    .filter(c => c.status === "listing" || c.status === "war")
    .filter(c => now >= c.closesAt)
    .sort((a, b) => a.closesAt - b.closesAt || a.id.localeCompare(b.id));
}
