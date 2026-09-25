import { createContext, useContext } from "react";

/** The five built-in clubs. Anything else comes from a host-uploaded roster and is labelled
 *  from the room's `clubNames` (see ClubNames below) or, failing that, its slug. */
export interface ClubInfo { id: string; label: string; short: string }

export const CLUBS: ClubInfo[] = [
  { id: "arsenal", label: "Arsenal", short: "ARS" },
  { id: "bayern", label: "Bayern Munich", short: "FCB" },
  { id: "real", label: "Real Madrid", short: "RMA" },
  { id: "barca", label: "Barcelona", short: "BAR" },
  { id: "city", label: "Manchester City", short: "MCI" },
];

export function clubOf(id: string): ClubInfo | undefined {
  return CLUBS.find((c) => c.id === id);
}

/** Title-case a slug as a readable fallback — "atletico-madrid" -> "Atletico Madrid". */
function labelFromSlug(id: string): string {
  return id.split("-").filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}

export function clubLabel(id: string, names?: Record<string, string>): string {
  return names?.[id] ?? clubOf(id)?.label ?? labelFromSlug(id);
}

export function clubShort(id: string, names?: Record<string, string>): string {
  const known = clubOf(id)?.short;
  if (known) return known;
  const words = clubLabel(id, names).split(/\s+/).filter(Boolean);
  const s = words.length > 1 ? words.map((w) => w[0]).join("") : words[0] ?? "?";
  return s.slice(0, 3).toUpperCase();
}

/** A club's colour outside a room (e.g. the club picker), where no team colour exists yet —
 *  team colours go by join order, not by club, so every club reads the same neutral here.
 *  Inside a room, useClubColor gives the colour its manager was actually assigned. */
const NEUTRAL = { color: "#b9c6b6", ink: "#0b0f0c" };
export function clubColor(_id: string): { color: string; ink: string } {
  return NEUTRAL;
}

/** Room-scoped team colours (clubId -> the unique colour its manager was given on joining).
 *  Clubs nobody manages here fall back to clubColor. */
export const TeamColors = createContext<Record<string, { color: string; ink: string }>>({});
export function useClubColor() {
  const room = useContext(TeamColors);
  return (id: string) => room[id] ?? clubColor(id);
}

/** Room-scoped club display names, provided once near the top of the tree. */
export const ClubNames = createContext<Record<string, string>>({});
export function useClubLabel() {
  const names = useContext(ClubNames);
  return (id: string) => clubLabel(id, names);
}
export function useClubNames() { return useContext(ClubNames); }
