import type { ReactNode } from "react";
import { useVoice } from "../lib/voice.js";

/** Join / mute / leave the room's voice call. Open mic: once you're in, you're live until you mute. */
export function VoiceControl({ code, myId }: { code: string; myId: string }) {
  const v = useVoice();
  if (!v.client) return null;
  const count = Object.keys(v.members).length;

  if (v.status === "on") {
    return (
      <div className="voice is-on" role="group" aria-label="Voice chat">
        <button
          type="button"
          className={`voice-btn ${v.muted ? "is-muted" : "is-live"}`}
          aria-pressed={v.muted}
          title={v.muted ? "Unmute" : "Mute"}
          onClick={() => v.client!.setMuted(!v.muted)}
        >
          <MicIcon off={v.muted} />
          <span>{v.muted ? "Muted" : "Live"}</span>
        </button>
        <span className="voice-count" title="People in voice">{count}</span>
        <button type="button" className="voice-leave" aria-label="Leave voice" title="Leave voice" onClick={() => v.client!.leave()}>×</button>
      </div>
    );
  }
  return (
    <div className="voice">
      <button
        type="button"
        className="voice-btn"
        disabled={v.status === "connecting"}
        onClick={() => void v.client!.join(code, myId)}
        title="Join the room's voice chat"
      >
        <MicIcon />
        <span>{v.status === "connecting" ? "Connecting…" : "Voice"}</span>
      </button>
      {v.status === "error" && <span className="voice-err" role="alert">{v.error}</span>}
    </div>
  );
}

/** Wraps a manager's crest: a pulsing ring while they talk, a mic/muted badge while in the call. */
export function VoiceRing({ managerId, children }: { managerId: string; children: ReactNode }) {
  const v = useVoice();
  const member = v.members[managerId];
  const speaking = v.speaking.includes(managerId);
  return (
    <span className={`vring ${speaking ? "is-speaking" : ""}`}>
      {children}
      {member && (
        <span className={`vring-badge ${member.muted ? "is-muted" : ""}`} aria-label={member.muted ? "muted" : "in voice"}>
          <MicIcon off={member.muted} />
        </span>
      )}
    </span>
  );
}

function MicIcon({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}
