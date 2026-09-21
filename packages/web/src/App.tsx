import { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { budgetFloor, loadSeed, recapHighlights, type RoomState } from "@fcdn/shared";
import { makeStore, connect, useUi, savedManagerId, type UiStore } from "./state/socket.js";
import { Join, type JoinFields } from "./screens/Join.js";
import { Setup } from "./screens/Setup.js";
import { Lobby } from "./screens/Lobby.js";
import { DraftBoard } from "./screens/DraftBoard.js";
import { PoolBuilder } from "./components/PoolBuilder.js";
import { clubClass, clubLabel, CLUBS } from "./lib/clubs.js";
import { money } from "./lib/format.js";

const FLOOR = budgetFloor(loadSeed());
const SERVER_URL =
  (import.meta as any).env?.VITE_SERVER_URL ?? `http://${location.hostname}:8080`;

type Mode = "landing" | "host-config" | "join";

export function App({ store: injected }: { store?: UiStore } = {}) {
  const socketRef = useRef<Socket | null>(null);
  if (!injected && !socketRef.current) socketRef.current = connect(SERVER_URL);
  const store = useMemo<UiStore>(() => injected ?? makeStore(socketRef.current as any), [injected]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
    s.connect();
    return () => { s.disconnect(); };
  }, []);

  const room = useUi(store, (s) => s.room);
  const managerId = useUi(store, (s) => s.managerId);
  const createdCode = useUi(store, (s) => s.createdCode);
  const error = useUi(store, (s) => s.error);
  const catalogResults = useUi(store, (s) => s.catalogResults);
  const seasonExport = useUi(store, (s) => s.seasonExport);
  const roomPeek = useUi(store, (s) => s.roomPeek);

  // When the server sends back a season CSV, hand it to the browser as a download.
  useEffect(() => {
    if (!seasonExport) return;
    const blob = new Blob([seasonExport.csv], { type: "text/csv" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = seasonExport.filename;
    a.click();
    URL.revokeObjectURL(href);
  }, [seasonExport]);

  const urlCode = useMemo(() => new URLSearchParams(location.search).get("room") ?? "", []);
  const [mode, setMode] = useState<Mode>("landing");
  const [iAmHost, setIAmHost] = useState(false);
  const [selectedPool, setSelectedPool] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // After the host creates the room, send them to the identity step (prefilled with the code),
  // and peek it immediately so the club grid reflects live capacity/taken-clubs on first render.
  useEffect(() => {
    if (createdCode && !managerId && !room) {
      setMode("join");
      store.getState().peekRoom(createdCode);
    }
  }, [createdCode, managerId, room]);

  const doJoin = (p: JoinFields) => {
    const saved = savedManagerId();
    store.getState().join(saved ? { ...p, managerId: saved } : p);
  };
  const s = store.getState();
  const actions = useMemo(() => ({ bid: s.bid, openListing: s.openListing, challenge: s.challenge }), [store]);

  const toast = error ? (
    <div className="toast" role="alert" onClick={() => store.getState().clearError()}>
      <span>{error}</span>
      <span className="toast-x">×</span>
    </div>
  ) : null;

  let screen;
  if (room && managerId) {
    if (room.status === "live") {
      screen = <DraftBoard room={room} myId={managerId} now={now} actions={actions} />;
    } else if (room.status === "closed") {
      screen = <ClosedView room={room} myId={managerId} onExport={() => store.getState().exportSeason()} />;
    } else {
      screen = (
        <Lobby
          room={room}
          myId={managerId}
          iAmHost={iAmHost}
          onStart={() => store.getState().start()}
          poolBuilder={
            iAmHost ? (
              <PoolBuilder
                results={catalogResults}
                selected={selectedPool}
                onSearch={(q) => store.getState().search(q)}
                onToggle={(id) =>
                  setSelectedPool((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
                onConfirm={(ids) => store.getState().setPool(ids)}
              />
            ) : undefined
          }
        />
      );
    }
  } else if (mode === "host-config") {
    screen = (
      <Setup
        floor={FLOOR}
        managerCount={5}
        maxCapacity={CLUBS.length}
        startLabel="Create room"
        onStart={(cfg) => { setIAmHost(true); store.getState().create(cfg); }}
      />
    );
  } else if (mode === "join") {
    screen = (
      <Join
        join={doJoin}
        takenClubs={roomPeek?.takenClubs ?? []}
        capacity={roomPeek?.capacity}
        managerCount={roomPeek?.managerCount}
        initialCode={createdCode || urlCode}
        onCodeChange={(code) => { if (code.trim().length > 0) store.getState().peekRoom(code.trim()); }}
      />
    );
  } else {
    screen = <Landing onHost={() => setMode("host-config")} onJoin={() => setMode("join")} />;
  }

  return (<>{toast}{screen}</>);
}

function Landing({ onHost, onJoin }: { onHost: () => void; onJoin: () => void }) {
  return (
    <div className="app-shell">
      <header style={{ paddingTop: 64, textAlign: "center" }} className="rise">
        <h1 className="sr-only">FC Draft Night</h1>
        <div className="eyebrow">Live transfer-market draft</div>
        <div className="brand" aria-hidden="true" style={{ justifyContent: "center", marginTop: 16 }}>
          <span className="fc">FC</span>
          <span className="brand-word">Draft Night</span>
        </div>
        <p className="muted" style={{ maxWidth: 320, margin: "20px auto 0", lineHeight: 1.55 }}>
          Five managers, one shared budget. Bid, challenge and poach your way to the
          best squad before kickoff.
        </p>
      </header>

      <div className="landing-actions rise" style={{ animationDelay: "0.08s" }}>
        <button className="btn btn-primary btn-block" onClick={onHost}>Host a draft</button>
        <button className="btn btn-block" onClick={onJoin}>Join with a code</button>
      </div>
    </div>
  );
}

function ClosedView({
  room,
  myId,
  onExport,
}: {
  room: RoomState;
  myId: string;
  onExport: () => void;
}) {
  const highlights = recapHighlights(room);
  const mgr = (id: string) => room.managers[id]?.displayName ?? id;
  const plr = (id: string) => room.players[id]?.name ?? id;

  return (
    <div className="app-shell">
      <header style={{ paddingTop: 30, marginBottom: 16 }} className="rise">
        <div className="eyebrow">Draft complete · Season {room.seasonNumber}</div>
        <div className="brand" aria-hidden="true" style={{ marginTop: 10 }}>
          <span className="fc" style={{ fontSize: 28 }}>FC</span>
          <span className="brand-word" style={{ fontSize: 28 }}>Full time</span>
        </div>
      </header>

      <div className="panel rise" style={{ marginBottom: 14 }}>
        <div className="panel-title" style={{ marginBottom: 10 }}>Highlights</div>
        <div className="recap-grid">
          <div className="recap-cell">
            <div className="micro-label">Most spent</div>
            <div className="recap-name">{mgr(highlights.mostSpent.managerId)}</div>
            <div className="money">{money(highlights.mostSpent.amount)}</div>
          </div>
          {highlights.bestBargain && (
            <div className="recap-cell">
              <div className="micro-label">Best bargain</div>
              <div className="recap-name">{plr(highlights.bestBargain.playerId)}</div>
              <div className="money">{money(highlights.bestBargain.price)}</div>
            </div>
          )}
          {highlights.biggestOverpay && (
            <div className="recap-cell">
              <div className="micro-label">Biggest overpay</div>
              <div className="recap-name">{plr(highlights.biggestOverpay.playerId)}</div>
              <div className="money">{money(highlights.biggestOverpay.price)}</div>
            </div>
          )}
        </div>
      </div>

      {Object.values(room.managers).map((m) => {
        const squad = Object.values(room.players).filter((p) => p.ownerId === m.id);
        return (
          <div key={m.id} className="panel rise" style={{ marginBottom: 12 }}>
            <div className="panel-head">
              <span className={`club-chip ${clubClass(m.clubId)}`}>{m.displayName}{m.id === myId ? " (you)" : ""}</span>
              <span className="muted mono" style={{ fontSize: 12 }}>{clubLabel(m.clubId)} · <span className="money">{money(m.spendable)}</span> left</span>
            </div>
            <div className="squad-strip">
              {squad.map((p) => (
                <span key={p.id} className="pill">{p.name} · <span className="money">{money(p.listedValue)}</span></span>
              ))}
            </div>
          </div>
        );
      })}

      <button className="btn btn-block" style={{ marginTop: 6 }} onClick={onExport}>
        Export season CSV
      </button>
    </div>
  );
}
