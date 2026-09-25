import type { ReactNode } from "react";
import type { Player } from "@fcdn/shared";
import { useClubLabel } from "../lib/clubs.js";
import { money } from "../lib/format.js";
import { Crest, useClubVars } from "../ui/primitives.js";

type Tier = "gold" | "silver" | "bronze" | "unlisted";

/** FUT-style colour tier. A hand-entered player (not in the FC26 database) gets its own look so
 *  it's never mistaken for real game data. */
function tierOf(p: Player): Tier {
  if (p.id.startsWith("custom-")) return "unlisted";
  const ovr = p.overall ?? 0;
  if (ovr >= 75) return "gold";
  if (ovr >= 65) return "silver";
  return "bronze";
}

/** Rows forced through the manual-stats path carry an "(unlisted)" suffix so they can't collide
 *  with a real namesake; the card shows the plain name and says it with a badge instead. */
const displayName = (name: string) => name.replace(/\s*\(unlisted(?: \d+)?\)\s*$/i, "");

/** The scouting card a pool/rival/own player opens into: the collectible card on the left, the
 *  facts that decide a bid plus the caller's actions on the right — one compact block, so the
 *  buttons always sit right next to the player they act on. */
export function PlayerCard({
  player: p,
  flags,
  children,
}: {
  player: Player;
  /** Short status notes, e.g. "On the block". */
  flags?: string[];
  children?: ReactNode;
}) {
  const clubLabel = useClubLabel();
  const clubVars = useClubVars();
  const tier = tierOf(p);
  const clubId = p.homeClub ?? "";
  const name = displayName(p.name);
  const primary = p.positionDetail ?? p.position;
  const alts = p.altPositions ?? [];
  const tags = p.tags ?? [];
  const valueMoved = p.listedValue !== p.originalValue;

  return (
    <div className="pc-wrap">
      <div className="pc-shadow">
        <div className={`pc pc-${tier}`} style={clubId ? clubVars(clubId) : undefined}>
          <div className="pc-rating">
            <span className="pc-ovr">{p.overall ?? "–"}</span>
            <span className="pc-pos">{primary}</span>
          </div>
          <div className="pc-emblem">{clubId && <span className="pc-medal"><Crest clubId={clubId} size={32} /></span>}</div>
          <div className="pc-name">{name}</div>
        </div>
      </div>

      <div className="pc-info">
        <div className="pc-club">
          {clubId && <Crest clubId={clubId} size={16} />}
          <span>{clubId ? clubLabel(clubId) : "Free agent"}</span>
        </div>

        <div className="pc-stats">
          <div className="pc-stat">
            <span className="pc-stat-k">Value</span>
            <span className="pc-stat-v">€{money(p.listedValue)}</span>
            {valueMoved && <span className="pc-stat-s">was €{money(p.originalValue)}</span>}
          </div>
          <div className="pc-stat">
            <span className="pc-stat-k">Position</span>
            <span className="pc-stat-v">{primary}</span>
            {alts.length > 0 && <span className="pc-stat-s">{alts.join(" · ")}</span>}
          </div>
          {p.shirtNumber != null && (
            <div className="pc-stat">
              <span className="pc-stat-k">Shirt</span>
              <span className="pc-stat-v">#{p.shirtNumber}</span>
            </div>
          )}
        </div>

        {tags.length > 0 && (
          <div className="scout-tags">
            {tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
        )}

        {(tier === "unlisted" || (flags && flags.length > 0)) && (
          <div className="pc-flags">
            {tier === "unlisted" && <span className="pc-flag pc-flag-unlisted">Not in FC26 · manual stats</span>}
            {flags?.map((f) => <span key={f} className="pc-flag">{f}</span>)}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
