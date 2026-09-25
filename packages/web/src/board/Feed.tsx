import type { ReactNode } from "react";
import type { LogEntry, Manager, Player } from "@fcdn/shared";
import { clubLabel, useClubNames } from "../lib/clubs.js";
import { money } from "../lib/format.js";
import { Money } from "../ui/primitives.js";

type Mgrs = Record<string, Pick<Manager, "displayName"> & Partial<Manager>>;
type Plrs = Record<string, Pick<Player, "name"> & Partial<Player>>;

export interface FeedLine { key: string; icon: string; tone: "info" | "live" | "win" | "alert" | "quiet"; text: ReactNode; plain: string }

/** One log entry as a sentence. The team leads ("Manchester City (Loki) won …"): on draft night
 *  the club matters more than whoever is holding the phone. */
export function describe(e: LogEntry, i: number, players: Plrs, managers: Mgrs, names: Record<string, string>): FeedLine {
  const mgr = (id: string) => {
    const m = managers[id];
    if (!m) return id;
    return m.clubId ? `${clubLabel(m.clubId, names)} (${m.displayName})` : m.displayName;
  };
  const plr = (id: string) => players[id]?.name ?? id;
  const key = `${i}-${e.t}`;
  switch (e.t) {
    case "listing":
      return { key, icon: e.kind === "release-listing" ? "↩" : "+", tone: "info",
        plain: `${mgr(e.managerId)} listed ${plr(e.playerId)} at ${money(e.price)}`,
        text: <>{mgr(e.managerId)} listed <b>{plr(e.playerId)}</b> at <Money n={e.price} /></> };
    case "bid":
      return { key, icon: "▲", tone: "live",
        plain: `${mgr(e.managerId)} bid ${money(e.amount)}`,
        text: <>{mgr(e.managerId)} bid <Money n={e.amount} /></> };
    case "win":
      return { key, icon: "★", tone: "win",
        plain: `${mgr(e.managerId)} won ${plr(e.playerId)} for ${money(e.price)}`,
        text: <><b>{mgr(e.managerId)}</b> won <b>{plr(e.playerId)}</b> for <Money n={e.price} /></> };
    case "unsold":
      return { key, icon: "·", tone: "quiet",
        plain: `${mgr(e.managerId)}'s listing for ${plr(e.playerId)} drew no bids — stays with them, now locked`,
        text: <>No bids for <b>{plr(e.playerId)}</b> — stays with {mgr(e.managerId)}, now locked</> };
    case "release":
      return { key, icon: "↩", tone: "info",
        plain: `${mgr(e.managerId)} released ${plr(e.playerId)}`,
        text: <>{mgr(e.managerId)} released <b>{plr(e.playerId)}</b> → <Money n={e.toValue} /></> };
    case "void":
      return { key, icon: "✕", tone: "alert",
        plain: `${mgr(e.managerId)}'s deal voided: ${e.reason}`,
        text: <>{mgr(e.managerId)}’s deal voided: {e.reason}</> };
    case "fine":
      return { key, icon: "!", tone: "alert",
        plain: `${mgr(e.managerId)} fined ${money(e.amount)}`,
        text: <>{mgr(e.managerId)} fined <Money n={e.amount} /></> };
  }
}

export function Feed({ log, players, managers }: { log: LogEntry[]; players: Plrs; managers: Mgrs }) {
  const names = useClubNames();
  const lines = log.map((e, i) => describe(e, i, players, managers, names)).reverse(); // newest first
  return (
    <ol className="feed">
      {lines.length === 0 && <li className="empty">The board is quiet… for now.</li>}
      {lines.map((l) => (
        <li key={l.key} className={`feed-row tone-${l.tone}`}>
          <span className="feed-icon" aria-hidden="true">{l.icon}</span>
          <span className="feed-text">{l.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** Deadline-day ticker: the latest headline moves (wins, fines, voids, listings) on loop. */
export function Ticker({ log, players, managers }: { log: LogEntry[]; players: Plrs; managers: Mgrs }) {
  const names = useClubNames();
  const headlines = log
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.t !== "bid")
    .slice(-8)
    .reverse()
    .map(({ e, i }) => describe(e, i, players, managers, names));
  const items = headlines.length ? headlines.map((h) => h.plain) : ["Transfer window is open", "Every war resets its clock on each bid"];
  return (
    <div className="ticker" aria-hidden="true">
      <span className="ticker-badge">Breaking</span>
      <div className="ticker-track">
        <div className="ticker-run">
          {[...items, ...items].map((t, k) => <span key={k} className="ticker-item">{t}</span>)}
        </div>
      </div>
    </div>
  );
}
