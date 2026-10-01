import { REQUOTE_MS, type Contest, type LogEntry, type Manager, type Player, type RoomState } from "@fcdn/shared";

export const QUOTE_CAP = 2;
export const CHALLENGE_CAP = 3;

export const isOpen = (c: Contest) => c.status === "war" || c.status === "listing";

export const byValueDesc = (a: Player, b: Player) => b.listedValue - a.listedValue;

export function squadOf(players: Record<string, Player>, managerId: string): Player[] {
  return Object.values(players).filter((p) => p.ownerId === managerId).sort(byValueDesc);
}

export interface Leader { displayName: string; clubId: string }

/** Whoever holds the top quote, as a displayable team — null for an untouched listing. */
export function leaderOf(c: Contest, managers: Record<string, Manager>): Leader | null {
  const top = c.quotes.at(-1);
  const m = top ? managers[top.managerId] : undefined;
  return m ? { displayName: m.displayName, clubId: m.clubId } : null;
}

/** One team in a war face-off. */
export interface WarSide { managerId: string; displayName: string; clubId: string; leading: boolean; you: boolean }

/** The two teams a war is between, as left/right: me on the left whenever I'm in it, my opponent
 *  on the right. Watching someone else's war, the defending owner is left, the challenger right.
 *  The "opponent" is whoever currently leads if that isn't me, otherwise the latest other bidder
 *  (or the owner, if nobody else has quoted since). Null for listings or an unknown player. */
export function warSides(c: Contest, room: { players: Record<string, { ownerId: string | null }>; managers: Record<string, Manager> }, myId: string): { left: WarSide; right: WarSide } | null {
  if (c.status !== "war") return null;
  const owner = room.players[c.playerId]?.ownerId ?? null;
  const top = c.quotes.at(-1)?.managerId ?? owner;
  const inIt = myId === owner || c.quotes.some((q) => q.managerId === myId);
  const leftId = inIt ? myId : owner;
  if (!leftId) return null;
  const latestOther = [...c.quotes].reverse().find((q) => q.managerId !== leftId)?.managerId;
  const rightId = top && top !== leftId ? top : latestOther ?? (owner !== leftId ? owner : null);
  if (!rightId) return null;
  const side = (id: string): WarSide | null => {
    const m = room.managers[id];
    return m ? { managerId: id, displayName: m.displayName, clubId: m.clubId, leading: id === top, you: id === myId } : null;
  };
  const left = side(leftId), right = side(rightId);
  return left && right ? { left, right } : null;
}

/** Open contests on a player I own where somebody else is currently on top. */
export function threatsFor(room: RoomState, myId: string): Contest[] {
  return Object.values(room.contests).filter((c) => {
    if (!isOpen(c)) return false;
    const player = room.players[c.playerId];
    if (!player || player.ownerId !== myId) return false;
    const top = c.quotes.at(-1);
    return !!top && top.managerId !== myId;
  });
}

export type WinEntry = Extract<LogEntry, { t: "win" }>;
export const isWin = (e: LogEntry): e is WinEntry => e.t === "win";

export interface ListedPlayer { id: string; name: string; price: number; closesAt: number; contested: boolean }

/** Players I currently have up for release — still technically mine (ownerId unchanged) until
 *  the contest closes, but pulled out of Starting/Acquired into their own band so releasing a
 *  player visibly does something instead of leaving the row looking untouched. Covers both the
 *  plain 2-minute listing AND the case where a rival bids on it (escalating it into a war): if
 *  we stopped tracking it the moment it became a war, the row would fall straight back into a
 *  plain, still-clickable "release" row in Starting while a real contest is running on it — and
 *  a second release tap there would open a SECOND, independently-resolving contest on the same
 *  player (see the matching `hasOpenContest` guard added server-side in the same fix). */
export function myOpenListings(room: RoomState, myId: string): ListedPlayer[] {
  return Object.values(room.contests)
    .filter((c) => c.type === "release-listing" && isOpen(c) && c.listerId === myId)
    .map((c) => ({
      id: c.playerId,
      name: room.players[c.playerId]?.name ?? c.playerId,
      price: c.quotes.at(-1)?.amount ?? room.players[c.playerId]?.listedValue ?? 0,
      closesAt: c.closesAt,
      contested: c.status === "war",
    }));
}

/** A player who left my squad for a rival during the draft. */
export interface LostPlayer { id: string; name: string; price: number; buyerId: string; position: string; shirtNumber?: number }

/** Every player a rival took off me this draft — by buying one I released OR by winning a
 *  challenge war on one I never offered. Found by replaying ownership through the log from the
 *  seeded squads: a win that moves a player from me to someone else is a loss; a player I later
 *  win back drops off the list again. */
export function lostPlayers(room: RoomState, myId: string): LostPlayer[] {
  const clubOwner = new Map(Object.values(room.managers).map((m) => [m.clubId, m.id]));
  const owner = new Map<string, string | null>();
  const ownerOf = (id: string) => {
    if (owner.has(id)) return owner.get(id)!;
    const home = room.players[id]?.homeClub;
    return home ? clubOwner.get(home) ?? null : null;
  };
  const lost = new Map<string, LostPlayer>();
  for (const e of room.log) {
    if (e.t === "release") { owner.set(e.playerId, null); continue; }
    if (e.t !== "win") continue;
    const from = ownerOf(e.playerId);
    owner.set(e.playerId, e.managerId);
    if (e.managerId === myId) { lost.delete(e.playerId); continue; }
    if (from !== myId) continue;
    const p = room.players[e.playerId];
    lost.set(e.playerId, {
      id: e.playerId, name: p?.name ?? e.playerId, price: e.price, buyerId: e.managerId,
      position: p?.positionDetail ?? p?.position ?? "", shirtNumber: p?.shirtNumber,
    });
  }
  return [...lost.values()].filter((l) => room.players[l.id]?.ownerId !== myId);
}

/** My squad split four ways:
 *  - listed: currently up for release, awaiting the listing's outcome (see myOpenListings)
 *  - starting: players whose real home club is my club (never changes once seeded)
 *  - acquired: players I own who came from anywhere else during the draft
 *  - sold: players a rival took off me, whether bought off a release or won in a challenge war
 *    (see lostPlayers). A release nobody else bid on reverts to me, so it is not a sale. */
export function splitMySquad(room: RoomState, myId: string) {
  const me = room.managers[myId];
  const listed = myOpenListings(room, myId);
  const listedIds = new Set(listed.map((p) => p.id));
  const mine = squadOf(room.players, myId).filter((p) => !listedIds.has(p.id));
  const starting = mine.filter((p) => p.homeClub === me?.clubId);
  const acquired = mine.filter((p) => p.homeClub !== me?.clubId);
  const sold = lostPlayers(room, myId);
  return { listed, starting, acquired, sold };
}

/** The window a contest runs over, for the draining countdown bar. Listings run the fixed 2-minute
 *  window. A war's opening bid (the challenge, or the first bid on a listing after its seed quote) gets
 *  the full quote timer; every reply after it resets to 2 minutes (never longer than the quote timer). */
export function windowFor(c: Contest, quoteTimerMs: number, listingMs: number): number {
  if (c.status === "listing") return listingMs;
  const openingQuotes = c.type === "war" ? 1 : 2;
  return c.quotes.length <= openingQuotes ? quoteTimerMs : Math.min(quoteTimerMs, REQUOTE_MS);
}

/** On the block, a page holds this many lots; older lots come first, so newer ones spill onto page 2+. */
export const BLOCK_PAGE_SIZE = 9;

/** The block's filters: every live lot, the ones I've shortlisted, wars on my own players that rivals are
 *  bidding on, and lots I've quoted in myself. */
export type BlockFilter = "all" | "shortlist" | "defending" | "mine";

export function blockMatches(
  c: Contest, room: Pick<RoomState, "players">, myId: string, shortlist: ReadonlySet<string>, filter: BlockFilter,
): boolean {
  switch (filter) {
    case "all": return true;
    case "shortlist": return shortlist.has(c.id);
    case "defending": return room.players[c.playerId]?.ownerId === myId && c.quotes.some((q) => q.managerId !== myId);
    case "mine": return c.quotes.some((q) => q.managerId === myId);
  }
}
