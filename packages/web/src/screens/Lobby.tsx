import type { RoomState } from "@fcdn/shared";
import type { ReactNode } from "react";
import { clubClass, clubLabel } from "../lib/clubs.js";
import { money } from "../lib/format.js";

export function Lobby({
  room,
  myId,
  iAmHost,
  onStart,
  poolBuilder,
}: {
  room: RoomState;
  myId: string | null;
  iAmHost: boolean;
  onStart: () => void;
  poolBuilder?: ReactNode;
}) {
  const managers = Object.values(room.managers);
  const poolCount = Object.values(room.players).filter((p) => p.ownerId === null).length;

  return (
    <div className="app-shell">
      <header style={{ paddingTop: 30, marginBottom: 16 }} className="rise">
        <div className="eyebrow">Lobby · Season {room.seasonNumber}</div>
        <div className="brand" aria-hidden="true" style={{ marginTop: 10 }}>
          <span className="fc" style={{ fontSize: 30 }}>FC</span>
          <span className="brand-word" style={{ fontSize: 30 }}>Draft Night</span>
        </div>
      </header>

      <div className="panel share-panel rise" style={{ marginBottom: 14 }}>
        <div className="panel-title">Room code</div>
        <div className="room-code mono">{room.code}</div>
        <div className="mono muted" style={{ fontSize: 13, marginTop: 6 }}>
          Budget <span className="money">{money(room.totalBudget)}</span> · quote timer {Math.round(room.quoteTimerMs / 60000)}m
          {room.squadSizeCap ? ` · cap ${room.squadSizeCap}` : ""}
        </div>
      </div>

      <div className="panel rise" style={{ marginBottom: 14, animationDelay: "0.05s" }}>
        <div className="panel-head">
          <span className="panel-title">Managers</span>
          <span className="mono muted" style={{ fontSize: 12 }}>{managers.length}/5</span>
        </div>
        <div className="lobby">
          {managers.map((m) => (
            <div key={m.id} className={`lobby-row club-chip ${clubClass(m.clubId)}`}>
              <span className="lobby-name">{m.displayName}{m.id === myId ? " (you)" : ""}</span>
              <span className="muted" style={{ fontSize: 12 }}>{clubLabel(m.clubId)}</span>
              <span className="money" style={{ marginLeft: 10, fontSize: 12 }}>{money(m.spendable)}</span>
            </div>
          ))}
        </div>
      </div>

      {iAmHost ? (
        <>
          {poolBuilder}
          <div className="panel rise" style={{ marginTop: 14 }}>
            <div className="mono muted" style={{ fontSize: 12, marginBottom: 10 }}>
              {poolCount} pool player{poolCount === 1 ? "" : "s"} added · {managers.length} manager{managers.length === 1 ? "" : "s"} in
            </div>
            <button className="btn btn-primary btn-block" onClick={onStart}>
              Start the draft
            </button>
          </div>
        </>
      ) : (
        <div className="panel rise" style={{ textAlign: "center", padding: "22px 16px" }}>
          <div className="pill pill-live" style={{ marginBottom: 10 }}>waiting</div>
          <p className="muted" style={{ margin: 0 }}>Waiting for the host to start the draft…</p>
        </div>
      )}
    </div>
  );
}
