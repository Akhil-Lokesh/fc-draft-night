import type { RoomState } from "@fcdn/shared";
import { ContestCard } from "../components/ContestCard.js";
import { PoolList } from "../components/PoolList.js";
import { BudgetBars } from "../components/BudgetBars.js";
import { ChallengeTracker } from "../components/ChallengeTracker.js";
import { DraftLog } from "../components/DraftLog.js";
import { ChallengeAlert } from "../components/ChallengeAlert.js";
import { money, mmss } from "../lib/format.js";
import { clubLabel } from "../lib/clubs.js";

export interface BoardActions {
  bid: (contestId: string, amount: number) => void;
  openListing: (playerId: string) => void;
  challenge: (playerId: string, amount: number) => void;
}

export function DraftBoard({
  room,
  myId,
  now,
  actions,
}: {
  room: RoomState;
  myId: string;
  now: number;
  actions: BoardActions;
}) {
  const openContests = Object.values(room.contests).filter(
    (c) => c.status === "war" || c.status === "listing",
  );
  const me = room.managers[myId];
  const myPlayers = Object.values(room.players).filter((p) => p.ownerId === myId);
  const clockLeft = (room.startedAt ?? 0) + room.draftClockMs - now;

  return (
    <div className="app-shell board">
      <header className="board-head">
        <div>
          <div className="eyebrow">Season {room.seasonNumber} · Draft live</div>
          <div className="brand" aria-hidden="true">
            <span className="fc" style={{ fontSize: 26, padding: "0 6px" }}>FC</span>
            <span className="brand-word" style={{ fontSize: 26 }}>Draft Night</span>
          </div>
        </div>
        <div className="board-clock">
          <span className="pill pill-live">live</span>
          <span className={`timer ${clockLeft <= 60_000 ? "urgent" : ""}`}>{mmss(clockLeft)}</span>
        </div>
      </header>

      <ChallengeAlert room={room} myId={myId} onDefend={actions.bid} />

      {me && (
        <div className="me-strip">
          <span className="club-chip" style={{ fontSize: 13 }}>{clubLabel(me.clubId)}</span>
          <span className="muted mono" style={{ fontSize: 12 }}>spendable</span>
          <span className="money" style={{ fontSize: 20, marginLeft: "auto" }}>{money(me.spendable)}</span>
        </div>
      )}

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-title" style={{ marginBottom: 10 }}>Budgets</div>
        <BudgetBars managers={room.managers} totalBudget={room.totalBudget} myId={myId} />
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-head">
          <span className="panel-title">Live contests</span>
          <span className="mono muted" style={{ fontSize: 12 }}>{openContests.length}</span>
        </div>
        {openContests.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No live contests. Start one from the pool below.</div>
        ) : (
          <div className="contest-grid">
            {openContests.map((c) => {
              const player = room.players[c.playerId];
              if (!player) return null;
              return (
                <ContestCard
                  key={c.id}
                  contest={c}
                  player={player}
                  now={now}
                  myId={myId}
                  myQuotesUsed={c.quoteCounts[myId] ?? 0}
                  onBid={actions.bid}
                />
              );
            })}
          </div>
        )}
      </section>

      {myPlayers.length > 0 && (
        <section className="panel" style={{ marginTop: 12 }}>
          <div className="panel-title" style={{ marginBottom: 10 }}>Your squad — release to bank listed value</div>
          <div className="squad-strip">
            {myPlayers.map((p) => (
              <button
                key={p.id}
                className="btn btn-ghost btn-sm squad-chip"
                disabled={p.lockedThisSeason}
                onClick={() => actions.openListing(p.id)}
                title="Release back to the pool at listed value"
              >
                <span>{p.name}</span>
                <span className="money">{money(p.listedValue)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-title" style={{ marginBottom: 10 }}>Players &amp; pool</div>
        <PoolList players={room.players} myId={myId} onList={actions.openListing} onChallenge={actions.challenge} />
      </section>

      <div className="board-columns">
        <section className="panel">
          <div className="panel-title" style={{ marginBottom: 10 }}>Your challenges</div>
          <ChallengeTracker challenges={room.challenges} myId={myId} managers={room.managers} />
        </section>
        <section className="panel">
          <div className="panel-title" style={{ marginBottom: 10 }}>Draft feed</div>
          <DraftLog log={room.log} players={room.players} managers={room.managers} />
        </section>
      </div>
    </div>
  );
}
