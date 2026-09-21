import type { LogEntry, Manager, Player } from "@fcdn/shared";
import { money } from "../lib/format.js";

type Mgrs = Record<string, Pick<Manager, "displayName"> & Partial<Manager>>;
type Plrs = Record<string, Pick<Player, "name"> & Partial<Player>>;

function line(e: LogEntry, players: Plrs, managers: Mgrs): { icon: string; tone: string; text: React.ReactNode } {
  const mgr = (id: string) => managers[id]?.displayName ?? id;
  const plr = (id: string) => players[id]?.name ?? id;
  switch (e.t) {
    case "listing":
      return { icon: e.kind === "release-listing" ? "↩" : "＋", tone: "info",
        text: <>{mgr(e.managerId)} listed <b>{plr(e.playerId)}</b> at <span className="money">{money(e.price)}</span></> };
    case "bid":
      return { icon: "▲", tone: "live",
        text: <>{mgr(e.managerId)} bid <span className="money">{money(e.amount)}</span></> };
    case "win":
      return { icon: "★", tone: "win",
        text: <><b>{mgr(e.managerId)}</b> won <b>{plr(e.playerId)}</b> for <span className="money">{money(e.price)}</span></> };
    case "release":
      return { icon: "↩", tone: "info",
        text: <>{mgr(e.managerId)} released <b>{plr(e.playerId)}</b> → <span className="money">{money(e.toValue)}</span></> };
    case "void":
      return { icon: "✕", tone: "alert",
        text: <>{mgr(e.managerId)}’s deal voided — {e.reason}</> };
    case "fine":
      return { icon: "⚠", tone: "alert",
        text: <>{mgr(e.managerId)} fined <span className="money">{money(e.amount)}</span></> };
  }
}

export function DraftLog({
  log,
  players,
  managers,
}: {
  log: LogEntry[];
  players: Plrs;
  managers: Mgrs;
}) {
  const rows = [...log].reverse(); // newest first
  return (
    <div className="draft-log">
      {rows.length === 0 && <div className="muted" style={{ fontSize: 13 }}>The board is quiet… for now.</div>}
      {rows.map((e, i) => {
        const { icon, tone, text } = line(e, players, managers);
        return (
          <div key={rows.length - i} className={`log-row tone-${tone} rise`}>
            <span className="log-icon">{icon}</span>
            <span className="log-text">{text}</span>
          </div>
        );
      })}
    </div>
  );
}
