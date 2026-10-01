import { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { hostOf, teamColors } from "@fcdn/shared";
import { makeStore, connect, useUi, savedManagerId, type UiStore } from "./state/socket.js";
import { ClubNames, TeamColors } from "./lib/clubs.js";
import { Landing } from "./screens/Landing.js";
import { Setup } from "./screens/Setup.js";
import { Join, type JoinFields } from "./screens/Join.js";
import { Lobby } from "./screens/Lobby.js";
import { DraftBoard } from "./screens/DraftBoard.js";
import { FullTime } from "./screens/FullTime.js";
import { PoolBuilder } from "./board/PoolBuilder.js";
import { VoiceClient, VoiceContext } from "./lib/voice.js";

// Lowest budget the host can type. (It used to be derived from the built-in squads, which no longer exist;
// the server still checks every club's own squad value against its own budget.)
const FLOOR = 1500;
// Same origin by default: the dev server proxies /socket.io to the game server (vite.config.ts), so
// the app works through one https link — required for the mic on phones and for remote friends.
const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL ?? location.origin;

type Mode = "landing" | "host-config" | "join";

/** Ticks every 250ms so countdowns render live. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function App({ store: injected }: { store?: UiStore } = {}) {
  const socketRef = useRef<Socket | null>(null);
  if (!injected && !socketRef.current) socketRef.current = connect(SERVER_URL);
  const store = useMemo<UiStore>(() => injected ?? makeStore(socketRef.current as any), [injected]);
  // One voice client for the tab's lifetime, on the same socket (none in tests with an injected store).
  const voice = useMemo(() => (socketRef.current ? new VoiceClient(socketRef.current as any) : null), []);

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
  const actingAs = useUi(store, (s) => s.actingAs);
  const now = useNow();

  const urlCode = useMemo(() => new URLSearchParams(location.search).get("room") ?? "", []);
  const [mode, setMode] = useState<Mode>(urlCode ? "join" : "landing");
  const [iAmHost, setIAmHost] = useState(false);
  const [selectedPool, setSelectedPool] = useState<string[]>([]);

  // Season CSV from the server -> browser download.
  useEffect(() => {
    if (!seasonExport) return;
    const href = URL.createObjectURL(new Blob([seasonExport.csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = seasonExport.filename;
    a.click();
    URL.revokeObjectURL(href);
  }, [seasonExport]);

  // A room code in the URL: peek it immediately so the club grid shows live availability.
  useEffect(() => { if (urlCode) store.getState().peekRoom(urlCode); }, [urlCode, store]);

  // Host just created the room: go to the identity step with the code prefilled, peeked.
  useEffect(() => {
    if (createdCode && !managerId && !room) {
      setMode("join");
      store.getState().peekRoom(createdCode);
    }
  }, [createdCode, managerId, room, store]);

  // Auto-dismiss errors after a few seconds.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => store.getState().clearError(), 5000);
    return () => clearTimeout(id);
  }, [error, store]);

  const doJoin = (p: JoinFields) => {
    const saved = savedManagerId();
    store.getState().join(saved ? { ...p, managerId: saved } : p);
  };
  const actions = useMemo(() => {
    const s = store.getState();
    return { bid: s.bid, openListing: s.openListing, challenge: s.challenge, forfeit: s.forfeit };
  }, [store]);
  const goHome = () => setMode("landing");
  // Walk away from the current room entirely — tells the server (so it stops broadcasting to
  // us), clears local room state, and drops back to the home screen. Offered in the lobby and at
  // full time only: once the auction is live nobody walks out mid-draft — it runs until the host
  // ends it.
  const leaveRoom = () => { voice?.leave(); store.getState().leave(); setIAmHost(false); goHome(); };
  // The server knows who the host is, so a refreshed host tab keeps its host controls.
  const amHost = iAmHost || (!!room && !!managerId && hostOf(room) === managerId);
  // Test rooms: the host can play any seat. `viewId` is the seat the board is shown for (their own unless
  // they switched); every command goes out as that seat, and the server re-checks all of it.
  const testHost = !!room?.testMode && amHost;
  const viewId = testHost && actingAs && room?.managers[actingAs] ? actingAs : managerId;

  // The host approved my leave request: I've been removed from the room, so head home. Only once
  // I've actually been seen in it — never on a state that simply predates my join landing.
  const seenInRoom = useRef(false);
  useEffect(() => {
    if (!room || !managerId) { seenInRoom.current = false; return; }
    if (room.managers[managerId]) { seenInRoom.current = true; return; }
    if (seenInRoom.current && room.status === "setup") { seenInRoom.current = false; leaveRoom(); }
  }, [room, managerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every team in the room has its own colour: clubId -> colour for crests/tags/war sides, and
  // mine re-themes the whole accent (buttons, highlights, focus rings) while the dark base stays.
  const colorsByClub = useMemo(() => {
    if (!room) return {};
    const byManager = teamColors(room);
    return Object.fromEntries(Object.values(room.managers).map((m) => [m.clubId, byManager[m.id]!]));
  }, [room]);
  const myColor = room && viewId ? teamColors(room)[viewId] : undefined;
  useEffect(() => {
    const root = document.documentElement.style;
    if (!myColor) {
      for (const v of ["--flare", "--flare-ink", "--flare-soft"]) root.removeProperty(v);
      return;
    }
    root.setProperty("--flare", myColor.color);
    root.setProperty("--flare-ink", myColor.ink);
    root.setProperty("--flare-soft", `color-mix(in srgb, ${myColor.color} 14%, transparent)`);
  }, [myColor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  let screen;
  if (room && managerId) {
    if (room.status === "live") {
      screen = (
        <DraftBoard
          room={room}
          myId={viewId ?? managerId}
          now={now}
          actions={actions}
          iAmHost={amHost}
          onEndDraft={() => store.getState().endDraft()}
          seatSwitcher={testHost ? { onSwitch: (id) => store.getState().setActingAs(id === managerId ? null : id) } : undefined}
        />
      );
    } else if (room.status === "closed") {
      screen = (
        <FullTime
          room={room}
          myId={managerId}
          onExport={() => store.getState().exportSeason()}
          onHome={leaveRoom}
        />
      );
    } else {
      screen = (
        <Lobby
          room={room}
          myId={managerId}
          iAmHost={amHost}
          onStart={() => store.getState().start()}
          onLeave={leaveRoom}
          onRequestLeave={() => store.getState().requestLeave()}
          onCancelLeave={() => store.getState().cancelLeave()}
          onResolveLeave={(id, allow) => store.getState().resolveLeave(id, allow)}
          poolBuilder={amHost ? (
            <PoolBuilder
              results={catalogResults}
              selected={selectedPool}
              onSearch={(q) => store.getState().search(q)}
              onToggle={(id) => setSelectedPool((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
              onConfirm={(ids) => store.getState().setPool(ids)}
            />
          ) : undefined}
        />
      );
    }
  } else if (mode === "host-config") {
    screen = (
      <Setup
        floor={FLOOR}
        startLabel="Create room"
        onBack={goHome}
        onStart={(cfg) => { setIAmHost(true); store.getState().create(cfg); }}
      />
    );
  } else if (mode === "join") {
    screen = (
      <Join
        join={doJoin}
        takenClubs={roomPeek?.found ? roomPeek.takenClubs : []}
        capacity={roomPeek?.found ? roomPeek.capacity : undefined}
        managerCount={roomPeek?.found ? roomPeek.managerCount : undefined}
        clubs={roomPeek?.found ? roomPeek.allClubs : undefined}
        notFound={roomPeek?.found === false}
        initialCode={createdCode || urlCode}
        onBack={createdCode ? undefined : goHome}
        onCodeChange={(code) => { if (code.trim()) store.getState().peekRoom(code.trim()); }}
      />
    );
  } else {
    screen = <Landing onHost={() => setMode("host-config")} onJoin={() => setMode("join")} />;
  }

  return (
    <ClubNames.Provider value={room?.clubNames ?? {}}>
    <TeamColors.Provider value={colorsByClub}>
    <VoiceContext.Provider value={voice}>
      {error && (
        <div className="toast" role="alert" onClick={() => store.getState().clearError()}>
          <span>{error}</span>
          <span className="toast-x" aria-label="Dismiss">×</span>
        </div>
      )}
      {screen}
    </VoiceContext.Provider>
    </TeamColors.Provider>
    </ClubNames.Provider>
  );
}
