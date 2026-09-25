import { useState } from "react";
import type { Manager, Player } from "@fcdn/shared";
import type { ListedPlayer, LostPlayer } from "../lib/board.js";
import { useClubLabel } from "../lib/clubs.js";
import { mmss } from "../lib/format.js";
import { Money, Pos } from "../ui/primitives.js";
import { PlayerCard } from "./PlayerCard.js";

/** Kept for callers that still name it; the same shape lostPlayers produces. */
export type SoldPlayer = LostPlayer;

/** My squad in four bands, top to bottom: currently listed (awaiting a buyer), sold this draft,
 *  the squad I started with, and who I've acquired. Releasing an unlocked player takes two taps,
 *  same as claiming/challenging in the market: the first opens a scouting card (rating, position,
 *  specialty) so you know exactly who you're about to put up; the second, explicit "Release"
 *  button actually lists him. A stray tap never gives a player away, and you're never confirming
 *  blind. */
export function MySquad({
  listed,
  sold,
  starting,
  acquired,
  managers,
  now,
  onRelease,
}: {
  listed: ListedPlayer[];
  sold: SoldPlayer[];
  starting: Player[];
  acquired: Player[];
  managers: Record<string, Manager>;
  /** Current time, for the "closes in" countdown on a listed player. */
  now: number;
  onRelease: (playerId: string) => void;
}) {
  const clubLabel = useClubLabel();
  const [openId, setOpenId] = useState<string | null>(null);
  const close = () => setOpenId(null);

  const card = (p: Player) => {
    const open = openId === p.id;
    return (
      <li key={p.id} className={`sq-item ${open ? "is-open" : ""} ${p.lockedThisSeason ? "is-locked" : ""}`}>
        <button
          type="button"
          className="sq"
          disabled={p.lockedThisSeason}
          aria-expanded={open}
          onClick={() => setOpenId(open ? null : p.id)}
          title={p.lockedThisSeason ? "Locked for the season" : undefined}
        >
          <span className="sq-name">{p.shirtNumber ? <i>{p.shirtNumber}</i> : null}{p.name}</span>
          {p.lockedThisSeason && <span className="sq-lock" aria-label="locked">🔒</span>}
          <Pos>{p.positionDetail ?? p.position}</Pos>
          <Money n={p.listedValue} />
        </button>

        {/* First tap only opens this scouting card — same pattern as the market's claim/challenge
         *  cards — so releasing a player is never a blind confirm on a bare row. */}
        {open && (
          <div className="scout">
            <PlayerCard player={p}>
              <div className="scout-actions">
                <button className="btn btn-ghost" onClick={close}>Cancel</button>
                <button className="btn btn-hot" onClick={() => { onRelease(p.id); close(); }}>
                  Release · <Money n={p.listedValue} />
                </button>
              </div>
            </PlayerCard>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="mysquad">
      {listed.length > 0 && (
        <div className="band band-listed">
          <h3 className="band-title">Listed — awaiting a buyer</h3>
          <ul className="sq-list">
            {listed.map((p) => (
              <li key={p.id} className={`sq sq-listed ${p.contested ? "is-contested" : ""}`}>
                <span className="sq-name">{p.name}</span>
                <span className="sq-to">
                  {p.contested ? "bidding war — " : "closes in "}
                  {mmss(Math.max(0, p.closesAt - now))}
                </span>
                <Money n={p.price} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {sold.length > 0 && (
        <div className="band band-sold">
          <h3 className="band-title">Taken by rivals</h3>
          <ul className="sq-list">
            {sold.map((s) => {
              const buyer = managers[s.buyerId];
              return (
                <li key={s.id} className="sq sq-sold">
                  {/* name keeps the full width; who took him sits underneath, so neither gets cut */}
                  <span className="sq-stack">
                    <span className="sq-name">{s.shirtNumber ? <i>{s.shirtNumber}</i> : null}{s.name}</span>
                    <span className="sq-to">→ {buyer ? clubLabel(buyer.clubId) : s.buyerId}</span>
                  </span>
                  {s.position && <Pos>{s.position}</Pos>}
                  <Money n={s.price} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="band">
        <h3 className="band-title">Starting squad</h3>
        {starting.length === 0 ? <p className="empty">Nobody left from your original squad.</p> : <ul className="sq-list">{starting.map(card)}</ul>}
      </div>

      {acquired.length > 0 && (
        <div className="band band-acquired">
          <h3 className="band-title">Acquired this draft</h3>
          <ul className="sq-list">{acquired.map(card)}</ul>
        </div>
      )}
    </div>
  );
}
