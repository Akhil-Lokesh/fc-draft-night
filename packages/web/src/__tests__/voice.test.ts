import { test, expect, vi } from "vitest";
import { VoiceClient, type VoiceDeps } from "../lib/voice.js";

function fakeTransport() {
  const handlers: Record<string, ((p: any) => void)[]> = {};
  const emitted: { ev: string; p: any }[] = [];
  return {
    emit: (ev: string, p: any) => { emitted.push({ ev, p }); },
    on: (ev: string, h: (p: any) => void) => { (handlers[ev] ??= []).push(h); },
    fire: (ev: string, p: any) => handlers[ev]?.forEach((h) => h(p)),
    emitted,
    sent: (ev: string) => emitted.filter((e) => e.ev === ev).map((e) => e.p),
  };
}

class FakePc {
  static all: FakePc[] = [];
  remoteDescription: any = null;
  localDescription: any = null;
  added: any[] = [];
  candidates: any[] = [];
  closed = false;
  onicecandidate: any; ontrack: any; onconnectionstatechange: any;
  connectionState = "new";
  constructor(public cfg: any) { FakePc.all.push(this); }
  addTrack(t: any) { this.added.push(t); }
  async createOffer() { return { type: "offer", sdp: "o" }; }
  async createAnswer() { return { type: "answer", sdp: "a" }; }
  async setLocalDescription(d: any) { this.localDescription = { ...d, toJSON: () => d }; }
  async setRemoteDescription(d: any) { this.remoteDescription = d; }
  async addIceCandidate(c: any) { this.candidates.push(c); }
  close() { this.closed = true; }
}

const track = () => ({ enabled: true, stop: vi.fn() });
function deps(over: Partial<VoiceDeps> = {}): VoiceDeps {
  const tr = track();
  return {
    secure: () => true,
    getMic: async () => ({ getAudioTracks: () => [tr], getTracks: () => [tr] }) as any,
    createPc: (cfg) => new FakePc(cfg) as any,
    play: () => () => {},
    meter: () => () => {},
    ...over,
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test("joining without https explains why instead of failing silently", async () => {
  const t = fakeTransport();
  const v = new VoiceClient(t as any, deps({ secure: () => false }));
  await v.join("AB", "m_city");
  expect(v.getSnapshot().status).toBe("error");
  expect(v.getSnapshot().error).toMatch(/https/);
  expect(t.sent("voice:join")).toEqual([]);
});

test("a blocked mic shows a clear error", async () => {
  const v = new VoiceClient(fakeTransport() as any, deps({ getMic: () => Promise.reject(new Error("denied")) }));
  await v.join("AB", "m_city");
  expect(v.getSnapshot().error).toMatch(/Microphone blocked/);
});

test("the newcomer calls everyone already in the call, with the server's ICE servers", async () => {
  FakePc.all = [];
  const t = fakeTransport();
  const v = new VoiceClient(t as any, deps());
  await v.join("AB", "m_city");
  expect(t.sent("voice:join")).toEqual([{ code: "AB" }]);
  t.fire("voice:welcome", { sid: "s0", iceServers: [{ urls: ["stun:x"] }], peers: [{ managerId: "m_bay", sid: "s1" }, { managerId: "m_real", sid: "s2" }] });
  await flush();
  expect(v.getSnapshot().status).toBe("on");
  expect(FakePc.all).toHaveLength(2);
  expect(FakePc.all[0]!.cfg.iceServers[0].urls[0]).toBe("stun:x");
  expect(FakePc.all[0]!.added).toHaveLength(1); // my mic track goes to each peer
  const offers = t.sent("voice:signal");
  expect(offers.map((o) => [o.to, o.data.sdp.type])).toEqual([["m_bay", "offer"], ["m_real", "offer"]]);
});

test("an incoming offer is answered, and candidates that arrive early are held until it lands", async () => {
  FakePc.all = [];
  const t = fakeTransport();
  const v = new VoiceClient(t as any, deps());
  await v.join("AB", "m_city");
  t.fire("voice:welcome", { sid: "s0", iceServers: [], peers: [] });
  await flush();
  t.fire("voice:signal", { from: "m_bay", sid: "s1", data: { sdp: { type: "offer", sdp: "o" } } });
  await flush();
  const pc = FakePc.all[0]!;
  expect(t.sent("voice:signal").at(-1)).toMatchObject({ to: "m_bay", data: { sdp: { type: "answer" } } });
  t.fire("voice:signal", { from: "m_bay", sid: "s1", data: { candidate: { candidate: "c1" } } });
  await flush();
  expect(pc.candidates).toEqual([{ candidate: "c1" }]);
});

test("mute silences my mic track and tells the room", async () => {
  const t = fakeTransport();
  const tr = track();
  const v = new VoiceClient(t as any, deps({ getMic: async () => ({ getAudioTracks: () => [tr], getTracks: () => [tr] }) as any }));
  await v.join("AB", "m_city");
  t.fire("voice:welcome", { sid: "s0", iceServers: [], peers: [] });
  await flush();
  v.setMuted(true);
  expect(tr.enabled).toBe(false);
  expect(t.sent("voice:mute")).toEqual([{ code: "AB", muted: true }]);
});

test("someone leaving the call (or rejoining with a new session) drops their old connection", async () => {
  FakePc.all = [];
  const t = fakeTransport();
  const v = new VoiceClient(t as any, deps());
  await v.join("AB", "m_city");
  t.fire("voice:welcome", { sid: "s0", iceServers: [], peers: [{ managerId: "m_bay", sid: "s1" }] });
  await flush();
  t.fire("voice:roster", { members: [{ managerId: "m_city", sid: "s0", muted: false }] }); // m_bay left
  expect(FakePc.all[0]!.closed).toBe(true);
  expect(Object.keys(v.getSnapshot().members)).toEqual(["m_city"]);
});

test("leaving voice stops the mic and closes every connection", async () => {
  FakePc.all = [];
  const t = fakeTransport();
  const tr = track();
  const v = new VoiceClient(t as any, deps({ getMic: async () => ({ getAudioTracks: () => [tr], getTracks: () => [tr] }) as any }));
  await v.join("AB", "m_city");
  t.fire("voice:welcome", { sid: "s0", iceServers: [], peers: [{ managerId: "m_bay", sid: "s1" }] });
  await flush();
  v.leave();
  expect(tr.stop).toHaveBeenCalled();
  expect(FakePc.all[0]!.closed).toBe(true);
  expect(v.getSnapshot().status).toBe("off");
  expect(t.sent("voice:leave")).toHaveLength(1);
});

test("after a dropped connection, voice rejoins once the room seat is back", async () => {
  const t = fakeTransport();
  const v = new VoiceClient(t as any, deps());
  await v.join("AB", "m_city");
  t.fire("voice:welcome", { sid: "s0", iceServers: [], peers: [] });
  await flush();
  t.fire("joined", { managerId: "m_city" });
  expect(t.sent("voice:join")).toHaveLength(2);
});

test("the roster is tracked even before I join voice, so I can see who's already talking", () => {
  const t = fakeTransport();
  const v = new VoiceClient(t as any, deps());
  t.fire("voice:roster", { members: [{ managerId: "m_bay", sid: "s1", muted: true }] });
  expect(v.getSnapshot().members).toEqual({ m_bay: { muted: true } });
});
