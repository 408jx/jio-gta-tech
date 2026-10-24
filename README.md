# Jios Street Fights

A 2D platform fighter in plain JavaScript and HTML canvas. Hit your opponent to raise their damage %, then knock them off the stage. No build step, no dependencies. All characters, art and code are original.

## Play

Open `index.html` in a browser, or run a local server:

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

## How a match works

- Everyone starts at **0%** with **3 stocks**.
- Every hit adds damage %. The higher a fighter's %, the farther hits launch them.
- Get launched past the edge of the screen (or fall off the stage) and you lose a stock and respawn at 0%.
- Last fighter with a stock wins.
- Heavy fighters are harder to launch, light fighters fly farther.

## Controls

| Action       | Player 1 | Player 2 |
|--------------|----------|----------|
| Move         | A / D    | Left / Right |
| Jump         | W        | Up |
| Crouch / fast fall | S  | Down |
| Punch        | F        | K |
| Kick         | G        | L |
| Special      | H        | ; |
| Up special   | W + H    | Up + ; |

- Press jump again in the air for a **double jump** (Volt has two air jumps).
- **Up special** is each fighter's recovery move. You get one per trip through the air, and it resets when you land.
- Hold **back** (away from your opponent) to block.
- **Down + Kick** on the ground is a low kick.
- On a floating platform, press **Down** to drop through it.
- `Esc` returns to the menu, `F1` shows hitboxes.

## Characters

| Fighter | Style      | Special       | Up special |
|---------|------------|---------------|------------|
| Ember   | All-rounder| Fireball      | Flame Rise |
| Tide    | Zoner      | Water Shot    | Geyser (drifts far sideways) |
| Volt    | Speedster  | Lightning Dash| Zap Warp (teleport) |
| Stone   | Heavy      | Quake Stomp (ground shockwave) | Rock Spin |

## Stages

Sunset City, Sky Islands, Neon Rooftops (deadly gap), Moon Base (low gravity), Magma Pit, Mountain Dojo.

## Publish on GitHub

Upload `index.html`, `game.js` and `README.md` to a public repository, then turn on **Settings -> Pages -> Deploy from branch -> main / (root)**. The game will be live at `https://<your-username>.github.io/<repo-name>/`.

## Adding your own

- **Character:** add an entry to `CHARS` in `game.js` and, if it has new specials, add them to `MOVES`.
- **Stage:** add an entry to `STAGES` with a background function and a list of platforms (`solid: true` platforms have walls and can't be dropped through).
