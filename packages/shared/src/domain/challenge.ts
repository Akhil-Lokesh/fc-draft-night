import type { RoomState } from "./types.js";

export const CHALLENGE_CAP = 3;

export const challengeKey = (challenger: string, rival: string) => `${challenger}->${rival}`;

export function canChallenge(s: RoomState, challenger: string, rival: string): boolean {
  return (s.challenges[challengeKey(challenger, rival)] ?? 0) < CHALLENGE_CAP;
}

export function recordChallenge(s: RoomState, challenger: string, rival: string): RoomState {
  const k = challengeKey(challenger, rival);
  return { ...s, challenges: { ...s.challenges, [k]: (s.challenges[k] ?? 0) + 1 } };
}
