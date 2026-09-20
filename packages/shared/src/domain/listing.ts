import type { RoomState, Contest } from "./types.js";
import { LISTING_MS } from "./types.js";

/**
 * Open a listing on a player you either don't own (pool claim) or do own (release).
 * NOT for challenging a rival's owned player — that's openChallenge (next task).
 */
export function openListing(
  s: RoomState, a: { managerId: string; playerId: string; now: number },
): { state: RoomState; contestId: string } {
  const player = s.players[a.playerId];
  if (!player) throw new Error(`unknown player ${a.playerId}`);
  const isOwner = player.ownerId === a.managerId;
  const type = isOwner ? "release-listing" : "pool-listing";
  const price = player.listedValue;
  const id = `c${s.seq + 1}`;
  const contest: Contest = {
    id, playerId: a.playerId, type, status: "listing",
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
      log: [...s.log, { t: "listing", at: a.now, managerId: a.managerId, playerId: a.playerId, price, kind: type }],
    },
    contestId: id,
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
