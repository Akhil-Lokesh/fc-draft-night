import { useState, type CSSProperties } from "react";
import type { Contest, Player } from "@fcdn/shared";
import { mmss, money, positionLabel } from "../lib/format.js";
import { QUOTE_CAP, type Leader, type WarSide } from "../lib/board.js";
import { clubShort, useClubColor, useClubLabel, useClubNames } from "../lib/clubs.js";
import { Crest, Flap, Pos, useClubVars } from "../ui/primitives.js";

const URGENT_MS = 30_000;
const STEPS = [1, 5, 10];

export function LotCard({
  contest,
  player,
  now,
  myId,
  myQuotesUsed,
  onBid,
  onForfeit,
  leader,
  windowMs,
  lotNo,
  sides,
}: {
  contest: Contest;
  player: Player;
  now: number;
  myId: string;
  myQuotesUsed: number;
  onBid: (contestId: string, amount: number) => void;
  /** Owner conceding ends the war; anyone else just drops out. */
  onForfeit?: (contestId: string) => void;
  /** Current top bidder's team, front and centre. Absent on an untouched listing. */
  leader?: Leader | null;
  /** Full length of this contest's window, for the draining bar. */
  windowMs?: number;
  lotNo?: number;
  /** A war's two teams — me on the left when I'm in it — each drawn in their team colour. */
  sides?: { left: WarSide; right: WarSide } | null;
}) {
  const label = useClubLabel();
  const clubVars = useClubVars();
  const colorOf = useClubColor();
  const names = useClubNames();
  const short = (id: string) => clubShort(id, names);
  const top = contest.quotes.at(-1);
  const topBid = top?.amount ?? player.listedValue;
  // What the box offers until you touch it: one above the top bid (it follows the top if someone outbids).
  const suggested = topBid + 1;
  // The box holds exactly what was typed — clamping it on every keystroke made typing a price impossible.
  // The server's only rule is "more than the top bid", so any number above it, decimals included, is fine.
  const [draft, setDraft] = useState<string | null>(null);
  const typed = draft ?? String(suggested);
  const amount = typed.trim() === "" ? NaN : Number(typed);
  const amountOk = Number.isFinite(amount) && amount > topBid;

  const remaining = contest.closesAt - now;
  const urgent = remaining <= URGENT_MS;
  const isListing = contest.status === "listing";
  const drain = windowMs ? Math.max(0, Math.min(1, remaining / windowMs)) : null;

  const capped = myQuotesUsed >= QUOTE_CAP;
  const locked = player.lockedThisSeason && player.ownerId !== myId;
  const disabled = capped || locked;
  const isOwner = player.ownerId === myId;
  const iLead = top?.managerId === myId;
  // Only the defending owner or someone who has already quoted is "in" the war — a capped-out
  // challenger has nothing left to give up.
  const canForfeit = !isListing && (isOwner || myQuotesUsed > 0) && !(capped && !isOwner);

  const sideVars = sides
    ? ({
        "--l": colorOf(sides.left.clubId).color, "--l-ink": colorOf(sides.left.clubId).ink,
        "--r": colorOf(sides.right.clubId).color, "--r-ink": colorOf(sides.right.clubId).ink,
      } as CSSProperties)
    : undefined;

  return (
    <article
      className={`lot ${urgent ? "is-urgent" : ""} ${iLead ? "is-mine" : ""} ${isListing ? "is-listing" : "is-war"} ${sides ? "has-sides" : ""}`}
      style={{ ...(leader ? clubVars(leader.clubId) : {}), ...sideVars }}
    >
      <header className="lot-head">
        <span className="lot-no">{lotNo ? `Lot ${String(lotNo).padStart(2, "0")}` : "Lot"}</span>
        <span className={`lot-kind ${isListing ? "" : "is-war"}`}>{isListing ? "Listing" : "War"}</span>
        <Flap size="sm" tone={urgent ? "hot" : undefined} label="time left">{mmss(remaining)}</Flap>
      </header>
      {drain !== null && <div className="lot-drain" aria-hidden="true"><i style={{ transform: `scaleX(${drain})` }} /></div>}

      {sides && (
        <div className="lot-vs" aria-label={`${label(sides.left.clubId)} versus ${label(sides.right.clubId)}`}>
          {(["left", "right"] as const).map((k) => {
            const sd = sides[k];
            return (
              <div key={k} className={`vs-side vs-${k} ${sd.leading ? "is-leading" : ""}`}>
                <Crest clubId={sd.clubId} size={22} />
                <span className="vs-team">
                  {/* short code: two full club names never fit side by side on a lot card */}
                  <span className="vs-club" title={label(sd.clubId)}>{short(sd.clubId)}</span>
                  <span className="vs-mgr">{sd.you ? "You" : sd.displayName}{sd.leading ? " · leading" : ""}</span>
                </span>
              </div>
            );
          })}
          <span className="vs-mark" aria-hidden="true">VS</span>
        </div>
      )}

      <div className="lot-player">
        <h3 className="lot-name">
          {player.shirtNumber ? <span className="lot-shirt">{player.shirtNumber}</span> : null}
          {player.name}
        </h3>
        <div className="lot-meta">
          <Pos>{positionLabel(player)}</Pos>
          {player.tags?.slice(0, 2).map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
      </div>

      <div className="lot-price">
        <Flap size="lg" tone={iLead ? "win" : undefined}>{money(topBid)}</Flap>
        {leader ? (
          <div className="lot-leader">
            <span className="lot-leader-label">Leading</span>
            <span className="lot-leader-team">
              <Crest clubId={leader.clubId} size={18} />
              {label(leader.clubId)} <span className="lot-leader-mgr">({leader.displayName})</span>
            </span>
          </div>
        ) : (
          <div className="lot-leader"><span className="lot-leader-label">Open listing · no bids yet</span></div>
        )}
      </div>

      <div className="lot-bid">
        <label className="bid-caption" htmlFor={`bid-${contest.id}`}>Your price · tap to type any amount, or use a step</label>
        <div className="steps">
          {STEPS.map((s) => (
            <button key={s} type="button" className="step" disabled={disabled} onClick={() => setDraft(String(topBid + s))}>+{s}</button>
          ))}
          <input
            id={`bid-${contest.id}`}
            className="input input-bid"
            type="number"
            inputMode="decimal"
            step="any"
            aria-label="raise amount"
            value={typed}
            disabled={disabled}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        {!disabled && !amountOk && <p className="bid-hint" role="status">Must be above {money(topBid)}</p>}
        <button className="btn btn-flare btn-block" disabled={disabled || !amountOk} onClick={() => { onBid(contest.id, amount); setDraft(null); }}>
          {isListing ? "Bid" : "Raise"} · {amountOk ? money(amount) : "enter a price"}
        </button>
      </div>

      <footer className="lot-foot">
        <span className="quota" aria-label={`${myQuotesUsed} of ${QUOTE_CAP} quotes used`}>
          {Array.from({ length: QUOTE_CAP }, (_, i) => <i key={i} className={i < myQuotesUsed ? "used" : ""} />)}
          <span>{capped ? "You've used both your quotes here." : locked ? "Locked for the season." : `${QUOTE_CAP - myQuotesUsed} quote${QUOTE_CAP - myQuotesUsed === 1 ? "" : "s"} left`}</span>
        </span>
        {canForfeit && onForfeit && (
          <button
            className="btn btn-text btn-danger"
            onClick={() => onForfeit(contest.id)}
            title={isOwner ? "Concede: the current top bidder wins immediately" : "Drop out of this war"}
          >
            Give up
          </button>
        )}
      </footer>
    </article>
  );
}
