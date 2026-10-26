'use strict';
// JIOS STREET FIGHTS - an original platform fighter for up to 6 players. No dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 960, H = 540;              // screen size
const WW = 1600, WH = 900;           // world size (the camera zooms out to fit everyone)
const BLAST = { l: -350, r: WW + 350, t: -350, b: WH + 300 };   // leave this box and you lose a stock
const BGY = 470;                     // horizon used by the backdrops
const MAXP = 6;
const SLOT_COLORS = ['#ff5a4a', '#4aa8ff', '#4ee36b', '#ffd24a', '#d36bff', '#ff9a3c'];

// ---------- input ----------
const keys = {}, prev = {};
let lastKey = null;           // most recent key pressed (used when rebinding controls)
addEventListener('keydown', e => {
  keys[e.code] = true; lastKey = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const wasHit = c => !!keys[c] && !prev[c];

const DEFAULT_BINDS = {
  kb1: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyF', kick: 'KeyG', special: 'KeyH' },
  kb2: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'KeyK', kick: 'KeyL', special: 'Semicolon' },
  pad: { jump: 0, punch: 2, kick: 3, special: 1 },          // gamepad button numbers (stick / D-pad always move)
};
const BIND_KEY = 'jsf_controls_v1';
const binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));    // edited in place so devices always see the latest
function loadBinds() {
  try {
    const o = JSON.parse(localStorage.getItem(BIND_KEY) || 'null');
    if (o) for (const k of ['kb1', 'kb2', 'pad']) if (o[k]) for (const a in binds[k]) if (o[k][a] !== undefined) binds[k][a] = o[k][a];
  } catch (e) { /* no saved controls */ }
}
function saveBinds() { try { localStorage.setItem(BIND_KEY, JSON.stringify(binds)); } catch (e) { /* storage blocked */ } }
loadBinds();

const ACTIONS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'special', 'ok'];
const NO_RAW = { left: false, right: false, up: false, down: false, punch: false, kick: false, special: false, ok: false };
const getPads = () => { try { return (typeof navigator !== 'undefined' && navigator.getGamepads) ? Array.from(navigator.getGamepads()) : []; } catch (e) { return []; } };

// A device is a keyboard layout or a gamepad. poll() once per frame gives held + just-pressed ("...Hit") flags.
class Device {
  constructor(kind, arg, name) {
    this.kind = kind; this.arg = arg; this.name = name;
    this.prev = { ...NO_RAW }; this.raw = { ...NO_RAW }; this.connected = kind === 'kb'; this.cur = this.mk(NO_RAW);
  }
  poll() {
    let r = null;
    if (this.kind === 'kb') { r = {}; for (const a of ACTIONS) r[a] = !!keys[this.arg[a]]; }
    else {
      const gp = getPads()[this.arg];
      if (gp && gp.connected) {
        const ax = gp.axes, b = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
        const bp = binds.pad;
        r = { left: ax[0] < -0.5 || b(14), right: ax[0] > 0.5 || b(15), up: ax[1] < -0.6 || b(12) || b(bp.jump), down: ax[1] > 0.6 || b(13),
              punch: b(bp.punch), kick: b(bp.kick), special: b(bp.special), ok: b(0) };
      }
    }
    this.connected = !!r; this.raw = r || NO_RAW; this.cur = this.mk(this.raw);
  }
  mk(r) { const o = { ...r }; for (const a of ACTIONS) o[a + 'Hit'] = r[a] && !this.prev[a]; return o; }
  commit() { this.prev = this.raw; }
}
const devices = [
  new Device('kb', binds.kb1, 'Keyboard 1'), new Device('kb', binds.kb2, 'Keyboard 2'),
  new Device('pad', 0, 'Gamepad 1'), new Device('pad', 1, 'Gamepad 2'), new Device('pad', 2, 'Gamepad 3'), new Device('pad', 3, 'Gamepad 4'),
];
const fighterInput = o => ({ left: o.left, right: o.right, up: o.up, down: o.down, upHit: o.upHit, punch: o.punchHit, kick: o.kickHit, special: o.specialHit });
const NEUTRAL = { left: false, right: false, up: false, down: false, upHit: false, punch: false, kick: false, special: false };

// Which device (keyboard 1/2 or gamepad 1-4) controls each player slot. Change it in the lobby.
let slotDev = [0, 1, 2, 3, 4, 5];
const devOf = slot => devices[slotDev[slot]];
const connectedPads = () => getPads().filter(g => g && g.connected);

// Menu input from every connected gamepad at once (works before anyone has picked a slot).
const menuIn = { l: false, r: false, u: false, d: false, ok: false, back: false, start: false, btn: -1, okPad: -1 };
const mpPrev = {}, btnPrev = {};
function pollMenuPad() {
  const raw = { l: false, r: false, u: false, d: false, ok: false, back: false, start: false };
  menuIn.btn = -1; menuIn.okPad = -1;
  const pads = getPads();
  for (let gi = 0; gi < pads.length; gi++) {
    const gp = pads[gi];
    if (!gp || !gp.connected) continue;
    const ax = gp.axes, b = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
    const mine = { l: ax[0] < -0.5 || b(14), r: ax[0] > 0.5 || b(15), u: ax[1] < -0.6 || b(12), d: ax[1] > 0.6 || b(13), ok: b(0), back: b(1), start: b(9) };
    for (const k in mine) raw[k] = raw[k] || mine[k];
    const pb = btnPrev[gi] || (btnPrev[gi] = []), was = pb.slice();
    for (let n = 0; n < gp.buttons.length; n++) {
      const down = b(n);
      if (down && !was[n]) { if (menuIn.btn < 0) menuIn.btn = n; if (n === 0 && menuIn.okPad < 0) menuIn.okPad = gi; }
      pb[n] = down;
    }
  }
  for (const k in raw) { menuIn[k] = raw[k] && !mpPrev[k]; mpPrev[k] = raw[k]; }
}
function nav() {                                  // menu navigation from keyboard + any gamepad
  return {
    l: wasHit('ArrowLeft') || wasHit('KeyA') || menuIn.l, r: wasHit('ArrowRight') || wasHit('KeyD') || menuIn.r,
    u: wasHit('ArrowUp') || wasHit('KeyW') || menuIn.u, d: wasHit('ArrowDown') || wasHit('KeyS') || menuIn.d,
    ok: wasHit('Enter') || wasHit('Space') || menuIn.ok, back: wasHit('Escape') || menuIn.back,
  };
}

// names for the controls screen
const BTN_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L-Stick', 'R-Stick', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home'];
const btnName = n => (BTN_NAMES[n] !== undefined ? BTN_NAMES[n] : 'Button ' + n);
const KEY_NAMES = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Semicolon: ';', Quote: "'", Comma: ',', Period: '.',
  Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Space: 'Space', ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace' };
function keyName(c) {
  if (!c) return '-';
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (KEY_NAMES[c]) return KEY_NAMES[c];
  if (/^Numpad/.test(c)) return 'Num ' + c.slice(6);
  return c;
}

// ---------- audio ----------
let actx;
function beep(freq, dur = 0.08, type = 'square', vol = 0.05) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(actx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur); o.stop(actx.currentTime + dur);
  } catch (e) { /* audio not available */ }
}

// ---------- game state ----------
let state = 'menu', stateT = 0, frameN = 0, hitstop = 0, shake = 0, debug = false;
let slotType = ['human', 'cpu', 'off', 'off', 'off', 'off'];       // per slot: human | cpu | off
let selChar = [0, 1, 2, 3, 4, 5], ready = [false, false, false, false, false, false];
let lastSel = 0, cpuT = 0, goT = 0, lobbyMsg = '', stageIdx = 0;
let menuCur = 0, pauseCur = 0, pauseFrom = 'fight', fromLobby = false, lobbyCur = 0;
let ctlTab = 0, ctlRow = 0, ctlWait = false, ctlMsg = '', controlsReturn = 'menu';
let stage = { platforms: [], grav: 0.85 };
let fighters = [];
const fireballs = [], particles = [];
const cam = { x: WW / 2, y: WH / 2, z: 0.6 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- moves ----------
// Knockback speed = (base + growth * victim's percent) / victim's weight.   angle: 0 = sideways, 90 = straight up.
const MOVES = {
  punch: { kind: 'melee', startup: 4, active: 4, recover: 9, dmg: 5, base: 4.0, growth: 0.075, angle: 30, reach: 68, y: -132, h: 32 },
  kick:  { kind: 'melee', startup: 8, active: 5, recover: 15, dmg: 9, base: 5.5, growth: 0.10, angle: 35, reach: 96, y: -88, h: 40 },
  low:   { kind: 'melee', startup: 7, active: 4, recover: 13, dmg: 7, base: 4.5, growth: 0.08, angle: 50, reach: 92, y: -32, h: 30 },
  // Ember
  fireball:  { kind: 'proj', startup: 14, active: 0, recover: 26, cd: 60,
               proj: { speed: 7, vy: 0, grav: 0, r: 16, dmg: 6, base: 4.5, growth: 0.06, angle: 25, life: 140, sx: 52, sy: -95 } },
  flameRise: { kind: 'rise', startup: 5, active: 14, recover: 16, dmg: 9, base: 7, growth: 0.12, angle: 80, reach: 56, y: -210, h: 170, rise: -15, drift: 2.5 },
  // Tide
  waterShot: { kind: 'proj', startup: 12, active: 0, recover: 22, cd: 36,
               proj: { speed: 11, vy: 0, grav: 0, r: 12, dmg: 4, base: 6, growth: 0.04, angle: 8, life: 90, sx: 50, sy: -70 } },
  geyser:    { kind: 'rise', startup: 6, active: 14, recover: 16, dmg: 7, base: 5.5, growth: 0.09, angle: 78, reach: 50, y: -200, h: 160, rise: -13.5, drift: 5 },
  // Volt
  lightDash: { kind: 'dash', startup: 6, active: 12, recover: 14, cd: 45, dmg: 8, base: 5, growth: 0.08, angle: 30, reach: 70, y: -140, h: 90, speed: 14 },
  zapWarp:   { kind: 'warp', startup: 8, active: 6, recover: 12, dmg: 6, base: 5, growth: 0.07, angle: 60, reach: 60, y: -160, h: 150, both: true, warpY: -190, warpX: 120, inv: true },
  // Stone
  quake:     { kind: 'melee', startup: 18, active: 4, recover: 24, cd: 50, dmg: 13, base: 8, growth: 0.13, angle: 62, reach: 150, y: -40, h: 40, both: true, groundOnly: true },
  rockSpin:  { kind: 'rise', startup: 6, active: 16, recover: 16, dmg: 11, base: 6, growth: 0.10, angle: 75, reach: 70, y: -175, h: 150, both: true, rise: -12.5, drift: 2 },
  // Frost
  iceShard:  { kind: 'proj', startup: 13, active: 0, recover: 24, cd: 44,
               proj: { speed: 8, vy: -2.5, grav: 0.14, r: 13, dmg: 5, base: 5, growth: 0.07, angle: 40, life: 120, sx: 50, sy: -90 } },
  iceLift:   { kind: 'rise', startup: 6, active: 14, recover: 16, dmg: 8, base: 6, growth: 0.10, angle: 85, reach: 50, y: -200, h: 160, rise: -15.5, drift: 1.5 },
  // Gale
  gust:      { kind: 'proj', startup: 10, active: 0, recover: 20, cd: 30,
               proj: { speed: 9.5, vy: 0, grav: 0, r: 20, dmg: 2, base: 8, growth: 0.03, angle: 6, life: 55, sx: 50, sy: -80 } },
  tornado:   { kind: 'rise', startup: 5, active: 18, recover: 14, dmg: 6, base: 5, growth: 0.08, angle: 70, reach: 60, y: -190, h: 160, both: true, rise: -11, drift: 6.5 },
  // Shade
  shadowStep: { kind: 'warp', startup: 6, active: 6, recover: 14, cd: 50, dmg: 8, base: 5.5, growth: 0.09, angle: 35, reach: 70, y: -150, h: 120, warpX: 210, warpY: 0, fwd: true, inv: true },
  vanish:    { kind: 'warp', startup: 8, active: 6, recover: 12, dmg: 5, base: 4, growth: 0.06, angle: 70, reach: 60, y: -170, h: 150, both: true, warpY: -200, warpX: 90, inv: true },
  // Bloom
  seedBomb:  { kind: 'proj', startup: 16, active: 0, recover: 28, cd: 70,
               proj: { speed: 5.5, vy: -6, grav: 0.3, r: 15, dmg: 9, base: 6.5, growth: 0.11, angle: 55, life: 120, sx: 46, sy: -100 } },
  vineSpring: { kind: 'rise', startup: 7, active: 16, recover: 18, dmg: 9, base: 6.5, growth: 0.11, angle: 80, reach: 55, y: -210, h: 170, rise: -14, drift: 3 },
};

const CHARS = [
  { id: 'ember', name: 'EMBER', tag: 'All-rounder', color: '#e0533a', dark: '#7d2a20', accent: '#ffd24a', look: 'band',
    size: 1, build: 1, speed: 3.8, jump: 17, airJumps: 1, weight: 1.0, power: 1.0, sN: 'fireball', sU: 'flameRise',
    nName: 'Fireball', uName: 'Flame Rise', info: 'Balanced. Fireball for range, Flame Rise to recover.' },
  { id: 'tide', name: 'TIDE', tag: 'Zoner', color: '#3a9be0', dark: '#1f4f7d', accent: '#7dffe0', look: 'fin',
    size: 1, build: 1, speed: 4.2, jump: 17.5, airJumps: 1, weight: 0.92, power: 0.95, sN: 'waterShot', sU: 'geyser',
    nName: 'Water Shot', uName: 'Geyser', info: 'Fast water shots keep foes away. Geyser drifts far sideways.' },
  { id: 'volt', name: 'VOLT', tag: 'Speedster', color: '#e8c230', dark: '#8a6f12', accent: '#7df3ff', look: 'spikes',
    size: 0.95, build: 0.9, speed: 5.0, jump: 16, airJumps: 2, weight: 0.8, power: 0.85, sN: 'lightDash', sU: 'zapWarp',
    nName: 'Lightning Dash', uName: 'Zap Warp', info: 'Very fast, two air jumps, but light. Teleports to recover.' },
  { id: 'stone', name: 'STONE', tag: 'Heavy', color: '#9a7b52', dark: '#4a3d2a', accent: '#ff9a3c', look: 'helmet',
    size: 1.18, build: 1.25, speed: 3.0, jump: 15, airJumps: 1, weight: 1.45, power: 1.3, sN: 'quake', sU: 'rockSpin',
    nName: 'Quake Stomp', uName: 'Rock Spin', info: 'Slow and huge, hits very hard and is hard to launch.' },
  { id: 'frost', name: 'FROST', tag: 'Trapper', color: '#8fd8ff', dark: '#3f6f96', accent: '#ffffff', look: 'snow',
    size: 1, build: 1, speed: 3.6, jump: 16.5, airJumps: 1, weight: 1.1, power: 1.0, sN: 'iceShard', sU: 'iceLift',
    nName: 'Ice Shard', uName: 'Ice Lift', info: 'Icicles arc through the air. Ice Lift shoots straight up.' },
  { id: 'gale', name: 'GALE', tag: 'Floaty', color: '#6fd67c', dark: '#2f7a45', accent: '#e8ffd9', look: 'swirl',
    size: 0.95, build: 0.85, speed: 4.8, jump: 17.5, airJumps: 3, weight: 0.72, power: 0.8, sN: 'gust', sU: 'tornado',
    nName: 'Gust', uName: 'Tornado', info: 'Three air jumps and a wide-sweeping Tornado, but very light.' },
  { id: 'shade', name: 'SHADE', tag: 'Assassin', color: '#6a4cc8', dark: '#2c1f5e', accent: '#ff4a9a', look: 'hood',
    size: 0.97, build: 0.9, speed: 4.4, jump: 16.5, airJumps: 1, weight: 0.88, power: 1.05, sN: 'shadowStep', sU: 'vanish',
    nName: 'Shadow Step', uName: 'Vanish', info: 'Teleports forward through attacks. Vanish warps up to recover.' },
  { id: 'bloom', name: 'BLOOM', tag: 'Bruiser', color: '#ff8fc2', dark: '#a63e76', accent: '#ffe45e', look: 'leaf',
    size: 1.05, build: 1.1, speed: 3.4, jump: 16, airJumps: 1, weight: 1.15, power: 1.1, sN: 'seedBomb', sU: 'vineSpring',
    nName: 'Seed Bomb', uName: 'Vine Spring', info: 'Lobs heavy seed bombs in an arc. Solid weight and punch.' },
];

// ---------- fighters ----------
const findPlatform = sp => stage.platforms.find(p => p.y === sp.y && sp.x >= p.x && sp.x <= p.x + p.w) || null;

class Fighter {
  constructor(slot) {
    this.slot = slot; this.label = 'P' + (slot + 1); this.tagColor = SLOT_COLORS[slot]; this.ai = false;
    this.stocks = 3; this.pct = 0; this.shownPct = 0; this.pctBump = 0;
    this.setChar(CHARS[0]);
    this.reset({ x: 0, y: 0 }, 1);
  }
  setChar(c) { Object.assign(this, c); }
  reset(sp, facing) {
    this.x = sp.x; this.y = sp.y; this.px = this.x; this.py = this.y;
    this.vx = 0; this.vy = 0; this.facing = facing;
    this.hitstun = 0; this.blockstun = 0; this.atk = null; this.crouch = false; this.blocking = false;
    this.cool = 0; this.flash = 0; this.invuln = 0; this.out = false; this.respawnT = 0;
    this.platform = findPlatform(sp); this.onGround = !!this.platform; this.dropT = 0;
    this.jumpsLeft = this.airJumps; this.upUsed = false;
    this.buf = { punch: 0, kick: 0, special: 0 };
  }
  respawn() {
    const n = fighters.length, i = Math.max(0, fighters.indexOf(this));
    this.reset({ x: WW / 2 + (i - (n - 1) / 2) * 110, y: -20 }, 1);
    this.onGround = false; this.platform = null; this.invuln = 150; this.pct = 0; this.shownPct = 0;
  }
  get box() {
    const S = this.size, h = (this.crouch && this.onGround ? 105 : 165) * S;
    return { x: this.x - 24 * S, y: this.y - h, w: 48 * S, h };
  }
  startAtk(name, inp) {
    const m = MOVES[name];
    if (m.groundOnly && !this.onGround) return;
    this.atk = { ...m, name, t: 0, hits: new Set(), dirx: inp ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0 };
    if (this.onGround) this.vx = 0;
    if (m.cd) this.cool = m.cd;
    if (name === this.sU) this.upUsed = true;
    this.buf.punch = this.buf.kick = this.buf.special = 0;
    beep(m.kind === 'melee' ? 180 : 300, 0.05, 'triangle', 0.04);
  }
  physics() {
    const S = this.size, bodyH = 165 * S;
    if (this.onGround && this.platform) {        // walked off the edge -> fall
      const p = this.platform;
      if (this.x < p.x - 8 || this.x > p.x + p.w + 8) { this.platform = null; this.onGround = false; this.vy = 0; }
    }
    if (!this.onGround) {
      this.vy = Math.min(this.vy + stage.grav, 16);
      this.y += this.vy;
      for (const p of stage.platforms) {
        const within = this.x >= p.x - 8 && this.x <= p.x + p.w + 8;
        if (this.vy >= 0 && within && this.py <= p.y && this.y >= p.y && !(this.dropT > 0 && !p.solid)) {
          this.y = p.y; this.vy = 0; this.onGround = true; this.platform = p;
          if (this.hitstun === 0) this.vx = 0;
          break;
        }
        if (p.solid) {                           // bonk your head on the underside of a solid stage
          const bottom = p.y + p.h, head = this.y - bodyH, pHead = this.py - bodyH;
          if (this.vy < 0 && within && pHead >= bottom && head < bottom) { this.y = bottom + bodyH; this.vy = 0; }
        }
      }
    }
    for (const p of stage.platforms) {           // solid stage sides are walls
      if (!p.solid) continue;
      const bottom = p.y + p.h, head = this.y - bodyH, half = 24 * S;
      if (this.y > p.y + 6 && head < bottom && this.x > p.x - half && this.x < p.x + p.w + half) {
        this.x = this.px <= p.x + p.w / 2 ? p.x - half : p.x + p.w + half;
        this.vx = 0;
      }
    }
    if (this.dropT > 0) this.dropT--;
  }
  update(inp, opp) {
    this.px = this.x; this.py = this.y;
    if (this.cool > 0) this.cool--;
    if (this.flash > 0) this.flash--;
    if (this.invuln > 0) this.invuln--;
    if (this.pctBump > 0) this.pctBump--;
    if (this.hitstun > 0 || this.blockstun > 0) {
      if (this.hitstun > 0) this.hitstun--; else this.blockstun--;
      this.blocking = false; this.crouch = false;
      this.x += this.vx; this.vx *= this.onGround ? 0.8 : 0.995;
      this.physics(); return;
    }
    const grounded = this.onGround;
    const dirIn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (!this.atk) {
      const soft = !!this.platform && !this.platform.solid;
      if (grounded) {
        this.jumpsLeft = this.airJumps; this.upUsed = false;
        if (opp) this.facing = opp.x > this.x ? 1 : -1;
        this.crouch = inp.down && !soft;
        this.vx = this.crouch ? 0 : dirIn * this.speed;
        if (soft && inp.down) { this.platform = null; this.onGround = false; this.vy = 2; this.dropT = 14; this.y += 1; }   // drop through
        else if (inp.up && !this.crouch && !inp.special) { this.vy = -this.jump; this.onGround = false; this.platform = null; this.vx = dirIn * this.speed * 1.1; }
        this.blocking = this.facing === 1 ? inp.left : inp.right;
      } else {
        this.blocking = false; this.crouch = false;
        this.vx += dirIn ? (dirIn * this.speed * 1.1 - this.vx) * 0.14 : -this.vx * 0.02;     // air drift
        if (inp.upHit && this.jumpsLeft > 0) {                                                  // double jump
          this.jumpsLeft--; this.vy = -this.jump * 0.95; this.vx = dirIn ? dirIn * this.speed * 1.1 : this.vx * 0.5;
          spark(this.x, this.y, '#fff', 8); beep(520, 0.06, 'sine', 0.05);
        }
        if (inp.down && this.vy > 0) this.vy = Math.min(this.vy + 0.5, 16);                      // fast fall
      }
      if (inp.special) {
        if (inp.up) { if (grounded || !this.upUsed) this.startAtk(this.sU, inp); }
        else if (this.cool === 0) this.startAtk(this.sN, inp);
      } else if (inp.kick) this.startAtk(this.crouch && grounded ? 'low' : 'kick', inp);
      else if (inp.punch) this.startAtk('punch', inp);
    } else {
      this.blocking = false;
      const a = this.atk; a.t++;
      const act = a.t >= a.startup && a.t < a.startup + a.active;
      if (a.kind === 'proj') {
        if (grounded) this.vx = 0;
        if (a.t === a.startup) {
          const pr = a.proj;
          fireballs.push({ x: this.x + this.facing * pr.sx * this.size, y: this.y + pr.sy * this.size, vx: this.facing * pr.speed, vy: pr.vy, grav: pr.grav, owner: this, r: pr.r, p: pr, life: pr.life });
        }
      } else if (a.kind === 'rise') {
        if (a.t === a.startup) { this.vy = a.rise; this.onGround = false; this.platform = null; spark(this.x, this.y - 20, this.accent, 8); }
        if (act) this.vx = dirIn * a.drift;
      } else if (a.kind === 'dash') {
        if (act) { this.vx = this.facing * a.speed; if (!this.onGround) this.vy = 0; }
        else if (a.t === a.startup + a.active) this.vx *= 0.3;
        else if (grounded && a.t < a.startup) this.vx = 0;
      } else if (a.kind === 'warp') {
        if (a.t === a.startup) {
          spark(this.x, this.y - 80, this.accent, 12);
          this.x += a.fwd ? this.facing * a.warpX : a.dirx * a.warpX; this.y += a.warpY;
          this.vy = 0; this.vx = 0; this.onGround = false; this.platform = null;
          spark(this.x, this.y - 80, this.accent, 12); beep(900, 0.08, 'sine', 0.06);
        }
      } else if (grounded) this.vx = 0;
      else this.vx *= 0.98;
      if (a.t >= a.startup + a.active + a.recover) this.atk = null;
    }
    this.x += this.vx;
    this.physics();
  }
}

const previews = CHARS.map(c => { const f = new Fighter(0); f.setChar(c); f.onGround = true; return f; });

// ---------- helpers ----------
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function hitboxOf(f, k) {
  const s = f.size;
  if (k.both) return { x: f.x - k.reach * s, y: f.y + k.y * s, w: k.reach * 2 * s, h: k.h * s };
  const x = f.facing === 1 ? f.x + 12 * s : f.x - 12 * s - k.reach * s;
  return { x, y: f.y + k.y * s, w: k.reach * s, h: k.h * s };
}
function spark(x, y, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 14 + Math.random() * 10, color });
  }
}
const alive = () => fighters.filter(f => f.stocks > 0);
function nearestOpp(f) {
  let best = null, bd = 1e9;
  for (const o of fighters) {
    if (o === f || o.out || o.stocks <= 0) continue;
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y) * 0.5;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// m = move (or projectile) data with dmg/base/growth/angle
function landHit(a, d, m, px, py) {
  if (d.out || d.invuln > 0 || (d.atk && d.atk.inv && d.atk.t < d.atk.startup + d.atk.active)) return false;
  const dir = a.x < d.x ? 1 : -1;
  if (d.blocking && d.onGround && d.facing === -dir) {            // blocked: no damage
    d.blockstun = 10; d.vx = dir * (2.5 + m.base * 0.25);
    spark(px, py, '#9fe8ff', 6); beep(120, 0.06, 'square', 0.05); hitstop = Math.max(hitstop, 3);
    return true;
  }
  const dmg = m.dmg * a.power;
  d.pct += dmg; d.pctBump = 12;
  const speed = (m.base + m.growth * d.pct) / d.weight;           // more % = flies further
  const ang = m.angle * Math.PI / 180;
  d.vx = dir * Math.cos(ang) * speed; d.vy = -Math.sin(ang) * speed;
  d.hitstun = Math.floor(8 + speed * 1.3); d.atk = null; d.flash = 6; d.crouch = false;
  if (d.vy < -0.5) { d.onGround = false; d.platform = null; }
  spark(px, py, '#ffb347', 10 + Math.min(14, Math.floor(speed))); beep(90, 0.1, 'sawtooth', 0.07);
  hitstop = Math.max(hitstop, Math.min(12, 4 + Math.floor(dmg / 3)));
  shake = Math.min(14, 3 + speed / 2);
  return true;
}

function resolveHits() {
  const hits = [];
  for (const a of fighters) {
    const k = a.atk;
    if (a.out || !k || k.kind === 'proj') continue;
    if (k.t < k.startup || k.t >= k.startup + k.active) continue;
    const hb = hitboxOf(a, k);
    for (const d of fighters) {
      if (d === a || d.out || k.hits.has(d)) continue;
      if (overlap(hb, d.box)) { k.hits.add(d); hits.push([a, d, k, hb.x + hb.w / 2, hb.y + hb.h / 2]); }
    }
  }
  for (const [a, d, k, px, py] of hits) landHit(a, d, k, px, py);

  for (let i = fireballs.length - 1; i >= 0; i--) {
    const fb = fireballs[i];
    fb.vy += fb.grav; fb.x += fb.vx; fb.y += fb.vy;
    if (--fb.life <= 0 || fb.x < BLAST.l || fb.x > BLAST.r || fb.y > BLAST.b || fb.y < BLAST.t) { fireballs.splice(i, 1); continue; }
    const box = { x: fb.x - fb.r, y: fb.y - fb.r, w: fb.r * 2, h: fb.r * 2 };
    for (const d of fighters) {
      if (d === fb.owner || d.out) continue;
      if (overlap(box, d.box) && landHit(fb.owner, d, fb.p, fb.x, fb.y)) { fireballs.splice(i, 1); break; }
    }
  }
  for (let i = fireballs.length - 1; i >= 1; i--) {
    for (let j = i - 1; j >= 0; j--) {
      const a = fireballs[i], b = fireballs[j];
      if (a && b && a.owner !== b.owner && Math.abs(a.x - b.x) < 30 && Math.abs(a.y - b.y) < 30) {
        spark((a.x + b.x) / 2, a.y, '#fff', 12); fireballs.splice(i, 1); fireballs.splice(j, 1); break;
      }
    }
  }
}

function pushApart() {
  for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) {
    const a = fighters[i], b = fighters[j];
    if (a.out || b.out || !a.onGround || !b.onGround || Math.abs(a.y - b.y) > 40) continue;
    const d = b.x - a.x, min = 46 * (a.size + b.size) / 2;
    if (Math.abs(d) < min) {
      const push = (min - Math.abs(d)) / 2 * (Math.sign(d) || (i % 2 ? 1 : -1));
      a.x -= push; b.x += push;
    }
  }
}

// ---------- AI ----------
function nearestSolid(x) {
  let best = null, bd = 1e9;
  for (const p of stage.platforms) {
    if (!p.solid) continue;
    const d = Math.abs(p.x + p.w / 2 - x);
    if (d < bd) { bd = d; best = p; }
  }
  return best || stage.platforms[0];
}
function wantSpecial(f, dist) {
  const m = MOVES[f.sN];
  if (m.kind === 'proj') return dist > 200;
  if (m.kind === 'dash') return dist > 150 && dist < 380;
  if (m.fwd) return dist > 120 && dist < 320;
  return dist < 130;
}
function aiInput(f, o) {
  const i = { ...NEUTRAL };
  if (!o) return i;
  const dx = o.x - f.x, dist = Math.abs(dx), tw = dx > 0 ? 'right' : 'left', aw = dx > 0 ? 'left' : 'right';
  const sp = nearestSolid(f.x);
  if (sp && !f.onGround && f.hitstun === 0 && (f.y > sp.y + 10 || f.x < sp.x - 10 || f.x > sp.x + sp.w + 10)) {   // recover
    i[f.x < sp.x + sp.w / 2 ? 'right' : 'left'] = true;
    if (f.y > sp.y - 20 && f.vy > 0 && !f.atk) {
      if (f.jumpsLeft > 0 && Math.random() < 0.25) i.upHit = true;
      else if (f.jumpsLeft === 0 && !f.upUsed && f.y > sp.y + 30) { i.up = true; i.special = true; }
    }
    return i;
  }
  f.aiT = (f.aiT || 0) - 1;
  if (f.aiT <= 0) {
    const r = Math.random();
    f.aiMode = dist > 300 ? (r < 0.3 ? 'zone' : 'approach') : (r < 0.68 ? 'poke' : r < 0.78 ? 'retreat' : r < 0.93 ? 'approach' : 'jump');
    f.aiT = 25 + Math.random() * 35;
  }
  if (o.atk && dist < 150 && !f.atk && Math.random() < 0.05) { f.aiMode = 'block'; f.aiT = 22; }
  const useSp = () => f.cool === 0 && f.onGround && wantSpecial(f, dist) && Math.random() < 0.07;
  switch (f.aiMode) {
    case 'approach': if (dist > 100) i[tw] = true; else f.aiT = 0; break;
    case 'retreat': i[aw] = true; break;
    case 'block': i[aw] = true; break;
    case 'zone': if (useSp()) i.special = true; break;
    case 'jump': if (f.onGround) { i.up = true; i[tw] = true; } break;
    case 'poke':
      if (dist > 110) i[tw] = true;
      else if (Math.random() < 0.12) {
        const r = Math.random();
        if (r < 0.4) i.punch = true; else if (r < 0.75) i.kick = true; else if (!(f.platform && !f.platform.solid)) { i.down = true; i.kick = true; }
      }
      if (useSp()) i.special = true;
      break;
  }
  if (f.onGround && f.platform && f.aiMode !== 'jump') {      // don't walk off the edge
    const p = f.platform;
    if ((i.right && f.x > p.x + p.w - 30) || (i.left && f.x < p.x + 30)) {
      i.left = i.right = false; f.aiMode = 'jump'; f.aiT = 30;
    }
  }
  if (f.platform && !f.platform.solid) i.down = o.y > f.y + 80 && Math.random() < 0.05;
  if (o.y < f.y - 80 && f.onGround && Math.random() < 0.03) { i.up = true; i[tw] = true; }
  return i;
}

function getInput(f) {
  const inp = f.ai ? aiInput(f, nearestOpp(f)) : fighterInput(devOf(f.slot).cur);
  for (const a of ['punch', 'kick', 'special']) {      // small input buffer
    if (inp[a]) f.buf[a] = 6; else if (f.buf[a] > 0) f.buf[a]--;
    inp[a] = f.buf[a] > 0;
  }
  return inp;
}

// ---------- camera ----------
function camTarget() {
  const fs = fighters.filter(f => !f.out);
  if (!fs.length) return { x: WW / 2, y: WH / 2, z: 0.6 };
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const f of fs) { x0 = Math.min(x0, f.x); x1 = Math.max(x1, f.x); y0 = Math.min(y0, f.y - 170); y1 = Math.max(y1, f.y + 20); }
  const bw = x1 - x0 + 520, bh = y1 - y0 + 360;
  const z = clamp(Math.min(W / bw, H / bh), 0.5, 0.85);
  const hw = W / 2 / z, hh = H / 2 / z;
  const lim = (v, lo, hi, mid) => lo > hi ? mid : clamp(v, lo, hi);
  return { x: lim((x0 + x1) / 2, BLAST.l + hw, BLAST.r - hw, WW / 2), y: lim((y0 + y1) / 2, BLAST.t + hh, BLAST.b - hh, WH / 2), z };
}
function snapCamera() { Object.assign(cam, camTarget()); }
function updateCamera() {
  const t = camTarget();
  cam.x += (t.x - cam.x) * 0.09; cam.y += (t.y - cam.y) * 0.09; cam.z += (t.z - cam.z) * 0.06;
}
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });

// ---------- match flow ----------
function makeSpawns(st, n) {
  const solids = st.platforms.filter(p => p.solid), m = 70;
  const total = solids.reduce((s, p) => s + p.w - 2 * m, 0), out = [];
  for (let i = 0; i < n; i++) {
    let d = (i + 0.5) / n * total;
    for (const p of solids) {
      const len = p.w - 2 * m;
      if (d <= len) { out.push({ x: p.x + m + d, y: p.y }); break; }
      d -= len;
    }
  }
  return out;
}
function activeSlots() { return [0, 1, 2, 3, 4, 5].filter(i => slotType[i] !== 'off'); }
function humanSlots() { return [0, 1, 2, 3, 4, 5].filter(i => slotType[i] === 'human'); }

function startMatch() {
  stage = STAGES[stageIdx];
  fighters = activeSlots().map(i => { const f = new Fighter(i); f.setChar(CHARS[selChar[i]]); f.ai = slotType[i] === 'cpu'; return f; });
  const sp = makeSpawns(stage, fighters.length);
  fighters.forEach((f, i) => { f.reset(sp[i], sp[i].x < WW / 2 ? 1 : -1); f.stocks = 3; });
  fireballs.length = 0; particles.length = 0; hitstop = 0; shake = 0;
  snapCamera(); state = 'intro'; stateT = 0;
}
function enterSelect() {
  state = 'select'; ready = [false, false, false, false, false, false]; cpuT = 0; goT = 0; lastSel = humanSlots()[0] || 0;
  if (!humanSlots().length) cpuT = 100;
}
function loseStock(f) {
  f.stocks--; f.out = true; f.respawnT = 100; f.atk = null; f.hitstun = 0; f.blockstun = 0;
  const hw = W / 2 / cam.z - 30, hh = H / 2 / cam.z - 30;
  const cx = clamp(f.x, cam.x - hw, cam.x + hw), cy = clamp(f.y - 80, cam.y - hh, cam.y + hh);
  spark(cx, cy, f.color, 30); spark(cx, cy, '#fff', 16);
  shake = 14; hitstop = Math.max(hitstop, 12); beep(70, 0.4, 'sawtooth', 0.09);
}
const outOfBounds = f => f.x < BLAST.l || f.x > BLAST.r || f.y > BLAST.b || f.y < BLAST.t;

const KB_ROWS = [['left', 'Move left'], ['right', 'Move right'], ['up', 'Jump / up special'], ['down', 'Crouch / drop through / fast fall'],
                 ['punch', 'Punch'], ['kick', 'Kick'], ['special', 'Special attack']];
const PAD_ROWS = [['jump', 'Jump'], ['punch', 'Punch'], ['kick', 'Kick'], ['special', 'Special attack']];
const CTL_TABS = ['Keyboard 1', 'Keyboard 2', 'Gamepad'];
const ctlRows = () => (ctlTab === 2 ? PAD_ROWS : KB_ROWS);
const ctlBinds = () => [binds.kb1, binds.kb2, binds.pad][ctlTab];
const ctlKeys = () => ['kb1', 'kb2', 'pad'][ctlTab];

function assignBind(action, value) {
  const b = ctlBinds(), old = b[action], rows = ctlRows();
  ctlMsg = 'Saved.';
  for (const k of Object.keys(b)) if (k !== action && b[k] === value) {          // already used -> swap the two
    b[k] = old; const r = rows.find(x => x[0] === k); ctlMsg = `Swapped with "${r ? r[1] : k}".`;
  }
  b[action] = value; saveBinds(); beep(520, 0.08);
}
function tickControls(nv) {
  const rows = ctlRows(), n = rows.length + 1;                    // last row = reset
  if (ctlWait) {
    if (ctlTab < 2) {
      if (lastKey === 'Escape') { ctlWait = false; ctlMsg = 'Cancelled.'; }
      else if (lastKey) { assignBind(rows[ctlRow][0], lastKey); ctlWait = false; }
    } else if (wasHit('Escape')) { ctlWait = false; ctlMsg = 'Cancelled.'; }
    else if (menuIn.btn >= 0) {
      if (menuIn.btn >= 12 && menuIn.btn <= 15) ctlMsg = 'The D-pad always moves. Pick another button.';
      else { assignBind(rows[ctlRow][0], menuIn.btn); ctlWait = false; }
    }
    return;
  }
  if (nv.l) { ctlTab = (ctlTab + 2) % 3; ctlRow = 0; ctlMsg = ''; beep(300, 0.04); }
  if (nv.r) { ctlTab = (ctlTab + 1) % 3; ctlRow = 0; ctlMsg = ''; beep(300, 0.04); }
  if (nv.u) { ctlRow = (ctlRow + n - 1) % n; beep(300, 0.04); }
  if (nv.d) { ctlRow = (ctlRow + 1) % n; beep(300, 0.04); }
  if (nv.ok) {
    if (ctlRow === rows.length) { Object.assign(ctlBinds(), DEFAULT_BINDS[ctlKeys()]); saveBinds(); ctlMsg = CTL_TABS[ctlTab] + ' reset to defaults.'; beep(440, 0.1); }
    else { ctlWait = true; ctlMsg = ''; lastKey = null; beep(440, 0.05); }
  } else if (nv.back) { state = controlsReturn; ctlMsg = ''; }
}

function startMenuChoice(pick, padIdx) {
  beep(440, 0.1);
  slotDev = [0, 1, 2, 3, 4, 5];
  if (pick === 3) { state = 'controls'; controlsReturn = 'menu'; ctlTab = 0; ctlRow = 0; ctlWait = false; ctlMsg = ''; return; }
  if (pick === 2) { state = 'lobby'; lobbyMsg = ''; lobbyCur = 0; if (padIdx >= 0) slotDev[0] = 2 + padIdx; return; }
  slotType = pick === 0 ? ['human', 'cpu', 'off', 'off', 'off', 'off'] : ['human', 'human', 'off', 'off', 'off', 'off'];
  if (padIdx >= 0) {                                              // started with a controller -> P1 uses it
    slotDev[0] = 2 + padIdx;
    if (pick === 1) { const other = getPads().findIndex((g, i) => g && g.connected && i !== padIdx); slotDev[1] = other >= 0 ? 2 + other : 1; }
  }
  fromLobby = false; enterSelect();
}
function cycleType(i) { slotType[i] = { human: 'cpu', cpu: 'off', off: 'human' }[slotType[i]]; lobbyMsg = ''; beep(360, 0.05); }
function cycleDev(i, dir) { slotDev[i] = (slotDev[i] + dir + 6) % 6; lobbyMsg = ''; beep(300, 0.04); }
function tryStartLobby() {
  const act = activeSlots(), hs = humanSlots(), used = {};
  if (act.length < 2) { lobbyMsg = 'Turn on at least 2 fighters.'; return; }
  for (const i of hs) {
    const d = devices[slotDev[i]];
    if (d.kind === 'pad' && !d.connected) { lobbyMsg = `No gamepad found for P${i + 1}. Plug one in and press any button on it, or pick another controller.`; return; }
    if (used[slotDev[i]] !== undefined) { lobbyMsg = `P${used[slotDev[i]] + 1} and P${i + 1} both use ${d.name}. Give each human a different controller.`; return; }
    used[slotDev[i]] = i;
  }
  fromLobby = true; enterSelect(); beep(440, 0.1);
}

function tick() {
  const nv = nav();
  if (wasHit('F1')) debug = !debug;

  if (state === 'menu') {
    if (nv.u) { menuCur = (menuCur + 3) % 4; beep(300, 0.04); }
    if (nv.d) { menuCur = (menuCur + 1) % 4; beep(300, 0.04); }
    let pick = -1;
    for (let i = 0; i < 4; i++) if (wasHit('Digit' + (i + 1))) pick = i;
    if (nv.ok) pick = menuCur;
    if (pick >= 0) { menuCur = pick; startMenuChoice(pick, menuIn.ok && !wasHit('Enter') && !wasHit('Space') ? menuIn.okPad : -1); }
    return;
  }
  if (state === 'controls') { tickControls(nv); return; }

  if (state === 'pause') {
    if (nv.u) { pauseCur = (pauseCur + 2) % 3; beep(300, 0.04); }
    if (nv.d) { pauseCur = (pauseCur + 1) % 3; beep(300, 0.04); }
    if (wasHit('Escape') || menuIn.start || menuIn.back) { state = pauseFrom; return; }
    if (nv.ok) {
      if (pauseCur === 0) state = pauseFrom;
      else if (pauseCur === 1) { state = 'controls'; controlsReturn = 'pause'; ctlTab = 0; ctlRow = 0; ctlWait = false; ctlMsg = ''; }
      else state = 'menu';
      beep(440, 0.06);
    }
    return;
  }

  if (state === 'lobby') {
    if (nv.u) { lobbyCur = (lobbyCur + 5) % 6; beep(300, 0.04); }
    if (nv.d) { lobbyCur = (lobbyCur + 1) % 6; beep(300, 0.04); }
    if (nv.l) cycleDev(lobbyCur, -1);
    if (nv.r) cycleDev(lobbyCur, 1);
    if (menuIn.ok || wasHit('Space')) cycleType(lobbyCur);
    const DEV_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN'];
    for (let i = 0; i < MAXP; i++) {
      if (wasHit('Digit' + (i + 1))) cycleType(i);
      if (wasHit(DEV_KEYS[i])) cycleDev(i, 1);
    }
    if (wasHit('Enter') || menuIn.start) tryStartLobby();
    else if (nv.back) state = 'menu';
    return;
  }

  if (state === 'select') {
    if (wasHit('Escape') || menuIn.start) { state = fromLobby ? 'lobby' : 'menu'; return; }
    const n = CHARS.length, hs = humanSlots();
    for (const i of hs) {
      const o = devOf(i).cur;
      if (!ready[i]) {
        if (o.leftHit) { selChar[i] = (selChar[i] + n - 1) % n; lastSel = i; beep(300, 0.04); }
        if (o.rightHit) { selChar[i] = (selChar[i] + 1) % n; lastSel = i; beep(300, 0.04); }
        if (o.punchHit || o.okHit || (i === 0 && wasHit('Enter'))) { ready[i] = true; lastSel = i; beep(520, 0.08); }
      } else if (o.kickHit) ready[i] = false;
    }
    if (hs.every(i => ready[i])) {
      if (++cpuT > 25) for (const i of activeSlots()) if (slotType[i] === 'cpu' && !ready[i]) { selChar[i] = Math.floor(Math.random() * n); ready[i] = true; }
    } else cpuT = 0;
    if (activeSlots().every(i => ready[i])) { if (++goT > 35) { state = 'stage'; goT = 0; } } else goT = 0;
    return;
  }
  if (state === 'stage') {
    const n = STAGES.length;
    if (nv.back) { enterSelect(); return; }
    if (nv.l) { stageIdx = (stageIdx + n - 1) % n; beep(300, 0.04); }
    if (nv.r) { stageIdx = (stageIdx + 1) % n; beep(300, 0.04); }
    for (let i = 0; i < n; i++) if (wasHit('Digit' + (i + 1))) stageIdx = i;
    if (nv.ok) { startMatch(); beep(440, 0.1); }
    return;
  }
  if (state === 'matchover') { if (nv.ok || nv.back) state = 'menu'; return; }

  if ((state === 'intro' || state === 'fight' || state === 'gameend') && (wasHit('Escape') || menuIn.start)) {
    pauseFrom = state; state = 'pause'; pauseCur = 0; beep(300, 0.05); return;
  }

  if ((state === 'fight' || state === 'gameend') && hitstop > 0) { hitstop--; return; }
  stateT++;
  if (shake > 0) shake *= 0.85;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.25; if (--p.life <= 0) particles.splice(i, 1);
  }

  if (state === 'intro') {
    for (const f of fighters) f.update(NEUTRAL, nearestOpp(f));
    updateCamera();
    if (stateT === 70) beep(660, 0.2, 'square', 0.06);
    if (stateT >= 110) { state = 'fight'; stateT = 0; }
    return;
  }

  if (state === 'fight') {
    for (const f of fighters) if (f.out && f.stocks > 0 && --f.respawnT <= 0) { f.respawn(); beep(500, 0.15, 'sine', 0.05); }
    const inputs = fighters.map(f => (f.out ? NEUTRAL : getInput(f)));
    fighters.forEach((f, i) => { if (!f.out) f.update(inputs[i], nearestOpp(f)); });
    pushApart();
    resolveHits();
    for (const f of fighters) if (!f.out && outOfBounds(f)) loseStock(f);
    updateCamera();
    if (alive().length <= 1) { state = 'gameend'; stateT = 0; fireballs.length = 0; }
    return;
  }

  if (state === 'gameend') {
    for (const f of fighters) if (!f.out) f.update(NEUTRAL, nearestOpp(f));
    updateCamera();
    if (stateT > 170) { state = 'matchover'; stateT = 0; }
  }
}

function step() {
  frameN++;
  for (const d of devices) d.poll();
  pollMenuPad();
  tick();
  lastKey = null;
  for (const k in keys) prev[k] = keys[k];
  for (const d of devices) d.commit();
}

// ---------- drawing ----------
function drawText(t, x, y, size, color, align = 'center', stroke = true) {
  ctx.font = `bold ${size}px "Trebuchet MS", Impact, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y); }
  ctx.fillStyle = color; ctx.fillText(t, x, y);
}
function grad(c0, c1, y1 = H) {
  const g = ctx.createLinearGradient(0, 0, 0, y1);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// --- backdrops (screen space) ---
function drawCityBG() {
  grad('#1b1040', '#f0845c', BGY);
  ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(W / 2, BGY - 90, 70, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 24; i++) {
    const bw = 40 + (i * 37) % 30, bh = 80 + (i * 53) % 140, bx = i * 42 - 10;
    ctx.fillStyle = '#2a1647'; ctx.fillRect(bx, BGY - bh, bw, bh + H - BGY);
    ctx.fillStyle = '#ffcf6e';
    for (let wy = BGY - bh + 10; wy < H - 10; wy += 18)
      for (let wx = bx + 6; wx < bx + bw - 8; wx += 12)
        if (((wx * 7 + wy * 13 + i) % 5) < 2) ctx.fillRect(wx, wy, 5, 7);
  }
}
function drawSkyBG() {
  grad('#3a8fe0', '#bfe6ff', BGY);
  ctx.fillStyle = '#fff6c9'; ctx.beginPath(); ctx.arc(780, 110, 50, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7fb2d9';
  for (const [x, y, w] of [[60, 200, 120], [800, 260, 140], [420, 140, 90]]) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w * 0.6, y + 40); ctx.lineTo(x + w * 0.4, y + 55); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 9; i++) {
    const cx = ((i * 230 + frameN * (0.15 + i * 0.03)) % (W + 240)) - 120, cy = 70 + (i * 61) % 380;
    ctx.beginPath(); ctx.ellipse(cx, cy, 60, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 30, cy - 10, 40, 16, 0, 0, Math.PI * 2); ctx.fill();
  }
}
function drawNeonBG() {
  grad('#0a0620', '#2b0f4a', BGY);
  ctx.fillStyle = '#e9e4ff'; ctx.beginPath(); ctx.arc(170, 110, 44, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 16; i++) {
    const bw = 50 + (i * 29) % 40, bh = 120 + (i * 67) % 200, bx = i * 62 - 10;
    ctx.fillStyle = '#120a2e'; ctx.fillRect(bx, BGY - bh, bw, bh + H - BGY);
    ctx.strokeStyle = i % 2 ? '#ff3da6' : '#35e0ff'; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, BGY - bh + 1, bw - 2, bh + H - BGY);
  }
}
function drawMoonBG() {
  grad('#02030c', '#101a3a');
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.4 * Math.sin(frameN / 25 + i)})`;
    ctx.fillRect((i * 97) % W, (i * 53) % 440, 1 + i % 3, 1 + i % 3);
  }
  ctx.fillStyle = '#2f6fd0'; ctx.beginPath(); ctx.arc(740, 150, 74, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3ea35a';
  ctx.beginPath(); ctx.ellipse(715, 135, 26, 18, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(770, 175, 18, 24, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2d3d'; ctx.fillRect(0, 500, W, H - 500);
  ctx.fillStyle = '#1d2030';
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(70 + i * 150, 516 + (i % 2) * 6, 40, 7, 0, 0, Math.PI * 2); ctx.fill(); }
}
function drawMagmaBG() {
  grad('#1a0505', '#5a1408');
  ctx.fillStyle = '#2a0d0a'; ctx.beginPath();
  ctx.moveTo(220, H); ctx.lineTo(425, 220); ctx.lineTo(535, 220); ctx.lineTo(740, H); ctx.closePath(); ctx.fill();
  const g = ctx.createRadialGradient(480, 220, 5, 480, 220, 120);
  g.addColorStop(0, 'rgba(255,200,90,.95)'); g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g; ctx.fillRect(330, 100, 300, 240);
  ctx.fillStyle = '#ff7a3a';
  for (let i = 0; i < 40; i++) ctx.fillRect((i * 83) % W, H - ((frameN * 1.2 + i * 47) % 470), 3, 3);   // rising embers
  for (let x = 0; x < W; x += 24) {
    const y = 508 + Math.sin(frameN / 14 + x / 40) * 6;
    ctx.fillStyle = '#ff6a2a'; ctx.fillRect(x, y, 26, H - y);
    ctx.fillStyle = '#ffb347'; ctx.fillRect(x, y, 26, 4);
  }
}
function drawDojoBG() {
  grad('#4a6fa5', '#f7c6a0', BGY);
  ctx.fillStyle = '#fff2c9'; ctx.beginPath(); ctx.arc(200, 150, 48, 0, Math.PI * 2); ctx.fill();
  for (const [col, off, hgt] of [['#7f93b8', 0, 230], ['#5d7099', 120, 280], ['#41507a', 40, 200]]) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-50, H);
    for (let x = -50; x <= W + 100; x += 110) { ctx.lineTo(x + off % 60, BGY - hgt + ((x * 7 + off) % 90)); ctx.lineTo(x + 55, BGY - hgt * 0.55); }
    ctx.lineTo(W + 100, H); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#b3261e';                                  // torii gate
  ctx.fillRect(330, 250, 18, 300); ctx.fillRect(612, 250, 18, 300);
  ctx.fillRect(305, 240, 350, 16); ctx.fillRect(320, 280, 320, 10);
  ctx.fillStyle = '#ffb7c5';
  for (let i = 0; i < 26; i++) {
    const x = ((i * 131 + frameN * 0.7) % (W + 40)) - 20, y = (i * 77 + frameN * 0.9) % H;
    ctx.beginPath(); ctx.ellipse(x, y, 4, 2.5, frameN / 30 + i, 0, Math.PI * 2); ctx.fill();
  }
}
function drawIceBG() {
  grad('#08183a', '#a9d6ff');
  for (let k = 0; k < 3; k++) {                                // aurora ribbons
    ctx.strokeStyle = ['rgba(90,255,190,.28)', 'rgba(120,160,255,.25)', 'rgba(200,120,255,.2)'][k]; ctx.lineWidth = 26;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 20) { const y = 90 + k * 36 + Math.sin(x / 90 + frameN / 50 + k) * 24; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  for (const [col, hgt, off] of [['#cfe8ff', 250, 0], ['#8fb8e8', 200, 160], ['#5f86bd', 150, 60]]) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-40, H);
    for (let x = -40; x <= W + 140; x += 160) { ctx.lineTo(x + off % 80, H - hgt - ((x * 3 + off) % 70)); ctx.lineTo(x + 80, H - hgt * 0.5); }
    ctx.lineTo(W + 140, H); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 60; i++) ctx.fillRect(((i * 79) + Math.sin(frameN / 40 + i) * 14 + W) % W, (i * 47 + frameN * (0.6 + (i % 4) * 0.3)) % H, 2, 2);
}

const PS = {
  rock:     { body: '#6b4f3a', edge: '#4a3626', top: '#4fbf5f', hi: '#7be08a' },
  moon:     { body: '#6b6f7d', edge: '#4a4d59', top: '#c9ccd8', hi: '#eef0f8' },
  lava:     { body: '#2b1a1a', edge: '#140a0a', top: '#ff7a3a', hi: '#ffd27a' },
  building: { body: '#2a1647', edge: '#1a0d30', top: '#ffcf6e', hi: '#fff2b0' },
  neon:     { body: '#140a30', edge: '#0a0620', top: '#35e0ff', hi: '#ff3da6' },
  wood:     { body: '#5b3a29', edge: '#3b2519', top: '#c98a4b', hi: '#ffd9a0' },
  ice:      { body: '#6fb3e0', edge: '#3d7fb0', top: '#eaf8ff', hi: '#ffffff' },
};
function drawPlatform(p, styleName, solid) {
  const s = PS[styleName] || PS.rock;
  if (solid) {
    ctx.fillStyle = s.body; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = s.edge; ctx.fillRect(p.x, p.y + p.h * 0.55, p.w, p.h * 0.45);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let x = p.x + 16; x < p.x + p.w - 8; x += 44) ctx.fillRect(x, p.y + 14, 6, p.h - 20);
    ctx.fillStyle = s.top; ctx.fillRect(p.x - 4, p.y, p.w + 8, 10);
    ctx.fillStyle = s.hi; ctx.fillRect(p.x - 4, p.y, p.w + 8, 3);
  } else if (styleName === 'neon' || styleName === 'building' || styleName === 'wood' || styleName === 'ice') {
    ctx.fillStyle = s.body; ctx.fillRect(p.x, p.y, p.w, 14);
    ctx.fillStyle = s.top; ctx.fillRect(p.x, p.y, p.w, 4);
    ctx.fillStyle = s.hi;
    for (let x = p.x + 10; x < p.x + p.w - 6; x += 30) ctx.fillRect(x, p.y + 7, 12, 3);
  } else {
    ctx.fillStyle = s.body; ctx.beginPath();
    ctx.moveTo(p.x, p.y + 4); ctx.lineTo(p.x + p.w, p.y + 4);
    ctx.lineTo(p.x + p.w * 0.78, p.y + 38); ctx.lineTo(p.x + p.w * 0.5, p.y + 62); ctx.lineTo(p.x + p.w * 0.22, p.y + 38);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = s.top; ctx.fillRect(p.x - 3, p.y, p.w + 6, 10);
    ctx.fillStyle = s.hi; ctx.fillRect(p.x - 3, p.y, p.w + 6, 3);
  }
}

// Stages are laid out in world units (1600 x 900). Solid platforms have walls; the others can be jumped through / dropped through.
const STAGES = [
  { name: 'Sunset City', desc: 'A wide rooftop with three floating ledges. Fall off and you lose a stock.',
    grav: 0.85, bg: drawCityBG, solidStyle: 'building', softStyle: 'building',
    platforms: [{ x: 300, y: 700, w: 1000, h: 200, solid: true }, { x: 380, y: 540, w: 220 }, { x: 1000, y: 540, w: 220 }, { x: 690, y: 420, w: 220 }] },
  { name: 'Sky Islands', desc: 'A small main island with five floating islands around it. Press Down on an island to drop through.',
    grav: 0.85, bg: drawSkyBG, solidStyle: 'rock', softStyle: 'rock',
    platforms: [{ x: 560, y: 700, w: 480, h: 160, solid: true }, { x: 140, y: 600, w: 260 }, { x: 1200, y: 600, w: 260 },
                { x: 350, y: 450, w: 220 }, { x: 1030, y: 450, w: 220 }, { x: 690, y: 300, w: 220 }] },
  { name: 'Neon Rooftops', desc: 'Two buildings with a deadly gap between them, a bridge above, and ledges on the sides.',
    grav: 0.85, bg: drawNeonBG, solidStyle: 'neon', softStyle: 'neon',
    platforms: [{ x: 120, y: 680, w: 480, h: 220, solid: true }, { x: 1000, y: 680, w: 480, h: 220, solid: true },
                { x: 680, y: 520, w: 240 }, { x: 300, y: 500, w: 200 }, { x: 1100, y: 500, w: 200 }] },
  { name: 'Moon Base', desc: 'Low gravity! Jumps are huge and knockback sends you flying.',
    grav: 0.55, bg: drawMoonBG, solidStyle: 'moon', softStyle: 'moon',
    platforms: [{ x: 400, y: 700, w: 800, h: 200, solid: true }, { x: 120, y: 540, w: 200 }, { x: 1280, y: 540, w: 200 }, { x: 650, y: 400, w: 300 }] },
  { name: 'Magma Pit', desc: 'A narrow rock over a volcano. Lava below, and every mistake is costly.',
    grav: 0.85, bg: drawMagmaBG, solidStyle: 'lava', softStyle: 'lava',
    platforms: [{ x: 520, y: 700, w: 560, h: 200, solid: true }, { x: 200, y: 580, w: 220 }, { x: 1180, y: 580, w: 220 }, { x: 680, y: 460, w: 240 }] },
  { name: 'Mountain Dojo', desc: 'A huge wooden stage under cherry blossoms. Hard to ring-out, so percent matters most.',
    grav: 0.85, bg: drawDojoBG, solidStyle: 'wood', softStyle: 'wood',
    platforms: [{ x: 200, y: 700, w: 1200, h: 200, solid: true }, { x: 330, y: 540, w: 240 }, { x: 1030, y: 540, w: 240 }, { x: 680, y: 400, w: 240 }] },
  { name: 'Frozen Peak', desc: 'A snowy summit with icy ledges stacked on both sides. Great for 6 players.',
    grav: 0.8, bg: drawIceBG, solidStyle: 'ice', softStyle: 'ice',
    platforms: [{ x: 480, y: 700, w: 640, h: 200, solid: true }, { x: 160, y: 560, w: 240 }, { x: 1200, y: 560, w: 240 },
                { x: 620, y: 430, w: 360 }, { x: 330, y: 300, w: 200 }, { x: 1070, y: 300, w: 200 }] },
];

function drawPlatforms(st) { for (const p of st.platforms) drawPlatform(p, p.solid ? st.solidStyle : st.softStyle, p.solid); }
function drawStagePreview(st) {                                 // backdrop + whole stage, fixed camera
  st.bg();
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(0.6, 0.6); ctx.translate(-WW / 2, -WH / 2);
  drawPlatforms(st); ctx.restore();
}

function limb(x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function atkExt(a) {
  if (a.t < a.startup) return 0.3;
  if (a.t < a.startup + a.active) return 1;
  return Math.max(0.3, 1 - (a.t - a.startup - a.active) / a.recover * 0.7);
}

function drawFighter(f) {
  if (f.out) return;
  if (f.invuln > 0 && frameN % 6 < 3) return;
  const a = f.atk, S = f.size, B = f.build;
  const crouch = (f.crouch && f.onGround) || (a && a.name === 'quake'), air = !f.onGround;
  const act = a && a.t >= a.startup && a.t < a.startup + a.active;
  ctx.save();
  if (f.onGround) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(f.x, f.y + 2, 34 * S, 8 * S, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (a && a.kind === 'warp' && a.t < a.startup) ctx.globalAlpha = 0.35;
  ctx.translate(f.x, f.y); ctx.scale(f.facing * S, S);
  if (f.hitstun > 0) {
    if (f.onGround) ctx.rotate(-0.12);
    else { ctx.translate(0, -80); ctx.rotate(-frameN * 0.28); ctx.translate(0, 80); }
  } else if (a && a.kind === 'dash' && a.t >= a.startup) ctx.rotate(0.22);
  const bob = (!a && f.onGround && !crouch && f.hitstun === 0) ? Math.sin(frameN / 9) * 2 : 0;
  ctx.translate(0, bob);

  const flash = f.flash > 0;
  const base = flash ? '#fff' : f.color, dark = flash ? '#fff' : f.dark, skin = flash ? '#fff' : '#f1c9a5', acc = flash ? '#fff' : f.accent;
  const legTop = crouch ? -46 : air ? -70 : -78, legBot = air ? -20 : 0;
  const torsoTop = crouch ? -98 : -136, torsoBot = legTop - 2;
  const kicking = a && (a.name === 'kick' || a.name === 'low');

  if (a && a.kind === 'dash' && a.t >= a.startup) {            // speed lines
    ctx.fillStyle = acc; ctx.globalAlpha = 0.5;
    for (let k = 0; k < 3; k++) ctx.fillRect(-40 - k * 22, -120 + k * 24, 38, 4);
    ctx.globalAlpha = 1;
  }

  const bx = (crouch ? -26 : -12) * B, fx = (crouch ? 18 : 10) * B;
  limb(bx, legTop, bx - 4, legBot, 17 * B, dark);
  if (kicking) {
    const e = atkExt(a), fy = a.name === 'low' ? -18 : -70;
    limb(4, legTop + 2, 4 + a.reach * 0.85 * e, legTop + (fy - legTop) * e, 17 * B, dark);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(4 + a.reach * 0.85 * e, legTop + (fy - legTop) * e, 9, 0, Math.PI * 2); ctx.fill();
  } else limb(fx, legTop, fx + 4, legBot, 17 * B, dark);

  ctx.fillStyle = base; ctx.fillRect(-20 * B, torsoTop, 40 * B, torsoBot - torsoTop);
  ctx.fillStyle = '#222'; ctx.fillRect(-20 * B, torsoBot - 8, 40 * B, 8);
  const hx = 6, hy = torsoTop - 15;
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = acc;
  if (f.look === 'fin') {
    ctx.beginPath(); ctx.moveTo(-6, hy - 8); ctx.lineTo(2, hy - 36); ctx.lineTo(14, hy - 10); ctx.closePath(); ctx.fill();
    ctx.fillRect(-8, hy - 8, 30, 4);
  } else if (f.look === 'spikes') {
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-8 + k * 8, hy - 10); ctx.lineTo(-4 + k * 8 + (k - 1.5) * 3, hy - 32); ctx.lineTo(0 + k * 8, hy - 10); ctx.closePath(); ctx.fill(); }
  } else if (f.look === 'helmet') {
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(hx, hy - 2, 16, Math.PI, 0); ctx.fill();
    ctx.fillStyle = acc; ctx.fillRect(hx - 3, hy - 19, 6, 13);
  } else if (f.look === 'snow') {
    ctx.fillStyle = base; ctx.beginPath(); ctx.arc(hx, hy - 3, 16, Math.PI, 0); ctx.fill();
    ctx.fillStyle = acc; ctx.fillRect(hx - 17, hy - 6, 34, 6); ctx.beginPath(); ctx.arc(hx - 2, hy - 23, 6, 0, Math.PI * 2); ctx.fill();
  } else if (f.look === 'swirl') {
    ctx.fillRect(-9, hy - 10, 30, 6);
    const sw = Math.sin(frameN / 6) * 4;
    limb(-9, hy - 7, -36, hy - 2 + sw, 5, acc); limb(-9, hy - 7, -32, hy + 8 - sw, 5, acc);
  } else if (f.look === 'hood') {
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(hx, hy, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin; ctx.fillRect(hx - 2, hy - 6, 18, 8);
    ctx.fillStyle = acc; ctx.fillRect(hx - 2, hy - 8, 18, 3);
  } else if (f.look === 'leaf') {
    ctx.fillStyle = flash ? '#fff' : '#58c84e';
    ctx.beginPath(); ctx.ellipse(hx - 5, hy - 21, 5, 11, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 8, hy - 22, 5, 11, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(hx + 1, hy - 14, 5, 0, Math.PI * 2); ctx.fill();
  } else ctx.fillRect(-9, hy - 10, 30, 6);
  ctx.fillStyle = '#222'; ctx.fillRect(14, hy - 4, 4, 4);

  const sy = torsoTop + 14;
  const fist = (x, y) => { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); };
  limb(-4, sy, 22, sy + 6, 13, dark); fist(24, sy + 6);
  if (a && a.name === 'punch') {
    const e = atkExt(a), x = 14 + (a.reach - 8) * e;
    limb(6, sy, x, sy, 14, base); fist(x, sy);
  } else if (a && a.kind === 'proj') {
    limb(6, sy, 44, sy + 4, 14, base); fist(46, sy + 4);
    if (a.t >= a.startup) {
      const r = 6 + 12 * (1 - (a.t - a.startup) / a.recover);
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(64, sy + 4, r, 0, Math.PI * 2); ctx.fill();
    }
  } else if (a && a.kind === 'rise') {
    limb(6, sy, 20, torsoTop - 62, 14, base); fist(20, torsoTop - 62);
    if (act) { ctx.strokeStyle = acc; ctx.globalAlpha = 0.7; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(10, torsoTop + 10, 62, -2.3, -0.4); ctx.stroke(); ctx.globalAlpha = 1; }
  } else if (a && a.name === 'quake') {
    limb(6, sy, 26, sy + 46, 14, base); fist(26, sy + 46);
    if (act) {
      const pr = (a.t - a.startup) / a.active;
      ctx.strokeStyle = acc; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, -6, a.reach * (0.4 + 0.6 * pr), 14, 0, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (a && a.kind === 'dash') {
    limb(6, sy, 46, sy, 14, base); fist(48, sy);
  } else if (a && a.kind === 'warp') {
    limb(6, sy, 28, torsoTop - 30, 14, base); fist(28, torsoTop - 30);
    if (a.t >= a.startup) { ctx.strokeStyle = acc; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -80, 20 + (a.t - a.startup) * 7, 0, Math.PI * 2); ctx.stroke(); }
  } else if (f.blocking || f.blockstun > 0) {
    limb(6, sy, 24, torsoTop - 8, 14, base); fist(24, torsoTop - 8);
    if (f.blockstun > 0) { ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(30, torsoTop + 30, 52, -1, 1); ctx.stroke(); }
  } else { limb(6, sy, 30, sy - 4, 14, base); fist(32, sy - 4); }
  ctx.restore();
}

function drawTag(f) {                                          // player tag floating above the head
  if (f.out) return;
  const top = f.y - (f.crouch && f.onGround ? 105 : 165) * f.size - 46;
  ctx.fillStyle = f.tagColor; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(f.x - 9, top + 12); ctx.lineTo(f.x + 9, top + 12); ctx.lineTo(f.x, top + 24); ctx.closePath(); ctx.stroke(); ctx.fill();
  drawText(f.label + (f.ai ? ' CPU' : ''), f.x, top, 22, f.tagColor);
}

function drawFireballs() {
  for (const fb of fireballs) {
    const col = fb.owner.accent;
    const g = ctx.createRadialGradient(fb.x, fb.y, 2, fb.x, fb.y, fb.r + 10);
    g.addColorStop(0, '#fff'); g.addColorStop(0.5, col); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r + 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.globalAlpha = 0.4;
    ctx.fillRect(fb.x - fb.vx * 4 - (fb.vx > 0 ? 28 : 0), fb.y - 6, 28, 12); ctx.globalAlpha = 1;
  }
}

function lerpColor(a, b, t) { return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t)); }
function pctColor(p) {
  const t = Math.min(1, p / 250);
  const c = t < 0.5 ? lerpColor([255, 255, 255], [255, 90, 50], t * 2) : lerpColor([255, 90, 50], [150, 0, 10], (t - 0.5) * 2);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawHUD() {
  const n = fighters.length, gap = 8, cw = Math.min(158, (W - 20 - (n - 1) * gap) / n);
  const x0 = (W - (n * cw + (n - 1) * gap)) / 2, big = n <= 4, ch = big ? 84 : 66, y0 = H - ch - 6;
  fighters.forEach((f, i) => {
    f.shownPct += (f.pct - f.shownPct) * 0.2;
    const x = x0 + i * (cw + gap);
    ctx.globalAlpha = f.stocks > 0 ? 1 : 0.45;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y0, cw, ch);
    ctx.fillStyle = f.tagColor; ctx.fillRect(x, y0, cw, 5);
    drawText(`${f.label} ${f.name}${f.ai ? ' (CPU)' : ''}`, x + 7, y0 + 17, big ? 14 : 12, '#fff', 'left');
    const pct = Math.round(f.shownPct), col = pctColor(pct), sc = 1 + f.pctBump * 0.02, fs = big ? 44 : 32;
    ctx.save(); ctx.translate(x + cw - 24, y0 + (big ? 48 : 40)); ctx.scale(sc, sc);
    drawText(String(pct), 0, 0, fs, col, 'right');
    drawText('%', 3, fs * 0.2, fs * 0.45, col, 'left');
    ctx.restore();
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k < f.stocks ? f.color : '#222'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 12 + k * 17, y0 + ch - 11, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

function drawOffscreen() {
  for (const f of fighters) {
    if (f.out) continue;
    const s = toScreen(f.x, f.y - 80);
    if (s.x >= 0 && s.x <= W && s.y >= 0 && s.y <= H) continue;
    const cx = clamp(s.x, 26, W - 26), cy = clamp(s.y, 26, H - 120);
    ctx.fillStyle = f.tagColor; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawText(f.label, cx, cy, 14, '#000', 'center', false);
  }
}

function drawCenterMsg() {
  if (state === 'intro') {
    if (stateT < 70) drawText('READY', W / 2, 160, 64, '#fff');
    else drawText('GO!', W / 2, 160, 90 + Math.sin(stateT) * 4, '#ffd24a');
  } else if (state === 'gameend') drawText('GAME!', W / 2, 160, 100, '#ff4a4a');
  else if (state === 'matchover') {
    const w = alive()[0];
    drawText(w ? `${w.label} ${w.name} WINS!` : 'DRAW', W / 2, 170, 70, w ? w.tagColor : '#ffd24a');
    drawText('Press ENTER for menu', W / 2, 235, 26, '#fff');
  }
}

function drawMenu() {
  drawStagePreview(STAGES[0]);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
  drawText('JIOS STREET FIGHTS', W / 2, 90, 68, '#ffd24a');
  const items = ['1 Player (vs CPU)', '2 Players', 'Up to 6 Players (lobby)', 'Controls & settings'];
  items.forEach((t, i) => {
    const sel = i === menuCur, y = 160 + i * 46;
    if (sel) { ctx.fillStyle = 'rgba(255,210,74,.18)'; ctx.fillRect(W / 2 - 250, y - 21, 500, 42); }
    drawText(`${i + 1}  -  ${t}`, W / 2, y, 28, sel ? '#ffd24a' : '#fff');
  });
  const L = (t, y, c = '#cfd8ff') => drawText(t, W / 2, y, 16, c, 'center', false);
  L('Choose with W / S or the arrow keys and Enter, a number key, or a controller (D-pad + A)', 362);
  const np = connectedPads().length;
  L(np ? `${np} controller${np > 1 ? 's' : ''} detected` : 'No controller detected. Plug one in and press any button on it.', 388, np ? '#8dffa0' : '#a8a8c8');
  drawText('Hit foes to raise their %. The higher it is, the farther they fly. Knock them off the stage!', W / 2, 432, 17, '#a8a8c8', 'center', false);
  drawText('Hold back to block  ·  Down on a floating platform = drop through  ·  Esc / Start = pause', W / 2, 458, 17, '#a8a8c8', 'center', false);
}

function drawLobby() {
  drawStagePreview(STAGES[1]);
  ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, W, H);
  drawText('WHO IS PLAYING?', W / 2, 36, 42, '#ffd24a');
  for (let i = 0; i < MAXP; i++) {
    const y = 70 + i * 54, t = slotType[i], on = t !== 'off', dev = devices[slotDev[i]];
    ctx.fillStyle = i === lobbyCur ? 'rgba(255,255,255,.22)' : on ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)'; ctx.fillRect(100, y, 760, 46);
    ctx.fillStyle = SLOT_COLORS[i]; ctx.fillRect(100, y, 10, 46);
    if (i === lobbyCur) drawText('▶', 122, y + 23, 18, '#fff', 'center', false);
    drawText(`P${i + 1}`, 160, y + 23, 26, on ? SLOT_COLORS[i] : '#666');
    drawText(t === 'human' ? 'HUMAN' : t === 'cpu' ? 'COMPUTER' : 'OFF', 215, y + 23, 22, on ? '#fff' : '#777', 'left');
    if (t === 'human') {
      const bad = dev.kind === 'pad' && !dev.connected;
      drawText(`◀ ${dev.name} ▶`, 400, y + 23, 19, bad ? '#ff7a7a' : '#fff', 'left', false);
      drawText(bad ? 'not connected' : dev.kind === 'pad' ? 'connected' : 'keyboard', 640, y + 23, 15, bad ? '#ff7a7a' : '#8dffa0', 'left', false);
    } else if (t === 'cpu') drawText('plays by itself', 400, y + 23, 16, '#a8a8c8', 'left', false);
    drawText(`${i + 1} / ${'ZXCVBN'[i]}`, 845, y + 23, 14, '#888', 'right', false);
  }
  if (lobbyMsg) drawText(lobbyMsg, W / 2, H - 70, 16, '#ff8a8a', 'center', false);
  drawText('Up / Down: pick a slot   ·   A / Space / 1-6: Human, Computer, Off   ·   Left / Right / Z-N: change controller', W / 2, H - 46, 15, '#a8a8c8', 'center', false);
  drawText('Enter or Start: continue   ·   Esc / B: back   ·   Change keys and buttons under Controls & settings', W / 2, H - 24, 15, '#a8a8c8', 'center', false);
}

function sharedKeys() {
  const s = [];
  for (const a of Object.keys(binds.kb1)) for (const b of Object.keys(binds.kb2)) if (binds.kb1[a] === binds.kb2[b]) s.push(keyName(binds.kb1[a]));
  return s;
}
function drawControls() {
  drawStagePreview(STAGES[2]);
  ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect(0, 0, W, H);
  drawText('CONTROLS', W / 2, 34, 42, '#ffd24a');
  CTL_TABS.forEach((t, i) => {
    const x = W / 2 + (i - 1) * 230, sel = i === ctlTab;
    ctx.fillStyle = sel ? 'rgba(255,210,74,.25)' : 'rgba(255,255,255,.07)'; ctx.fillRect(x - 105, 66, 210, 34);
    if (sel) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.strokeRect(x - 105, 66, 210, 34); }
    drawText(t, x, 83, 20, sel ? '#ffd24a' : '#bbb', 'center', sel);
  });
  drawText('◀', 130, 83, 22, '#888', 'center', false); drawText('▶', W - 130, 83, 22, '#888', 'center', false);
  const rows = ctlRows(), b = ctlBinds();
  rows.concat([['_reset', 'Reset this tab to defaults']]).forEach((r, i) => {
    const y = 126 + i * 38, sel = i === ctlRow, reset = r[0] === '_reset';
    ctx.fillStyle = sel ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.07)'; ctx.fillRect(210, y - 16, 540, 33);
    drawText(r[1], 230, y, 19, reset ? '#ffb347' : '#fff', 'left', false);
    if (!reset) {
      const waiting = sel && ctlWait, v = ctlTab === 2 ? btnName(b[r[0]]) : keyName(b[r[0]]);
      ctx.fillStyle = waiting ? '#ffd24a' : 'rgba(0,0,0,.5)'; ctx.fillRect(590, y - 12, 140, 25);
      drawText(waiting ? '...' : v, 660, y, 18, waiting ? '#000' : '#7df3ff', 'center', false);
    }
  });
  const y0 = 126 + (rows.length + 1) * 38 + 14;
  if (ctlWait) drawText(ctlTab < 2 ? 'Press the new key...   (Esc to cancel)' : 'Press the new button on your controller...   (Esc to cancel)', W / 2, y0, 20, '#ffd24a');
  else if (ctlMsg) drawText(ctlMsg, W / 2, y0, 18, '#8dffa0');
  if (ctlTab === 2) {
    const ps = connectedPads();
    drawText(ps.length ? `Detected: ${ps.map(g => (g.id || 'controller').slice(0, 34)).join('  |  ')}` : 'No controller detected. Plug one in and press any button on it.', W / 2, H - 70, 14, ps.length ? '#8dffa0' : '#ff9a9a', 'center', false);
    drawText('Moving always uses the stick or D-pad. Up special = hold Up (stick or jump button) and press Special.', W / 2, H - 50, 14, '#a8a8c8', 'center', false);
  } else {
    const sk = sharedKeys();
    drawText(sk.length ? `Warning: Keyboard 1 and Keyboard 2 both use ${sk.join(', ')}. Two players on one keyboard will clash.` : 'Up special = hold the Jump key and press Special.', W / 2, H - 60, 14, sk.length ? '#ff9a9a' : '#a8a8c8', 'center', false);
  }
  drawText('Left / Right: switch tab   ·   Up / Down: choose   ·   Enter or A: change   ·   Esc or B: back   (saved automatically)', W / 2, H - 24, 14, '#a8a8c8', 'center', false);
}

function drawPause() {
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
  drawText('PAUSED', W / 2, 150, 70, '#ffd24a');
  ['Resume', 'Controls', 'Quit to menu'].forEach((t, i) => {
    const y = 240 + i * 54, sel = i === pauseCur;
    if (sel) { ctx.fillStyle = 'rgba(255,210,74,.2)'; ctx.fillRect(W / 2 - 170, y - 24, 340, 48); }
    drawText(t, W / 2, y, 32, sel ? '#ffd24a' : '#fff');
  });
  drawText('Esc or Start to resume', W / 2, 430, 16, '#a8a8c8', 'center', false);
}

function drawSelect() {
  drawStagePreview(STAGES[0]);
  ctx.fillStyle = 'rgba(0,0,0,.68)'; ctx.fillRect(0, 0, W, H);
  drawText('CHOOSE YOUR FIGHTERS', W / 2, 36, 38, '#ffd24a');
  const n = CHARS.length, gap = 10, cw = 106, x0 = (W - (n * cw + (n - 1) * gap)) / 2, cy = 70, ch = 220;
  CHARS.forEach((c, i) => {
    const x = x0 + i * (cw + gap);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, cy, cw, ch);
    ctx.save(); ctx.translate(x + cw / 2, cy + ch - 62); ctx.scale(0.6, 0.6);
    const pv = previews[i]; pv.x = 0; pv.y = 0; pv.facing = 1; pv.invuln = 0; pv.onGround = true; drawFighter(pv);
    ctx.restore();
    drawText(c.name, x + cw / 2, cy + ch - 28, 17, '#fff');
    drawText(c.tag, x + cw / 2, cy + ch - 10, 12, '#bcc6e8', 'center', false);
    let k = 0;
    for (const s of activeSlots()) {
      if (selChar[s] !== i) continue;
      const rd = ready[s];
      ctx.strokeStyle = SLOT_COLORS[s]; ctx.lineWidth = rd ? 5 : 3; ctx.strokeRect(x + k * 4, cy + k * 4, cw - k * 8, ch - k * 8);
      ctx.fillStyle = SLOT_COLORS[s]; ctx.fillRect(x + 4 + (k % 3) * 31, cy + 6 + Math.floor(k / 3) * 20, 29, 18);
      drawText((slotType[s] === 'cpu' ? 'CPU' : 'P' + (s + 1)) + (rd ? '✓' : ''), x + 4 + (k % 3) * 31 + 14.5, cy + 15 + Math.floor(k / 3) * 20, 11, '#000', 'center', false);
      k++;
    }
  });
  const s = activeSlots().includes(lastSel) ? lastSel : activeSlots()[0], c = CHARS[selChar[s]];
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(120, 308, 720, 100);
  drawText(`P${s + 1}: ${c.name} - ${c.tag}`, 140, 328, 22, SLOT_COLORS[s], 'left');
  drawText(`Special: ${c.nName}      Up special: ${c.uName}`, 140, 358, 17, '#fff', 'left', false);
  drawText(c.info, 140, 386, 15, '#cfd8ff', 'left', false);
  const hs = humanSlots().map(i => {
    const d = devOf(i);
    return `P${i + 1}: ` + (d.kind === 'pad' ? `${d.name}: D-pad + ${btnName(binds.pad.punch)} / A` : `${keyName(d.arg.left)} / ${keyName(d.arg.right)} + ${keyName(d.arg.punch)}`);
  }).join('     ');
  drawText(hs, W / 2, 440, 16, '#cfd8ff', 'center', false);
  drawText('move left / right, then punch (or A) to confirm, kick cancels   ·   Esc / Start back', W / 2, 466, 15, '#a8a8c8', 'center', false);
  const wait = activeSlots().filter(i => !ready[i]).length;
  drawText(wait ? `Waiting for ${wait} fighter${wait > 1 ? 's' : ''}...` : 'Starting...', W / 2, 500, 18, '#ffd24a', 'center', false);
}

function drawStageSelect() {
  const st = STAGES[stageIdx];
  drawStagePreview(st);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, 125); ctx.fillRect(0, H - 100, W, 100);
  drawText('SELECT STAGE', W / 2, 42, 44, '#ffd24a');
  drawText('◀  ' + st.name + '  ▶', W / 2, 92, 30, '#fff');
  for (let i = 0; i < STAGES.length; i++) {
    ctx.fillStyle = i === stageIdx ? '#ffd24a' : '#666';
    ctx.beginPath(); ctx.arc(W / 2 + (i - (STAGES.length - 1) / 2) * 26, H - 84, 7, 0, Math.PI * 2); ctx.fill();
  }
  drawText(st.desc, W / 2, H - 56, 17, '#cfd8ff', 'center', false);
  drawText('A / D or ← / → change  ·  Enter to fight  ·  Esc back', W / 2, H - 24, 16, '#a8a8c8', 'center', false);
}

function render() {
  ctx.save();
  if (state === 'menu') { drawMenu(); ctx.restore(); return; }
  if (state === 'lobby') { drawLobby(); ctx.restore(); return; }
  if (state === 'select') { drawSelect(); ctx.restore(); return; }
  if (state === 'stage') { drawStageSelect(); ctx.restore(); return; }
  if (state === 'controls') { drawControls(); ctx.restore(); return; }
  stage.bg();
  ctx.save();
  const sx = shake > 0.5 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0.5 ? (Math.random() - 0.5) * shake : 0;
  ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  drawPlatforms(stage);
  for (const f of fighters) drawFighter(f);
  for (const f of fighters) drawTag(f);
  drawFireballs();
  for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life / 10); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 5, 5); }
  ctx.globalAlpha = 1;
  if (debug) {
    ctx.lineWidth = 1;
    for (const f of fighters) {
      if (f.out) continue;
      ctx.strokeStyle = '#4f4'; const b = f.box; ctx.strokeRect(b.x, b.y, b.w, b.h);
      const k = f.atk;
      if (k && k.kind !== 'proj' && k.t >= k.startup && k.t < k.startup + k.active) { ctx.strokeStyle = '#f44'; const h = hitboxOf(f, k); ctx.strokeRect(h.x, h.y, h.w, h.h); }
    }
    ctx.strokeStyle = '#f0f'; ctx.strokeRect(BLAST.l, BLAST.t, BLAST.r - BLAST.l, BLAST.b - BLAST.t);
  }
  ctx.restore();
  drawOffscreen(); drawHUD(); drawCenterMsg();
  if (state === 'pause') drawPause();
  ctx.restore();
}

// ---------- main loop (fixed 60 fps timestep) ----------
let last = performance.now(), acc = 0;
const STEP = 1000 / 60;
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  while (acc >= STEP) { step(); acc -= STEP; }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
