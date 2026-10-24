# Jios Street Fights

A tiny 2D fighting game in the spirit of the classic arcade fighters, written in plain JavaScript and HTML canvas. No build step, no dependencies. All characters, art and code are original.

## Play

Open `index.html` in a browser, or run a local server:

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Controls

| Action  | Player 1 | Player 2 |
|---------|----------|----------|
| Move    | A / D    | Left / Right |
| Jump    | W        | Up |
| Crouch  | S        | Down |
| Punch   | F        | K |
| Kick    | G        | L |
| Fireball| H        | ; |

- Hold **back** (away from the opponent) to block.
- **Down + Kick** is a low kick.
- First to 2 round wins takes the match. `Esc` returns to the menu, `F1` shows hitboxes.

## Publish on GitHub

```
git init
git add .
git commit -m "Initial commit: Ember vs Tide"
gh repo create ember-vs-tide --public --source=. --push
```

To get a playable link: repo **Settings -> Pages -> Deploy from branch -> main / (root)**. The game will be live at `https://<your-username>.github.io/ember-vs-tide/`.

Add a `LICENSE` file (MIT is a common choice) before sharing.

## Ideas for next steps

- More characters: add entries to the fighter setup in `game.js` with different move data (`ATK`).
- Combo counter, super meter, throws, and a dash.
- Sprite sheets in place of the drawn shapes (use art you made or have licensed).
- Gamepad support and online play.
