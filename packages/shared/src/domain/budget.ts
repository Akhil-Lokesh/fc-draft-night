import type { Player, Manager } from "./types.js";

export function cost(player: Player, managerId: string, amount: number): number {
  return player.ownerId === managerId ? amount - player.listedValue : amount;
}

export function canAfford(m: Manager, player: Player, amount: number): boolean {
  return cost(player, m.id, amount) <= m.spendable;
}

/** What a 5-star club starts season 1 with: the floor and the ceiling at once (nobody types a budget). Each
 *  half-star lower gets 150M less. */
export const FIVE_STAR_BUDGET = 1500;
/** From season 2 a club starts with last season's leftover money plus this for every league place it finished
 *  above last: with 5 teams, 4th gets +20, 3rd +40, 2nd +60, 1st +80, and last place just its leftover. */
export const STANDING_BONUS = 20;
