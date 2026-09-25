import type { RoomState } from "./types.js";

/** A team's colour in a room: the accent their whole UI is themed in, and the side they're drawn
 *  on in a war. `ink` is the readable text colour on top of `color`. */
export interface TeamColor { id: string; color: string; ink: string }

/** The 10 team colours — constant, handed out in this order by each club's position in the room's
 *  club list (not by which club it is): the room's first club gets red, the second blue, and so
 *  on, so a room's first five clubs always get the top five. Known before anyone joins, so the
 *  club picker shows each club's colour. Never shared within a room. No greens: the whole app
 *  sits on a dark pitch-green background, so a green team would disappear into it. */
export const TEAM_PALETTE: TeamColor[] = [
  // Top five: the most clearly different hues, since most rooms have five clubs or fewer.
  { id: "red", color: "#f0474f", ink: "#ffffff" },
  { id: "blue", color: "#7b93ff", ink: "#050b26" },
  { id: "gold", color: "#f7c83c", ink: "#1b1500" },
  { id: "magenta", color: "#d65ce8", ink: "#ffffff" },
  { id: "cyan", color: "#22d3ee", ink: "#03171b" },
  // Six to ten.
  { id: "orange", color: "#fb923c", ink: "#1c0b02" },
  { id: "pink", color: "#f472b6", ink: "#2a0616" },
  { id: "violet", color: "#a78bfa", ink: "#140a2e" },
  { id: "sky", color: "#4cb8f5", ink: "#04121c" },
  { id: "bronze", color: "#c8925a", ink: "#1a0f03" },
];

/** The colour a club gets in this room: its position in the room's club list picks the palette
 *  slot. A club not in that list falls back to the first colour nobody has yet. */
export function colorForClub(s: RoomState, clubId: string, used: Iterable<string> = []): string {
  const i = Object.keys(s.clubNames).indexOf(clubId);
  return i >= 0 ? TEAM_PALETTE[i % TEAM_PALETTE.length]!.id : pickColor(used);
}

/** The first colour in palette order that nobody in the room has yet. */
export function pickColor(used: Iterable<string>): string {
  const taken = new Set(used);
  return (TEAM_PALETTE.find((c) => !taken.has(c.id)) ?? TEAM_PALETTE[0]!).id;
}

export function colorById(id: string | undefined): TeamColor | undefined {
  return TEAM_PALETTE.find((c) => c.id === id);
}

/** managerId -> colour for everyone in the room. Rooms saved before colours existed get theirs
 *  assigned here in join order, the same way addManager would have. */
export function teamColors(s: RoomState): Record<string, TeamColor> {
  const out: Record<string, TeamColor> = {};
  const used = new Set<string>();
  for (const m of Object.values(s.managers)) if (m.colorId) used.add(m.colorId);
  for (const m of Object.values(s.managers)) {
    let id = colorById(m.colorId)?.id;
    if (!id) { id = colorForClub(s, m.clubId, used); used.add(id); }
    out[m.id] = colorById(id)!;
  }
  return out;
}
