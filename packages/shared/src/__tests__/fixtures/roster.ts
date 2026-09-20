import type { SeedPlayer } from "../../data/dataset.js";

/** A small controlled roster matching the pitch's worked examples. NOT the real FC26 data. */
export function fixtureSeed(): SeedPlayer[] {
  return [
    // Real Madrid
    { id: "mbappe", name: "Kylian Mbappé", position: "FWD", value: 200, overall: 91, club: "Real Madrid", clubId: "real" },
    { id: "vini", name: "Vinícius Jr", position: "FWD", value: 180, overall: 89, club: "Real Madrid", clubId: "real" },
    { id: "bellingham", name: "Jude Bellingham", position: "MID", value: 170, overall: 90, club: "Real Madrid", clubId: "real" },
    { id: "courtois", name: "Thibaut Courtois", position: "GK", value: 20, overall: 87, club: "Real Madrid", clubId: "real" },
    { id: "real_filler", name: "Real Filler", position: "DEF", value: 10, overall: 75, club: "Real Madrid", clubId: "real" },
    // Barcelona
    { id: "pedri", name: "Pedri", position: "MID", value: 60, overall: 88, club: "Barcelona", clubId: "barca" },
    { id: "terstegen", name: "Marc-André ter Stegen", position: "GK", value: 15, overall: 85, club: "Barcelona", clubId: "barca" },
    { id: "barca_filler", name: "Barca Filler", position: "DEF", value: 15, overall: 75, club: "Barcelona", clubId: "barca" },
    // Bayern
    { id: "kane", name: "Harry Kane", position: "FWD", value: 100, overall: 90, club: "Bayern Munich", clubId: "bayern" },
    { id: "musiala", name: "Jamal Musiala", position: "MID", value: 70, overall: 88, club: "Bayern Munich", clubId: "bayern" },
    { id: "neuer", name: "Manuel Neuer", position: "GK", value: 10, overall: 84, club: "Bayern Munich", clubId: "bayern" },
    // Arsenal
    { id: "saka", name: "Bukayo Saka", position: "FWD", value: 90, overall: 88, club: "Arsenal", clubId: "arsenal" },
    { id: "odegaard", name: "Martin Ødegaard", position: "MID", value: 70, overall: 87, club: "Arsenal", clubId: "arsenal" },
    { id: "saliba", name: "William Saliba", position: "DEF", value: 60, overall: 86, club: "Arsenal", clubId: "arsenal" },
    // Manchester City
    { id: "debruyne", name: "Kevin De Bruyne", position: "MID", value: 60, overall: 87, club: "Manchester City", clubId: "city" },
    { id: "ederson", name: "Ederson", position: "GK", value: 10, overall: 84, club: "Manchester City", clubId: "city" },
    { id: "walker", name: "Kyle Walker", position: "DEF", value: 10, overall: 82, club: "Manchester City", clubId: "city" },
    // Pool (unowned)
    { id: "haaland", name: "Erling Haaland", position: "FWD", value: 180, overall: 90, club: "Borussia Dortmund", clubId: null },
    { id: "wirtz", name: "Florian Wirtz", position: "MID", value: 60, overall: 86, club: "Bayer Leverkusen", clubId: null },
  ];
}
