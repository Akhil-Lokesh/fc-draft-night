import type { RoomState, Contest } from "./types.js";
import { LISTING_MS, hasOpenContest } from "./types.js";

/**
 * Claim a pool player, or release one of your own. A pool claim opens a 2-minute public listing
 * any manager can jump in on. Releasing your OWN player is instant instead — no listing window,
 * no chance for a rival to snipe it — he goes straight back to the pool at his current listed
 * value and you get the reserved amount back immediately (see `releaseOwnPlayer`).
 * NOT for challenging a rival's owned player — that's openChallenge (next task).
 */
export function openListing(
  s: RoomState, a: { managerId: string; playerId: string; now: number },
): { state: RoomState; contestId: string | null } {
  const player = s.players[a.playerId];
  if (!player) throw new Error(`unknown player ${a.playerId}`);
  if (player.ownerId && player.ownerId !== a.managerId) {
    throw new Error("cannot list a player owned by another manager — use openChallenge instead");
  }
  // Without this, a second listing (or a challenge landing mid-flight) on a player who's
  // already got an open contest would create two independent contests racing to resolve the
  // same player's ownership — e.g. two rapid release-taps before the first one's broadcast back.
  if (hasOpenContest(s, a.playerId)) throw new Error("player already has an open contest");

  if (player.ownerId === a.managerId) return { state: releaseOwnPlayer(s, a), contestId: null };

  const price = player.listedValue;
  const id = `c${s.seq + 1}`;
  const contest: Contest = {
    id, playerId: a.playerId, type: "pool-listing", status: "listing",
    listerId: a.managerId,
    quotes: [{ managerId: a.managerId, amount: price, at: a.now }],
    // The listing's own seed quote does NOT count toward quoteCounts / the 2-quote cap —
    // intentional: the lister's listing action doesn't spend their quote budget.
    quoteCounts: {},
    closesAt: a.now + LISTING_MS,
  };
  return {
    state: {
      ...s, seq: s.seq + 1,
      contests: { ...s.contests, [id]: contest },
      log: [...s.log, { t: "listing", at: a.now, managerId: a.managerId, playerId: a.playerId, price, kind: "pool-listing" }],
    },
    contestId: id,
  };
}

/** Instant release: the player goes straight back to the pool at his current listed value, and
 *  the manager reclaims that value from reserved into spendable right away — no public listing,
 *  no window for a rival to grab him first. */
function releaseOwnPlayer(s: RoomState, a: { managerId: string; playerId: string; now: number }): RoomState {
  const player = s.players[a.playerId]!;
  const manager = s.managers[a.managerId];
  if (!manager) throw new Error(`unknown manager ${a.managerId}`);
  return {
    ...s,
    managers: {
      ...s.managers,
      [a.managerId]: { ...manager, reserved: manager.reserved - player.listedValue, spendable: manager.spendable + player.listedValue },
    },
    players: { ...s.players, [a.playerId]: { ...player, ownerId: null } },
    log: [...s.log, { t: "release", at: a.now, managerId: a.managerId, playerId: a.playerId, toValue: player.listedValue }],
  };
}

export function resolveListing(s: RoomState, a: { contestId: string; now: number }): RoomState {
  const c = s.contests[a.contestId];
  if (!c) throw new Error(`unknown contest ${a.contestId}`);
  if (c.status !== "listing") return s;
  const player = s.players[c.playerId];
  if (!player) throw new Error(`unknown player ${c.playerId}`);
  const listerId = c.listerId;
  if (!listerId) throw new Error(`listing contest ${c.id} missing listerId`);

  const managers = { ...s.managers };
  const players = { ...s.players };
  const log = [...s.log];

  if (c.type === "pool-listing") {
    const m = managers[listerId];
    if (!m) throw new Error(`unknown manager ${listerId}`);
    managers[listerId] = { ...m, spendable: m.spendable - player.listedValue };
    players[c.playerId] = { ...player, ownerId: listerId, lockedThisSeason: true };
    log.push({ t: "win", at: a.now, contestId: c.id, managerId: listerId, playerId: c.playerId, price: player.listedValue });
  } else {
    // release-listing: player goes back to pool at his listed value, owner reclaims reserved
    const ownerId = player.ownerId;
    if (!ownerId) throw new Error(`release-listing ${c.id} has unowned player ${c.playerId}`);
    const owner = managers[ownerId];
    if (!owner) throw new Error(`unknown manager ${ownerId}`);
    managers[ownerId] = { ...owner, reserved: owner.reserved - player.listedValue, spendable: owner.spendable + player.listedValue };
    players[c.playerId] = { ...player, ownerId: null };
    log.push({ t: "release", at: a.now, managerId: ownerId, playerId: c.playerId, toValue: player.listedValue });
  }

  return { ...s, managers, players, contests: { ...s.contests, [c.id]: { ...c, status: "closed" } }, log };
}
