import { useState } from "react";
import type { Contest, Player } from "@fcdn/shared";
import { money, mmss } from "../lib/format.js";

const URGENT_MS = 30_000;

export function ContestCard({
  contest,
  player,
  now,
  myId,
  myQuotesUsed,
  onBid,
}: {
  contest: Contest;
  player: Player;
  now: number;
  myId: string;
  myQuotesUsed: number;
  onBid: (contestId: string, amount: number) => void;
}) {
  const top = contest.quotes.at(-1);
  const topBid = top?.amount ?? player.listedValue;
  const [raise, setRaise] = useState<number>(topBid + 1);

  const remaining = contest.closesAt - now;
  const urgent = remaining <= URGENT_MS;
  const isListing = contest.status === "listing";

  const capped = myQuotesUsed >= 2;
  const locked = player.lockedThisSeason && player.ownerId !== myId;
  const disabled = capped || locked;
  const label = isListing ? "Challenge" : "Raise";

  return (
    <div className={`card contest-card ${urgent ? "is-urgent" : ""} rise`}>
      <div className="contest-top">
        <div className="contest-player">
          <span className="contest-name">{player.name}</span>
          <span className="pill pill-pos">{player.position}</span>
        </div>
        <span className={`timer ${urgent ? "urgent" : ""}`}>{mmss(remaining)}</span>
      </div>

      <div className="contest-mid">
        <div>
          <div className="micro-label">{isListing ? "Listing" : "Top bid"}</div>
          <div className="contest-bid money">{money(topBid)}</div>
        </div>
        <span className={`pill ${isListing ? "pill-pool" : "pill-live"}`}>
          {isListing ? "listing" : "live war"}
        </span>
      </div>

      <div className="contest-actions">
        <input
          className="input mono raise-input"
          type="number"
          aria-label="raise amount"
          value={raise}
          min={topBid + 1}
          disabled={disabled}
          onChange={(e) => setRaise(Number(e.target.value))}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={disabled}
          onClick={() => onBid(contest.id, raise)}
        >
          {label}
        </button>
      </div>

      {capped && <div className="micro-note">You’ve used both your quotes here.</div>}
      {locked && <div className="micro-note">Locked for the season.</div>}
    </div>
  );
}
