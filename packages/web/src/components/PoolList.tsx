import { useMemo, useState } from "react";
import type { Player } from "@fcdn/shared";
import { money } from "../lib/format.js";
import { clubClass, clubLabel } from "../lib/clubs.js";

/** Manager ids are deterministic `m_<clubId>` — recover the club from an owner id for its tag/colour. */
function clubOfOwner(ownerId: string | null): string | null {
  return ownerId ? ownerId.replace(/^m_/, "") : null;
}

export function PoolList({
  players,
  myId,
  onList,
  onChallenge,
}: {
  players: Record<string, Player>;
  myId: string;
  onList: (playerId: string) => void;
  onChallenge: (playerId: string, amount: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(players)
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => b.listedValue - a.listedValue);
  }, [players, query]);

  const submitChallenge = (p: Player) => {
    const n = Number(amount);
    if (Number.isFinite(n) && n > 0) onChallenge(p.id, n);
    setOpenId(null);
    setAmount("");
  };

  return (
    <div className="pool">
      <input
        className="input pool-search"
        placeholder="Search players…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="pool-list">
        {list.map((p) => {
          const mine = p.ownerId === myId;
          const unowned = p.ownerId === null;
          const rivalClub = clubOfOwner(p.ownerId);
          const open = openId === p.id;

          return (
            <div key={p.id} className={`pool-item ${p.lockedThisSeason ? "is-locked" : ""}`}>
              <button
                type="button"
                className="pool-row"
                disabled={mine || p.lockedThisSeason}
                onClick={() => (unowned ? onList(p.id) : setOpenId(open ? null : p.id))}
              >
                <span className="pool-name">{p.name}</span>
                <span className="pill pill-pos">{p.position}</span>
                <span className="pool-tag">
                  {unowned ? (
                    <span className="pill pill-pool">pool</span>
                  ) : mine ? (
                    <span className="pill">yours</span>
                  ) : (
                    <span className={`club-chip ${clubClass(rivalClub ?? "")}`} style={{ fontSize: 11 }}>
                      {clubLabel(rivalClub ?? "")}
                    </span>
                  )}
                </span>
                <span className="pool-value money">{money(p.listedValue)}</span>
              </button>

              {open && !unowned && !mine && (
                <div className="pool-challenge">
                  <input
                    className="input mono"
                    type="number"
                    aria-label="bid amount"
                    placeholder={`> ${money(p.listedValue)}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <button className="btn btn-alert btn-sm" onClick={() => submitChallenge(p)}>
                    Challenge
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && <div className="muted" style={{ padding: "12px 2px", fontSize: 13 }}>No players match.</div>}
      </div>
    </div>
  );
}
