import { useMemo, useState } from "react";
import { LISTING_MS, managersOverBudget, type RoomState } from "@fcdn/shared";
import { BLOCK_PAGE_SIZE, blockMatches, isOpen, isWin, leaderOf, splitMySquad, threatsFor, warSides, windowFor, type BlockFilter } from "../lib/board.js";
import { useShortlist } from "../lib/shortlist.js";
import { mmss, money } from "../lib/format.js";
import { useClubLabel } from "../lib/clubs.js";
import { Brand, Crest, Flap, Section } from "../ui/primitives.js";
import { LotCard } from "../board/LotCard.js";
import { Market } from "../board/Market.js";
import { MySquad } from "../board/MySquad.js";
import { Standings } from "../board/Standings.js";
import { Feed, Ticker } from "../board/Feed.js";
import { TeamList } from "../board/TeamList.js";
import { ThreatBanner } from "../board/ThreatBanner.js";
import { VoiceControl } from "../board/Voice.js";

export interface BoardActions {
  bid: (contestId: string, amount: number) => void;
  openListing: (playerId: string) => void;
  challenge: (playerId: string, amount: number) => void;
  /** Owner giving up ends the war now; anyone else just drops out. */
  forfeit?: (contestId: string) => void;
}

type Pane = "live" | "market" | "squad" | "room";
type FeedTab = "history" | "sold" | "squads";

const BLOCK_FILTERS: { id: BlockFilter; label: string; empty: string }[] = [
  { id: "all", label: "All", empty: "No live lots." },
  { id: "shortlist", label: "Shortlist", empty: "Nothing on your shortlist. Tap ☆ on a lot to keep an eye on it." },
  { id: "defending", label: "Defending", empty: "Nobody is bidding on your players right now." },
  { id: "mine", label: "My bids", empty: "You haven't bid on any live lot." },
];

export function DraftBoard({
  room,
  myId,
  now,
  actions,
  iAmHost,
  onEndDraft,
  seatSwitcher,
}: {
  room: RoomState;
  myId: string;
  now: number;
  actions: BoardActions;
  /** Only the host can end the auction. */
  iAmHost?: boolean;
  onEndDraft?: () => void;
  /** Test rooms, host only: lets one person play every seat. `myId` is the seat being played. */
  seatSwitcher?: { onSwitch: (managerId: string) => void };
  /** Walk away from this room back to the home screen — the only way out mid-draft. */
}) {
  const label = useClubLabel();
  const [pane, setPane] = useState<Pane>("live");
  const [feedTab, setFeedTab] = useState<FeedTab>("history");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [blockFilter, setBlockFilter] = useState<BlockFilter>("all");
  const [blockPage, setBlockPage] = useState(0);
  const shortlist = useShortlist(room.code, myId);

  const me = room.managers[myId];
  // Oldest lot first, so the block reads in the order things started and new lots spill onto later pages.
  const lots = useMemo(
    () => Object.values(room.contests).filter(isOpen).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [room.contests],
  );
  const filterCount = (f: BlockFilter) => lots.filter((c) => blockMatches(c, room, myId, shortlist.ids, f)).length;
  const shown = lots.filter((c) => blockMatches(c, room, myId, shortlist.ids, blockFilter));
  const pages = Math.max(1, Math.ceil(shown.length / BLOCK_PAGE_SIZE));
  const page = Math.min(blockPage, pages - 1); // lots closing can shrink the last page away
  const pageLots = shown.slice(page * BLOCK_PAGE_SIZE, (page + 1) * BLOCK_PAGE_SIZE);
  const pickFilter = (f: BlockFilter) => { setBlockFilter(f); setBlockPage(0); };
  const inAuction = useMemo(() => new Set(lots.map((c) => c.playerId)), [lots]);
  const squad = splitMySquad(room, myId);
  const threatCount = threatsFor(room, myId).length;
  const clockLeft = (room.startedAt ?? 0) + room.draftClockMs - now;
  // Nobody is released for anyone: a manager below zero releases players themselves, and the auction
  // (clock or host button) cannot end until every balance is zero or better.
  const red = managersOverBudget(room);
  const iAmRed = !!me && me.spendable < 0;
  const overtime = clockLeft <= 0;
  const lotNo = (id: string) => Object.keys(room.contests).indexOf(id) + 1;

  const nav: { id: Pane; label: string; badge?: number; hot?: boolean }[] = [
    { id: "live", label: "Live", badge: lots.length, hot: threatCount > 0 },
    { id: "market", label: "Market" },
    { id: "squad", label: "Squad", badge: squad.listed.length + squad.starting.length + squad.acquired.length },
    { id: "room", label: "Room" },
  ];

  return (
    <div className="board" data-pane={pane}>
      <header className="bar">
        <div className="bar-brand"><Brand size="sm" /><span className="bar-season">S{room.seasonNumber} · {room.code}</span></div>
        <div className="bar-clock">
          <span className="live-dot" aria-hidden="true" />
          <span className="bar-label">Deadline</span>
          <Flap size="md" tone={clockLeft <= 60_000 ? "hot" : undefined} label="draft clock">{overtime ? "OVERTIME" : mmss(clockLeft)}</Flap>
        </div>
        {me && (
          <div className="bar-me">
            <Crest clubId={me.clubId} size={24} />
            <span className="bar-label">{label(me.clubId)}</span>
            <Flap size="md" tone={iAmRed ? "hot" : "win"} label="your spendable budget">{money(me.spendable)}</Flap>
          </div>
        )}
        <VoiceControl code={room.code} myId={myId} />
        {iAmHost && (
          <div className="bar-host">
            {confirmEnd ? (
              <>
                <button className="btn btn-hot btn-sm" disabled={red.length > 0} onClick={() => { setConfirmEnd(false); onEndDraft?.(); }}>Confirm end</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmEnd(false)}>Keep going</button>
              </>
            ) : (
              <button
                className="btn btn-ghost btn-sm btn-danger"
                aria-label="End auction"
                disabled={red.length > 0}
                title={red.length > 0 ? `Can't end while ${red.length} manager${red.length === 1 ? " is" : "s are"} over budget` : undefined}
                onClick={() => setConfirmEnd(true)}
              >
                End<span className="bar-long"> auction</span>
              </button>
            )}
          </div>
        )}
      </header>

      {room.testMode && seatSwitcher && (
        <div className="testbar">
          <span className="test-chip">Test room</span>
          <label className="testbar-pick">
            <span>Playing as</span>
            <select className="input" aria-label="Playing as" value={myId} onChange={(e) => seatSwitcher.onSwitch(e.target.value)}>
              {Object.values(room.managers)
                .sort((x, y) => label(x.clubId).localeCompare(label(y.clubId)))
                .map((m) => (
                  <option key={m.id} value={m.id}>{label(m.clubId)} · {m.displayName}{m.practice ? " (practice)" : ""}</option>
                ))}
            </select>
          </label>
        </div>
      )}

      <Ticker log={room.log} players={room.players} managers={room.managers} />
      <ThreatBanner room={room} myId={myId} onDefend={actions.bid} />
      {red.length > 0 && (
        <div className="redbar" role="status" aria-label="Over budget">
          {iAmRed && me && (
            <p><b>You're {money(-me.spendable)} over budget.</b> Release players from your squad until you're back at zero.</p>
          )}
          <p>
            The auction can't end until everyone is at zero or better{overtime ? ", even though the clock has run out" : ""}.
            Over budget: {red.map((m) => `${label(m.clubId)} (${m.displayName}) ${money(-m.spendable)}`).join(", ")}.
          </p>
        </div>
      )}

      <div className="board-grid">
        <div className="pane pane-squad" data-for="squad">
          <Section title="Your squad" aside={<span className="hint">Tap a player to scout &amp; release</span>}>
            <MySquad {...squad} managers={room.managers} now={now} onRelease={actions.openListing} inContest={inAuction} />
          </Section>
        </div>

        <div className="pane pane-live" data-for="live">
          <Section title="On the block" aside={<span className="count">{lots.length} live</span>}>
            {lots.length === 0 ? (
              <div className="quiet">
                <p>No live lots.</p>
                <p className="hint">Claim a free agent or challenge a rival from the market.</p>
                <button className="btn btn-chalk btn-sm pane-jump" onClick={() => setPane("market")}>Open the market</button>
              </div>
            ) : (
              <>
              <div className="chips block-filters" role="group" aria-label="Filter the block">
                {BLOCK_FILTERS.map((f) => (
                  <button key={f.id} type="button" className={`chip ${blockFilter === f.id ? "is-on" : ""}`} aria-pressed={blockFilter === f.id} onClick={() => pickFilter(f.id)}>
                    {f.label}<i className="chip-n">{filterCount(f.id)}</i>
                  </button>
                ))}
              </div>
              {pageLots.length === 0 ? (
                <div className="quiet"><p>{BLOCK_FILTERS.find((f) => f.id === blockFilter)!.empty}</p></div>
              ) : (
              <div className="lots">
                {pageLots.map((c) => {
                  const player = room.players[c.playerId];
                  if (!player) return null;
                  return (
                    <LotCard
                      key={c.id}
                      contest={c}
                      player={player}
                      now={now}
                      myId={myId}
                      myQuotesUsed={c.quoteCounts[myId] ?? 0}
                      onBid={actions.bid}
                      onForfeit={actions.forfeit}
                      leader={leaderOf(c, room.managers)}
                      sides={warSides(c, room, myId)}
                      windowMs={windowFor(c, room.quoteTimerMs, LISTING_MS)}
                      lotNo={lotNo(c.id)}
                      shortlisted={shortlist.ids.has(c.id)}
                      onShortlist={shortlist.toggle}
                    />
                  );
                })}
              </div>
              )}
              {pages > 1 && (
                <nav className="pager" aria-label="Block pages">
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="Previous page" disabled={page === 0} onClick={() => setBlockPage(page - 1)}>‹ Prev</button>
                  <span className="pager-at">Page {page + 1} of {pages}</span>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setBlockPage(page + 1)}>Next ›</button>
                </nav>
              )}
              </>
            )}
          </Section>
        </div>

        <div className="pane pane-market" data-for="market">
          <Section title="Transfer market">
            <Market
              players={room.players}
              myId={myId}
              managers={room.managers}
              onList={actions.openListing}
              onChallenge={actions.challenge}
              inAuction={inAuction}
            />
          </Section>
        </div>

        <div className="pane pane-room" data-for="room">
          <Section title="Table">
            <Standings managers={room.managers} totalBudget={room.totalBudget} myId={myId} challenges={room.challenges} />
          </Section>
          <section className="sheet">
            <div className="tabs" role="tablist">
              {(["history", "sold", "squads"] as FeedTab[]).map((t) => (
                <button key={t} role="tab" aria-selected={feedTab === t} className={`tab ${feedTab === t ? "is-on" : ""}`} onClick={() => setFeedTab(t)}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {feedTab === "history" && <Feed log={room.log} players={room.players} managers={room.managers} />}
            {feedTab === "sold" && <Feed log={room.log.filter(isWin)} players={room.players} managers={room.managers} />}
            {feedTab === "squads" && <TeamList players={room.players} managers={room.managers} myId={myId} />}
          </section>
        </div>
      </div>

      <nav className="dock" aria-label="Board sections">
        {nav.map((n) => (
          <button key={n.id} className={`dock-btn ${pane === n.id ? "is-on" : ""}`} aria-current={pane === n.id ? "page" : undefined} onClick={() => setPane(n.id)}>
            <span>{n.label}</span>
            {n.badge ? <i className={`dock-badge ${n.hot ? "is-hot" : ""}`}>{n.badge}</i> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
