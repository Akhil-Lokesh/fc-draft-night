import type { RoomState } from "@fcdn/shared";
import { money } from "../lib/format.js";

/** Contests where a player I own is the target and someone else is currently on top. */
export function threatsFor(room: RoomState, myId: string) {
  return Object.values(room.contests).filter((c) => {
    if (c.status !== "war" && c.status !== "listing") return false;
    const player = room.players[c.playerId];
    if (!player || player.ownerId !== myId) return false;
    const top = c.quotes.at(-1);
    return !!top && top.managerId !== myId;
  });
}

export function ChallengeAlert({
  room,
  myId,
  onDefend,
}: {
  room: RoomState;
  myId: string;
  onDefend: (contestId: string, amount: number) => void;
}) {
  const threats = threatsFor(room, myId);
  if (threats.length === 0) return null;

  return (
    <div className="challenge-alert" role="alert">
      {threats.map((c) => {
        const player = room.players[c.playerId]!;
        const top = c.quotes.at(-1)!;
        return (
          <div key={c.id} className="alert-row">
            <div className="alert-body">
              <span className="alert-flash">⚡ Under threat</span>
              <div className="alert-text">
                Your player <b>{player.name}</b> is being challenged at{" "}
                <span className="money">{money(top.amount)}</span>
              </div>
            </div>
            <button
              className="btn btn-alert btn-sm"
              onClick={() => onDefend(c.id, top.amount + 1)}
            >
              Defend
            </button>
          </div>
        );
      })}
    </div>
  );
}
