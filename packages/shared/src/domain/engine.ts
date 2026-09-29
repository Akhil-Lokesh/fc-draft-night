import type { RoomState, LogEntry } from "./types.js";
import { openListing } from "./listing.js";
import { placeBid, openChallenge, forfeit } from "./war.js";
import { resolveDue, endDraftNow } from "./resolution.js";
import { canChallenge, recordChallenge } from "./challenge.js";

export type Command =
  | { type: "StartDraft"; now: number }
  | { type: "OpenListing"; managerId: string; playerId: string; now: number }
  | { type: "Challenge"; managerId: string; playerId: string; amount: number; now: number }
  | { type: "PlaceBid"; contestId: string; managerId: string; amount: number; now: number }
  | { type: "Forfeit"; contestId: string; managerId: string; now: number }
  | { type: "EndDraft"; now: number }
  | { type: "Tick"; now: number };

/** Every auction command needs a running draft: not one still in its lobby, and not one already over. */
function requireLive(s: RoomState): void {
  if (s.status === "setup") throw new Error("the draft hasn't started yet");
  if (s.status === "closed") throw new Error("the draft is over");
}

export function applyCommand(s: RoomState, cmd: Command): { state: RoomState; events: LogEntry[] } {
  const before = s.log.length;
  let state = s;
  if (cmd.type !== "StartDraft" && cmd.type !== "Tick") requireLive(s);
  switch (cmd.type) {
    case "StartDraft":
      // Only a lobby starts: a second start would reset the draft clock, and a closed draft stays closed.
      if (s.status === "live") throw new Error("the draft has already started");
      if (s.status === "closed") throw new Error("the draft is over");
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
    case "Forfeit":
      state = forfeit(s, cmd);
      break;
    case "EndDraft":
      state = endDraftNow(s, cmd.now);
      break;
    case "Tick":
      state = resolveDue(s, cmd.now);
      break;
  }
  return { state, events: state.log.slice(before) };
}
