import { useMemo, useState, type ReactNode } from "react";
import type { Manager, Player } from "@fcdn/shared";
import { money } from "../lib/format.js";
import { byValueDesc } from "../lib/board.js";
import { clubLabel, useClubNames } from "../lib/clubs.js";
import { ClubTag, Money, Pos } from "../ui/primitives.js";
import { PlayerCard } from "./PlayerCard.js";

type Kind = "pool" | "mine" | "rival";
const LINES = ["All", "GK", "DEF", "MID", "FWD"] as const;

/** Manager ids are `m_<clubId>` — recover the club when we have no managers map. */
const clubOfOwner = (ownerId: string) => ownerId.replace(/^m_/, "");

export function Market({
  players,
  myId,
  managers,
  onList,
  onChallenge,
  inAuction,
}: {
  players: Record<string, Player>;
  myId: string;
  managers?: Record<string, Manager>;
  onList: (playerId: string) => void;
  onChallenge: (playerId: string, amount: number) => void;
  /** Player ids currently in a live contest — flagged on their row. */
  inAuction?: Set<string>;
}) {
  const names = useClubNames();
  const [query, setQuery] = useState("");
  const [line, setLine] = useState<(typeof LINES)[number]>("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  /** Which list is showing: "pool", "mine", or a rival's manager id. */
  const [tab, setTab] = useState("pool");

  const { pool, mine, rivals } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = Object.values(players).filter(
      (p) => (!q || p.name.toLowerCase().includes(q)) && (line === "All" || p.position === line),
    );
    // Every rival gets a group, even one who currently owns nobody, so all teams stay reachable.
    const byOwner = new Map<string, Player[]>(
      Object.keys(managers ?? {}).filter((id) => id !== myId).map((id) => [id, []]),
    );
    for (const p of shown) {
      if (p.ownerId === null || p.ownerId === myId) continue;
      (byOwner.get(p.ownerId) ?? byOwner.set(p.ownerId, []).get(p.ownerId)!).push(p);
    }
    const rivals = [...byOwner.entries()]
      .map(([ownerId, list]) => {
        const m = managers?.[ownerId];
        const clubId = m?.clubId ?? clubOfOwner(ownerId);
        return { ownerId, clubId, name: m?.displayName ?? clubLabel(clubId, names), players: list.sort(byValueDesc) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      pool: shown.filter((p) => p.ownerId === null).sort(byValueDesc),
      mine: shown.filter((p) => p.ownerId === myId).sort(byValueDesc),
      rivals,
    };
  }, [players, query, line, myId, managers, names]);

  const close = () => { setOpenId(null); setAmount(""); };

  const row = (p: Player, kind: Kind) => {
    const open = openId === p.id;
    const hot = inAuction?.has(p.id);
    // A challenge must open above the player's listed value; nothing typed yet is not a bid.
    const bid = Number(amount);
    const bidOk = amount !== "" && Number.isFinite(bid) && bid > p.listedValue;
    return (
      <li key={p.id} className={`mk ${open ? "is-open" : ""} ${p.lockedThisSeason ? "is-locked" : ""}`}>
        <button
          type="button"
          className="mk-row"
          disabled={kind === "mine" || p.lockedThisSeason}
          aria-expanded={kind === "mine" ? undefined : open}
          onClick={() => { setAmount(""); setOpenId(open ? null : p.id); }}
        >
          <span className="mk-name">{p.shirtNumber ? <i>{p.shirtNumber}</i> : null}{p.name}</span>
          {/* Alternates can be dropped on narrow phones (the scouting card still lists them) so the name keeps its room. */}
          <Pos>
            {p.positionDetail ?? p.position}
            {p.positionDetail && p.altPositions?.length ? <span className="pos-alt"> · {p.altPositions.join("/")}</span> : null}
          </Pos>
          {hot && <span className="mk-flag">on the block</span>}
          {p.lockedThisSeason && <span className="mk-flag mk-flag-lock">locked</span>}
          <Money n={p.listedValue} className="mk-val" />
        </button>

        {/* The first tap only opens this scouting card. Claiming or challenging takes a second,
         *  explicit tap, so a mis-tap never starts a bidding war. */}
        {open && kind !== "mine" && (
          <div className="scout">
            <PlayerCard player={p} flags={hot ? ["On the block"] : undefined}>
            {kind === "rival" && (
              <label className="scout-amount">
                <span className="label">Your opening bid (above {money(p.listedValue)})</span>
                <input
                  className="input input-bid"
                  type="number"
                  aria-label="bid amount"
                  placeholder={`> ${money(p.listedValue)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {amount !== "" && !bidOk && <span className="hint">Must be above {money(p.listedValue)}</span>}
              </label>
            )}
            <div className="scout-actions">
              <button className="btn btn-ghost" onClick={close}>Cancel</button>
              {kind === "pool" ? (
                <button className="btn btn-flare" onClick={() => { onList(p.id); close(); }}>Claim</button>
              ) : (
                <button
                  className="btn btn-hot"
                  disabled={!bidOk}
                  onClick={() => { onChallenge(p.id, Number(amount)); close(); }}
                >
                  Challenge
                </button>
              )}
            </div>
            </PlayerCard>
          </div>
        )}
      </li>
    );
  };

  const tabs: { key: string; label: ReactNode; list: Player[]; kind: Kind }[] = [
    { key: "pool", label: "Pool", list: pool, kind: "pool" },
    { key: "mine", label: "Your squad", list: mine, kind: "mine" },
    ...rivals.map((g) => ({
      key: g.ownerId,
      label: <ClubTag clubId={g.clubId} name={g.name} showClub={false} />,
      list: g.players,
      kind: "rival" as const,
    })),
  ];
  // A rival who left takes their tab with them; fall back to the pool rather than a blank list.
  const active = tabs.find((t) => t.key === tab) ?? tabs[0]!;

  const empty = active.list.length === 0;

  return (
    <div className="market">
      <div className="market-tools">
        <input className="input input-search" type="search" placeholder="Search players…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips" role="group" aria-label="Filter by line">
          {LINES.map((l) => (
            <button key={l} type="button" className={`chip ${line === l ? "is-on" : ""}`} aria-pressed={line === l} onClick={() => setLine(l)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="mk-tabs" role="tablist" aria-label="Whose players">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === active.key}
            className={`mk-tab ${t.key === active.key ? "is-on" : ""}`}
            onClick={() => { close(); setTab(t.key); }}
          >
            <span className="mk-tab-label">{t.label}</span>
            <span className="count">{t.list.length}</span>
          </button>
        ))}
      </div>

      <div className="mk-group" role="tabpanel">
        <ul className="mk-list">{active.list.map((p) => row(p, active.kind))}</ul>
        {empty && <p className="empty">{query.trim() || line !== "All" ? "No players match." : "No players here."}</p>}
      </div>
    </div>
  );
}
