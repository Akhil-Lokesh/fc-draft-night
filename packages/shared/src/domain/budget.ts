import type { Player, Manager } from "./types.js";

export function cost(player: Player, managerId: string, amount: number): number {
  return player.ownerId === managerId ? amount - player.listedValue : amount;
}

export function canAfford(m: Manager, player: Player, amount: number): boolean {
  return cost(player, m.id, amount) <= m.spendable;
}
