import { createContext, useContext, useSyncExternalStore } from "react";

/** Room voice chat: open mic + mute, peer-to-peer (WebRTC mesh). The game server is only the
 *  matchmaker (server/src/voice.ts) — audio flows straight between browsers. Fine for a draft
 *  night's 2–10 managers; each person sends one small audio stream to each other person. */

export interface VoiceMemberState { muted: boolean }
export interface VoiceSnapshot {
  status: "off" | "connecting" | "on" | "error";
  error?: string;
  muted: boolean;
  /** Everyone in this room's call, me included, by managerId. */
  members: Record<string, VoiceMemberState>;
  /** managerIds currently making sound (mic level over a threshold). */
  speaking: string[];
}

interface Transport {
  emit(ev: string, p?: unknown): void;
  on(ev: string, h: (p: any) => void): void;
}

type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

/** Browser capabilities, injectable so the call logic is testable without a real mic/network. */
export interface VoiceDeps {
  secure(): boolean;
  getMic(): Promise<MediaStream>;
  createPc(cfg: RTCConfiguration): RTCPeerConnection;
  /** Play a peer's audio; returns a function that stops it. */
  play(peer: string, stream: MediaStream): () => void;
  /** Watch a stream's loudness; calls back with true/false as it starts/stops speaking. */
  meter(stream: MediaStream, onChange: (speaking: boolean) => void): () => void;
}

const MIC: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false };

let sharedCtx: AudioContext | null = null;
export const browserDeps: VoiceDeps = {
  secure: () => typeof window !== "undefined" && window.isSecureContext,
  getMic: () => navigator.mediaDevices.getUserMedia(MIC),
  createPc: (cfg) => new RTCPeerConnection(cfg),
  play: (_peer, stream) => {
    const el = document.createElement("audio");
    el.autoplay = true;
    el.setAttribute("playsinline", "");
    el.srcObject = stream;
    el.style.display = "none";
    document.body.appendChild(el);
    void el.play().catch(() => { /* retried on the next user tap by the browser */ });
    return () => { el.srcObject = null; el.remove(); };
  },
  meter: (stream, onChange) => {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return () => {};
    sharedCtx ??= new Ctx();
    void sharedCtx.resume();
    const src = sharedCtx.createMediaStreamSource(stream);
    const an = sharedCtx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let on = false, quiet = 0;
    const id = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const loud = Math.sqrt(sum / buf.length) > 0.035;
      // Switch on at once, off only after ~0.5s of quiet, so the ring doesn't flicker between words.
      quiet = loud ? 0 : quiet + 1;
      const next = loud || (on && quiet < 3);
      if (next !== on) { on = next; onChange(on); }
    }, 160);
    return () => { clearInterval(id); src.disconnect(); };
  },
};

interface Peer { pc: RTCPeerConnection; sid: string; pending: RTCIceCandidateInit[]; stop: (() => void)[] }

export class VoiceClient {
  private snap: VoiceSnapshot = { status: "off", muted: false, members: {}, speaking: [] };
  private listeners = new Set<() => void>();
  private local: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private ice: RTCIceServer[] = [];
  private code: string | null = null;
  private me: string | null = null;
  private stopLocalMeter: (() => void) | null = null;

  constructor(private t: Transport, private deps: VoiceDeps = browserDeps) {
    t.on("voice:welcome", (w) => void this.onWelcome(w));
    t.on("voice:signal", (s) => void this.onSignal(s));
    t.on("voice:roster", (r) => this.onRoster(r));
    // A dropped connection takes us out of the server's call. Rejoin once the room seat is back
    // ("joined" follows the automatic room rejoin) — voice before the seat would be refused.
    t.on("joined", () => { if (this.snap.status === "on" && this.code) this.t.emit("voice:join", { code: this.code }); });
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;
  private set(patch: Partial<VoiceSnapshot>) { this.snap = { ...this.snap, ...patch }; this.listeners.forEach((l) => l()); }
  private setSpeaking(id: string, on: boolean) {
    const has = this.snap.speaking.includes(id);
    if (on && !has) this.set({ speaking: [...this.snap.speaking, id] });
    if (!on && has) this.set({ speaking: this.snap.speaking.filter((x) => x !== id) });
  }

  async join(code: string, me: string) {
    if (this.snap.status === "on" || this.snap.status === "connecting") return;
    if (!this.deps.secure()) {
      this.set({ status: "error", error: "Voice needs the secure https:// link — the browser blocks the mic otherwise." });
      return;
    }
    this.set({ status: "connecting", error: undefined });
    try {
      this.local = await this.deps.getMic();
    } catch {
      this.set({ status: "error", error: "Microphone blocked. Allow mic access for this site, then try again." });
      return;
    }
    this.code = code;
    this.me = me;
    this.local.getAudioTracks().forEach((tr) => { tr.enabled = !this.snap.muted; });
    this.stopLocalMeter = this.deps.meter(this.local, (on) => this.setSpeaking(me, on && !this.snap.muted));
    this.t.emit("voice:join", { code });
  }

  setMuted(muted: boolean) {
    this.local?.getAudioTracks().forEach((tr) => { tr.enabled = !muted; });
    this.set({ muted });
    if (muted && this.me) this.setSpeaking(this.me, false);
    if (this.code && this.snap.status === "on") this.t.emit("voice:mute", { code: this.code, muted });
  }

  leave() {
    if (this.snap.status === "off") return;
    this.t.emit("voice:leave", { code: this.code });
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.stopLocalMeter?.();
    this.stopLocalMeter = null;
    this.local?.getTracks().forEach((tr) => tr.stop());
    this.local = null;
    this.code = null;
    const members = { ...this.snap.members };
    if (this.me) delete members[this.me]; // the others are still in; the next roster confirms it
    this.set({ status: "off", members, speaking: [], error: undefined });
  }

  private signal(to: string, data: Signal) {
    if (this.code) this.t.emit("voice:signal", { code: this.code, to, data });
  }

  private open(peer: string, sid: string, caller = false): Peer {
    const pc = this.deps.createPc({ iceServers: this.ice });
    const p: Peer = { pc, sid, pending: [], stop: [] };
    this.peers.set(peer, p);
    this.local?.getTracks().forEach((tr) => pc.addTrack(tr, this.local!));
    pc.onicecandidate = (e) => { if (e.candidate) this.signal(peer, { candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      p.stop.push(this.deps.play(peer, stream));
      p.stop.push(this.deps.meter(stream, (on) => this.setSpeaking(peer, on)));
    };
    // A path that dies mid-call (network switch, router hiccup): the side that placed the call
    // renegotiates with an ICE restart; the other side just answers the new offer.
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && caller && this.peers.get(peer) === p) void this.offer(peer, p, true);
    };
    return p;
  }

  private drop(peer: string) {
    const p = this.peers.get(peer);
    if (!p) return;
    p.stop.forEach((f) => f());
    p.pc.close();
    this.peers.delete(peer);
    this.setSpeaking(peer, false);
  }

  private async onWelcome(w: { iceServers: RTCIceServer[]; peers: { managerId: string; sid: string }[] }) {
    if (this.snap.status !== "connecting" && this.snap.status !== "on") return;
    this.ice = w.iceServers;
    for (const id of [...this.peers.keys()]) this.drop(id); // fresh start (first join or a reconnect)
    this.set({ status: "on" });
    if (this.snap.muted && this.code) this.t.emit("voice:mute", { code: this.code, muted: true });
    // The newcomer calls everyone already in; they only answer — so two sides never both offer.
    for (const peer of w.peers) await this.offer(peer.managerId, this.open(peer.managerId, peer.sid, true));
  }

  private async onSignal({ from, sid, data }: { from: string; sid: string; data: Signal }) {
    if (this.snap.status !== "on") return;
    let p = this.peers.get(from);
    if (data.sdp?.type === "offer") {
      if (p && p.sid !== sid) { this.drop(from); p = undefined; } // they rejoined: new connection
      p ??= this.open(from, sid);
      await p.pc.setRemoteDescription(data.sdp);
      await this.flush(p);
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      this.signal(from, { sdp: p.pc.localDescription!.toJSON() });
    } else if (data.sdp?.type === "answer" && p) {
      await p.pc.setRemoteDescription(data.sdp);
      await this.flush(p);
    } else if (data.candidate && p) {
      // Candidates can arrive before the offer/answer they belong to has been applied: hold them.
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate).catch(() => {});
      else p.pending.push(data.candidate);
    }
  }

  private async offer(peer: string, p: Peer, iceRestart = false) {
    const offer = await p.pc.createOffer({ iceRestart });
    await p.pc.setLocalDescription(offer);
    this.signal(peer, { sdp: p.pc.localDescription!.toJSON() });
  }

  private async flush(p: Peer) {
    for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
  }

  // Tracked even while I'm not in the call, so everyone can see who's already talking.
  private onRoster({ members }: { members: { managerId: string; sid: string; muted: boolean }[] }) {
    const bySid = new Map(members.map((m) => [m.managerId, m.sid]));
    // Anyone who left the call — or rejoined it with a new session — loses their old connection.
    for (const [id, p] of this.peers) if (bySid.get(id) !== p.sid) this.drop(id);
    this.set({ members: Object.fromEntries(members.map((m) => [m.managerId, { muted: m.muted }])) });
  }
}

export const VoiceContext = createContext<VoiceClient | null>(null);

const OFF: VoiceSnapshot = { status: "off", muted: false, members: {}, speaking: [] };
const noop = () => () => {};
/** The room's voice state, re-rendering on change. Works (as "off") with no VoiceClient provided. */
export function useVoice(): VoiceSnapshot & { client: VoiceClient | null } {
  const client = useContext(VoiceContext);
  const snap = useSyncExternalStore(client?.subscribe ?? noop, client?.getSnapshot ?? (() => OFF));
  return { ...snap, client };
}
