import type { RoomState, LogEntry } from "./types.js";
import { openListing } from "./listing.js";
import { placeBid, openChallenge } from "./war.js";
import { resolveDue } from "./resolution.js";
import { canChallenge, recordChallenge } from "./challenge.js";

export type Command =
  | { type: "StartDraft"; now: number }
  | { type: "OpenListing"; managerId: string; playerId: string; now: number }
  | { type: "Challenge"; managerId: string; playerId: string; amount: number; now: number }
  | { type: "PlaceBid"; contestId: string; managerId: string; amount: number; now: number }
  | { type: "Tick"; now: number };

export function applyCommand(s: RoomState, cmd: Command): { state: RoomState; events: LogEntry[] } {
  const before = s.log.length;
  let state = s;
  switch (cmd.type) {
    case "StartDraft":
      state = { ...s, status: "live", startedAt: cmd.now };
      break;
    case "OpenListing": {
      // Pool claim or own-player release only. A rival-owned player must use "Challenge" instead.
      const player = s.players[cmd.playerId];
      if (!player) throw new Error(`unknown player ${cmd.playerId}`);
      if (player.ownerId && player.ownerId !== cmd.managerId) {
        throw new Error("player is owned by another manager — use the Challenge command");
      }
      state = openListing(state, cmd).state;
      break;
    }
    case "Challenge": {
      const player = s.players[cmd.playerId];
      if (!player) throw new Error(`unknown player ${cmd.playerId}`);
      if (!player.ownerId || player.ownerId === cmd.managerId) {
        throw new Error("Challenge is only for a rival's owned player — use OpenListing for pool/own players");
      }
      if (!canChallenge(s, cmd.managerId, player.ownerId)) throw new Error("challenge limit reached");
      state = recordChallenge(s, cmd.managerId, player.ownerId);
      state = openChallenge(state, cmd).state;
      break;
    }
    case "PlaceBid":
      state = placeBid(s, cmd);
      break;
    case "Tick":
      state = resolveDue(s, cmd.now);
      break;
  }
  return { state, events: state.log.slice(before) };
}
