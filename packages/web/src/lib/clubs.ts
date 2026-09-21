import type { ClubId } from "@fcdn/shared";

export interface ClubInfo { id: ClubId; label: string; short: string; className: string; }

export const CLUBS: ClubInfo[] = [
  { id: "arsenal", label: "Arsenal", short: "ARS", className: "club-arsenal" },
  { id: "bayern", label: "Bayern Munich", short: "BAY", className: "club-bayern" },
  { id: "real", label: "Real Madrid", short: "RMA", className: "club-real" },
  { id: "barca", label: "Barcelona", short: "BAR", className: "club-barca" },
  { id: "city", label: "Manchester City", short: "MCI", className: "club-city" },
];

export function clubOf(id: string): ClubInfo | undefined {
  return CLUBS.find((c) => c.id === id);
}
export function clubLabel(id: string): string { return clubOf(id)?.label ?? id; }
export function clubClass(id: string): string { return clubOf(id)?.className ?? ""; }
