Paste everything below the line into an AI (ChatGPT, Claude, Gemini…). Fill in the part under "MY LEAGUE" first.

---

You are preparing a roster upload file (CSV) for **FC Draft Night**, a football draft game. The app is strict about the structure, so follow the two tables below exactly: **Table 1 explains every part of the file. Table 2 shows correct and wrong examples of each part.** After the tables there is one complete file to copy the shape from.

**Reply with ONLY the finished CSV inside one code block — no explanation before or after.**

## MY LEAGUE (fill this in)

- Tournament name: `[e.g. Friday Night League]`
- Season: `[1 for a brand-new league]`
- Teams: `[e.g. Chelsea, Atletico Madrid, Arsenal, Inter, Napoli]`
- Squads: `[e.g. each club's current first-team squad as in EA Sports FC 26 — or: "I will give you the lists below"]`
- Free-agent pool: `[e.g. 10 well-known players from clubs NOT listed above — or: none]`

## TABLE 1 — What every part of the file means

The file has three top lines, then up to three sections. Each section starts with a marker line (`## NAME`) followed by its own header row. Lines starting with `#` and blank lines are ignored.

| Part | Line / column | Required? | What to put | Rules |
|---|---|---|---|---|
| Top lines | `tournament,<name>` | Optional | The league's name | Any text; avoid commas and quotes |
| Top lines | `season,<number>` | Required | `1` for a brand-new league, `2`, `3`… for later seasons | Whole number, 1 or more |
| Top lines | `budgetStep,<number>` | Optional (default 0) | The budget gap between finishing positions, used from season 2 onward | A number. Use `0` unless I say otherwise |
| `## TEAMS` | header row | Always include | Exactly `club,finishingPosition` | Copy it exactly |
| `## TEAMS` | `club` | Required | One row per team, named as FC 26 names the club | 2 to 10 teams. Each club once. Same spelling as in SQUADS. Accents and capitals are ignored |
| `## TEAMS` | `finishingPosition` | Season 1: leave empty. Season 2+: required | Last season's league position for that team | Season 1: EMPTY for every team (keep the comma). Season 2+: a different whole number for every team, 1 = champion |
| `## SQUADS` | header row | Required | Exactly `club,player,number` | Copy it exactly |
| `## SQUADS` | `club` (1st column) | Required | The team that owns this player | Must be one of the teams in TEAMS |
| `## SQUADS` | `player` (2nd) | Required | The player's name as EA Sports FC 26 shows it | First initial + surname (`C. Palmer`), or the single name the game uses (`Pedri`, `Rodri`, `Vini Jr.`) |
| `## SQUADS` | `number` (3rd) | Optional | Shirt number | Whole number 1 or more. Leave EMPTY (keep the comma) if unsure. Never guess. Repeats are fine |
| `## SQUADS` | `id` (4th) | Optional | The player's exact FC 26 catalog id, only if I give you one | Otherwise leave it empty |
| `## SQUADS` | `value` (5th) | Only for a player FC 26 does not know | Market value in millions of euros | A number above 0. Never add it to a player FC 26 already has |
| `## SQUADS` | `position` (6th) | Only for a player FC 26 does not know | The player's role | Exactly `GK`, `DEF`, `MID` or `FWD` |
| `## POOL` | whole section | Optional | Free agents anyone can claim from the start; same columns as SQUADS | The club can be any real club, including clubs not in TEAMS. If there is no pool, leave out the whole section, header row included |
| Whole file | every player | — | — | **A player appears exactly ONCE in the whole file**: one squad or the pool, never two places. At least 2 teams in total |

## TABLE 2 — Examples: correct, wrong, and what the app does

| Part | Correct | Wrong | What the app does with the wrong one |
|---|---|---|---|
| Season 1 team | `Chelsea,` | `Chelsea,1` | Rejects the file: season 1 can't have finishing positions |
| Season 2 teams | `Chelsea,1` `Arsenal,2` `Atletico Madrid,3` | `Chelsea,1` `Arsenal,1` … or a team with no number | Rejects the file: duplicate or missing finishing position |
| Squad row | `Chelsea,C. Palmer,20` | `Chelsea,C. Palmer,twenty` | Rejects the file: bad shirt number |
| Unknown shirt number | `Chelsea,C. Palmer,` | `Chelsea,C. Palmer,0` | Rejects the file: bad shirt number (0 is not allowed; leave it empty) |
| Missing name | `Chelsea,C. Palmer,20` | `Chelsea,,20` | Rejects the file: missing club or player |
| Player too new for FC 26 | `Chelsea,J. Newplayer,,,12,MID` | `Chelsea,J. Newplayer,,,12,MIDFIELD` | Rejects the file: position must be GK, DEF, MID or FWD |
| Value for a new player | `Chelsea,J. Newplayer,,,12,MID` | `Chelsea,J. Newplayer,,,0,MID` or `,cheap,` | Rejects the file: value must be a number above 0 |
| Value on a KNOWN player | `Chelsea,C. Palmer,20` | `Chelsea,C. Palmer,20,,999,GK` | Ignores the 999 and GK; the game's real stats win. Don't add them |
| Same player twice | `Chelsea,C. Palmer,20` only | `Chelsea,C. Palmer,20` and `Arsenal,C. Palmer,20` | **Does NOT warn.** He goes to whichever manager joins last and the other team silently loses him |
| Misspelt player | `Arsenal,B. Saka,7` | `Arsenal,B. Sakka,7` or an invented name | **Does NOT warn.** The player is created with average stats, not the real ones |
| Club spelling | `Atletico Madrid` | — | `atletico madrid` and `ATLÉTICO MADRID` count as the same club |
| Only one team | two or more teams | a file with one club | Rejects the file: needs at least 2 clubs |

## A COMPLETE FILE (season 1, 3 teams, 2 pool players)

The structure to copy. In a real file each squad is the full first team, roughly 22–30 players; this one is short only to show the shape.

```csv
tournament,Friday Night League
season,1
budgetStep,0

## TEAMS
club,finishingPosition
Chelsea,
Atletico Madrid,
Arsenal,

## SQUADS
club,player,number
Chelsea,C. Palmer,20
Chelsea,M. Caicedo,25
Chelsea,E. Fernandez,8
Atletico Madrid,J. Alvarez,19
Atletico Madrid,Pablo Barrios,24
Arsenal,B. Saka,7
Arsenal,M. Odegaard,8

## POOL
club,player,number
Liverpool,F. Wirtz,7
Liverpool,A. Isak,9
```

For season 2 the TEAMS section changes to unique positions and the top lines change; everything else stays the same:

```csv
tournament,Friday Night League
season,2
budgetStep,0

## TEAMS
club,finishingPosition
Chelsea,1
Atletico Madrid,3
Arsenal,2
```

## BEFORE YOU ANSWER — CHECK

- [ ] Starts with the three top lines, then `## TEAMS`, then `## SQUADS`.
- [ ] 2 to 10 teams; every club in SQUADS is in TEAMS with identical spelling.
- [ ] Season 1: finishingPosition empty for all. Season 2+: unique whole numbers for all.
- [ ] **No player appears twice anywhere in the file** (search each name).
- [ ] Every name is spelled the way FC 26 spells it; empty shirt number where unsure.
- [ ] Only the CSV in one code block — no comments, no quotes, no explanations.
