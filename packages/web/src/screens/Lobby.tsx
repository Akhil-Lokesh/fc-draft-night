import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RoomState } from "@fcdn/shared";
import { Brand, Flap, Money, Section } from "../ui/primitives.js";
import { TeamList } from "../board/TeamList.js";
import { VoiceControl } from "../board/Voice.js";

export function Lobby({
  room,
  myId,
  iAmHost,
  onStart,
  poolBuilder,
  onLeave,
  onRequestLeave,
  onCancelLeave,
  onResolveLeave,
}: {
  room: RoomState;
  myId: string | null;
  iAmHost: boolean;
  onStart: () => void;
  poolBuilder?: ReactNode;
  /** Host only: walk away from this room back to the home screen. Guests must ask instead. */
  onLeave?: () => void;
  /** Guest: ask the host's permission to leave. */
  onRequestLeave?: () => void;
  /** Guest: take back an unanswered leave request. */
  onCancelLeave?: () => void;
  /** Host: let a guest go, or keep them in. */
  onResolveLeave?: (managerId: string, allow: boolean) => void;
}) {
  const managers = Object.values(room.managers);
  const poolCount = Object.values(room.players).filter((p) => p.ownerId === null).length;
  const empties = Math.max(0, room.capacity - managers.length);
  const [copied, setCopied] = useState(false);
  const requests = (room.leaveRequests ?? []).filter((id) => room.managers[id]);
  const asked = !!myId && requests.includes(myId);

  // My request vanished while I'm still here: the host said no. Say so, briefly.
  const [declined, setDeclined] = useState(false);
  const wasAsked = useRef(false);
  useEffect(() => {
    if (wasAsked.current && !asked && myId && room.managers[myId]) setDeclined(true);
    wasAsked.current = asked;
  }, [asked, myId, room.managers]);
  useEffect(() => {
    if (!declined) return;
    const id = setTimeout(() => setDeclined(false), 5000);
    return () => clearTimeout(id);
  }, [declined]);

  const share = async () => {
    const url = `${location.origin}${location.pathname}?room=${room.code}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* no clipboard */ }
  };

  return (
    <div className="page page-lobby">
      <header className="page-head rise">
        {iAmHost
          ? onLeave && <button className="btn btn-text" onClick={onLeave}>← Leave room</button>
          : asked
            ? (
              <p className="leave-wait" role="status">
                <span className="live-dot" aria-hidden="true" />
                Waiting for the host to let you leave…
                <button className="btn btn-text" onClick={onCancelLeave}>Stay</button>
              </p>
            )
            : onRequestLeave && (
              <button className="btn btn-text" onClick={() => { setDeclined(false); onRequestLeave(); }}>← Leave room</button>
            )}
        {declined && !asked && <p className="leave-no" role="status">The host asked you to stay.</p>}
        {myId && room.managers[myId] && <div className="lobby-voice"><VoiceControl code={room.code} myId={myId} /></div>}
        <p className="kicker">The tunnel · Season {room.seasonNumber}</p>
        {room.testMode && <p className="test-chip" role="status">Test room</p>}
        <Brand size="md" />
      </header>

      <div className="lobby-grid">
        <div className="lobby-main">
          <section className="ticket rise" aria-label="Room code">
            <div className="ticket-left">
              <span className="label">Room code</span>
              <Flap size="xl">{room.code}</Flap>
              <button className="btn btn-text" onClick={share}>{copied ? "Link copied ✓" : "Copy invite link"}</button>
            </div>
            <dl className="ticket-terms">
              <div><dt>Budget</dt><dd><Money n={room.totalBudget} /></dd></div>
              <div><dt>Quote timer</dt><dd>{Math.round(room.quoteTimerMs / 60000)} min</dd></div>
              <div><dt>Squad cap</dt><dd>{room.squadSizeCap ?? "None"}</dd></div>
              <div><dt>Pool</dt><dd>{poolCount}</dd></div>
            </dl>
          </section>

          <Section title="Managers" aside={<span className="count">{managers.length}/{room.capacity}</span>} className="rise">
            <TeamList players={room.players} managers={room.managers} myId={myId} showSpendable />
            {empties > 0 && (
              <ul className="teams">
                {Array.from({ length: empties }, (_, i) => (
                  <li key={i} className="team team-empty"><span className="team-row">Waiting for a manager…</span></li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="lobby-side">
          {iAmHost && requests.length > 0 && (
            <div className="leave-asks rise" role="alert">
              {requests.map((id) => (
                <div key={id} className="leave-ask">
                  <p><b>{room.managers[id]!.displayName}</b> wants to leave the room.</p>
                  <div className="leave-ask-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => onResolveLeave?.(id, false)}>Keep</button>
                    <button className="btn btn-hot btn-sm" onClick={() => onResolveLeave?.(id, true)}>Let go</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {iAmHost ? (
            <>
              {poolBuilder}
              <div className="kickoff rise">
                <p className="hint">{poolCount} pool player{poolCount === 1 ? "" : "s"} · {managers.length} manager{managers.length === 1 ? "" : "s"} in</p>
                {room.testMode && empties > 0 && (
                  <p className="hint">Test room: the {empties} empty seat{empties === 1 ? "" : "s"} become practice managers you can switch between.</p>
                )}
                {/* The server refuses to start an ordinary room with empty seats; mirror that so the host sees why.
                    A test room starts as it is. */}
                <button className="btn btn-flare btn-lg btn-block" onClick={onStart} disabled={empties > 0 && !room.testMode}>
                  {room.testMode
                    ? "Start test draft"
                    : empties > 0 ? `Waiting for ${empties} more manager${empties === 1 ? "" : "s"}` : "Start the draft"}
                </button>
              </div>
            </>
          ) : (
            <div className="waiting rise">
              <span className="live-dot" aria-hidden="true" />
              <p>Waiting for the host to start the draft…</p>
              <p className="hint">Tap any manager to scout their squad in the meantime.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
