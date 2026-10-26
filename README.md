# Jios Street Fights

A 2D platform fighter for **up to 6 players**, written in plain JavaScript and HTML canvas. Hit your opponents to raise their damage %, then knock them off the stage. Works with keyboards and game controllers, and every key and button can be remapped in the game. No build step, no dependencies. All characters, art and code are original.

## Play

Open `index.html` in a browser, or run a local server:

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Game modes

From the main menu (use W / S or the arrow keys + Enter, a number key, or a controller's D-pad + A):

1. **1 Player** - you against the computer
2. **2 Players** - two humans
3. **Up to 6 Players** - lobby where each slot is Human, Computer or Off
4. **Controls & settings** - remap keys and buttons

If you start a game by pressing **A on a controller**, that controller becomes Player 1 automatically.

Every fighter is on their own (free-for-all). The camera zooms out automatically to keep everyone in view.

## How a match works

- Everyone starts at **0%** with **3 stocks**.
- Every hit adds damage %. The higher a fighter's %, the farther hits launch them.
- Get launched past the edge of the world (or fall off the stage) and you lose a stock and respawn at 0%.
- Last fighter with a stock wins.
- Heavy fighters are harder to launch, light fighters fly farther.
- **Esc** (or **Start** on a controller) pauses. From the pause menu you can resume, change controls, or quit.

## Controllers

Any gamepad your browser recognizes works (Xbox, PlayStation, Switch Pro and most generic pads). Plug it in and **press any button once** so the browser sees it. Up to 4 gamepads and 2 keyboard layouts can be used at the same time.

In the lobby, each Human slot has a controller you can change: **Left / Right** (or **Z X C V B N** for slots 1-6) cycles through Keyboard 1, Keyboard 2 and Gamepad 1-4. Two humans can't share the same controller, and the lobby tells you if a chosen gamepad isn't connected.

Default gamepad buttons (Xbox naming):

| Action | Button |
|--------|--------|
| Move | Left stick or D-pad |
| Jump | A, or stick / D-pad up |
| Punch | X |
| Kick | Y |
| Special | B |
| Up special | hold Up + Special |
| Pause | Start |

## Custom controls

Open **Controls & settings** from the main menu, or **Pause -> Controls** during a match.

- **Left / Right** switches between **Keyboard 1**, **Keyboard 2** and **Gamepad**.
- **Up / Down** picks an action, **Enter** (or **A**) starts changing it, then press the new key or button. **Esc** cancels.
- If the new key or button is already used by another action, the two actions swap.
- **Reset this tab to defaults** is the last row of each tab.
- Changes are saved in your browser automatically, so they are still there next time. (They are per browser and per website address.)

Default keyboard layouts:

| Action       | Keyboard 1 (P1) | Keyboard 2 (P2) |
|--------------|-----------------|-----------------|
| Move         | A / D           | Left / Right    |
| Jump         | W               | Up              |
| Crouch / fast fall / drop through | S | Down     |
| Punch        | F               | K               |
| Kick         | G               | L               |
| Special      | H               | ;               |
| Up special   | W + H           | Up + ;          |

- Press jump again in the air for a **double jump** (Volt has two, Gale has three).
- **Up special** is each fighter's recovery move. You get one per trip through the air, and it resets when you land.
- Hold **back** (away from your opponent) to block.
- **Down + Kick** on the ground is a low kick.
- On a floating platform, press **Down** to drop through it.
- `F1` shows hitboxes.

## Characters

| Fighter | Style      | Special        | Up special |
|---------|------------|----------------|------------|
| Ember   | All-rounder| Fireball       | Flame Rise |
| Tide    | Zoner      | Water Shot     | Geyser (drifts far sideways) |
| Volt    | Speedster  | Lightning Dash | Zap Warp (teleport) |
| Stone   | Heavy      | Quake Stomp (ground shockwave) | Rock Spin |
| Frost   | Trapper    | Ice Shard (arcing)  | Ice Lift (tall) |
| Gale    | Floaty     | Gust (pushes foes)  | Tornado (wide) |
| Shade   | Assassin   | Shadow Step (teleport forward) | Vanish (warp up) |
| Bloom   | Bruiser    | Seed Bomb (arcing, heavy) | Vine Spring |

## Stages

Sunset City, Sky Islands, Neon Rooftops (deadly gap), Moon Base (low gravity), Magma Pit, Mountain Dojo, Frozen Peak. All are laid out in a 1600 x 900 world.

## Publish on GitHub

Upload `index.html`, `game.js` and `README.md` to a public repository, then turn on **Settings -> Pages -> Deploy from branch -> main / (root)**. The game will be live at `https://<your-username>.github.io/<repo-name>/`.

## Adding your own

- **Character:** add an entry to `CHARS` in `game.js` and, if it has new specials, add them to `MOVES`.
- **Stage:** add an entry to `STAGES` with a background function and a list of platforms in world units (`solid: true` platforms have walls and can't be dropped through).
- **Default controls:** edit `DEFAULT_BINDS` near the top of `game.js`. Players who already saved their own controls keep those until they press Reset.
- **Character size on screen:** the world is 1600 x 900 and the camera zoom is clamped in `camTarget()` (currently 0.5 to 0.85). Lower those numbers to make everyone smaller, raise them to make everyone bigger.
