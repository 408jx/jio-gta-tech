'use strict';
// JIOS STREET FIGHTS - an original platform fighter. No dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 960, H = 540, GROUND = 470;
const BLAST = { l: -250, r: W + 250, t: -200, b: H + 250 };   // leave this box and you lose a stock

// ---------- input ----------
const keys = {}, prev = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
const isDown = c => !!keys[c];
const wasHit = c => !!keys[c] && !prev[c];

const P1KEYS = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyF', kick: 'KeyG', special: 'KeyH' };
const P2KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'KeyK', kick: 'KeyL', special: 'Semicolon' };
const readInput = m => ({
  left: isDown(m.left), right: isDown(m.right), up: isDown(m.up), down: isDown(m.down),
  upHit: wasHit(m.up), punch: wasHit(m.punch), kick: wasHit(m.kick), special: wasHit(m.special),
});
const NEUTRAL = { left: false, right: false, up: false, down: false, upHit: false, punch: false, kick: false, special: false };

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
let state = 'menu', stateT = 0, frameN = 0;
let hitstop = 0, shake = 0, roundMsg = '', debug = false;
let pendingMode = 1, stageIdx = 0, stage = { platforms: [], grav: 0.85, spawns: [{ x: 300, y: GROUND }, { x: 660, y: GROUND }], respawn: { x: 480, y: 60 } };
let sel1 = 0, sel2 = 1, rdy1 = false, rdy2 = false, cpuT = 0, goT = 0;
const fireballs = [], particles = [];

// ---------- moves ----------
// kind: melee | proj | rise | dash | warp.   angle = launch angle in degrees (0 = sideways, 90 = straight up)
// Knockback speed = (base + growth * victim's percent) / victim's weight.
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
};

const CHARS = [
  { id: 'ember', name: 'EMBER', tag: 'All-rounder', color: '#e0533a', dark: '#7d2a20', accent: '#ffd24a', look: 'band',
    size: 1, build: 1, speed: 3.8, jump: 17, airJumps: 1, weight: 1.0, power: 1.0,
    sN: 'fireball', sU: 'flameRise', nName: 'Fireball', uName: 'Flame Rise', info: 'Balanced. Fireball for range, Flame Rise to recover.' },
  { id: 'tide', name: 'TIDE', tag: 'Zoner', color: '#3a9be0', dark: '#1f4f7d', accent: '#7dffe0', look: 'fin',
    size: 1, build: 1, speed: 4.2, jump: 17.5, airJumps: 1, weight: 0.92, power: 0.95,
    sN: 'waterShot', sU: 'geyser', nName: 'Water Shot', uName: 'Geyser', info: 'Fast water shots keep foes away. Geyser drifts far sideways.' },
  { id: 'volt', name: 'VOLT', tag: 'Speedster', color: '#e8c230', dark: '#8a6f12', accent: '#7df3ff', look: 'spikes',
    size: 0.95, build: 0.9, speed: 5.0, jump: 16, airJumps: 2, weight: 0.8, power: 0.85,
    sN: 'lightDash', sU: 'zapWarp', nName: 'Lightning Dash', uName: 'Zap Warp', info: 'Very fast, two air jumps, but light. Teleports to recover.' },
  { id: 'stone', name: 'STONE', tag: 'Heavy', color: '#9a7b52', dark: '#4a3d2a', accent: '#ff9a3c', look: 'helmet',
    size: 1.18, build: 1.25, speed: 3.0, jump: 15, airJumps: 1, weight: 1.45, power: 1.3,
    sN: 'quake', sU: 'rockSpin', nName: 'Quake Stomp', uName: 'Rock Spin', info: 'Slow and huge, hits very hard and is hard to launch.' },
];

// ---------- fighters ----------
const findPlatform = sp => stage.platforms.find(p => p.y === sp.y && sp.x >= p.x && sp.x <= p.x + p.w) || null;

class Fighter {
  constructor(keysMap, label) {
    this.keys = keysMap; this.label = label; this.ai = false;
    this.stocks = 3; this.pct = 0; this.shownPct = 0; this.pctBump = 0;
    this.setChar(CHARS[0]);
    this.reset({ x: 300, y: GROUND }, 1);
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
    this.reset({ x: stage.respawn.x, y: stage.respawn.y }, 1);
    this.onGround = false; this.platform = null; this.invuln = 150; this.pct = 0; this.shownPct = 0;
  }
  get box() {
    const S = this.size, h = (this.crouch && this.onGround ? 105 : 165) * S;
    return { x: this.x - 24 * S, y: this.y - h, w: 48 * S, h };
  }
  startAtk(name, inp) {
    const m = MOVES[name];
    if (m.groundOnly && !this.onGround) return;
    this.atk = { ...m, name, t: 0, hit: false, dirx: inp ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0 };
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
        this.facing = opp.x > this.x ? 1 : -1;
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
          this.x += a.dirx * a.warpX; this.y += a.warpY; this.vy = 0; this.vx = 0; this.onGround = false; this.platform = null;
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

const p1 = new Fighter(P1KEYS, 'P1');
const p2 = new Fighter(P2KEYS, 'P2'); p2.setChar(CHARS[1]); p2.ai = true;
const previews = CHARS.map(c => { const f = new Fighter(P1KEYS, ''); f.setChar(c); return f; });

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

// m = move (or projectile) data with dmg/base/growth/angle
function landHit(a, d, m, px, py) {
  if (d.out || d.invuln > 0 || (d.atk && d.atk.inv)) return false;
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
  shake = Math.min(12, 3 + speed / 2);
  return true;
}

function resolveHits() {
  const hits = [];
  for (const [a, d] of [[p1, p2], [p2, p1]]) {
    const k = a.atk;
    if (a.out || d.out || !k || k.hit || k.kind === 'proj') continue;
    if (k.t < k.startup || k.t >= k.startup + k.active) continue;
    const hb = hitboxOf(a, k);
    if (overlap(hb, d.box)) { k.hit = true; hits.push([a, d, k, hb.x + hb.w / 2, hb.y + hb.h / 2]); }
  }
  for (const [a, d, k, px, py] of hits) landHit(a, d, k, px, py);

  for (let i = fireballs.length - 1; i >= 0; i--) {
    const fb = fireballs[i];
    fb.vy += fb.grav; fb.x += fb.vx; fb.y += fb.vy;
    const d = fb.owner === p1 ? p2 : p1;
    if (--fb.life <= 0 || fb.x < BLAST.l || fb.x > BLAST.r || fb.y > BLAST.b || fb.y < BLAST.t) { fireballs.splice(i, 1); continue; }
    if (!d.out && overlap({ x: fb.x - fb.r, y: fb.y - fb.r, w: fb.r * 2, h: fb.r * 2 }, d.box)) {
      if (landHit(fb.owner, d, fb.p, fb.x, fb.y)) fireballs.splice(i, 1);
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
  return dist < 130;
}
function aiInput(f, o) {
  const i = { ...NEUTRAL };
  if (o.out) return i;
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
    f.aiMode = dist > 300 ? (r < 0.35 ? 'zone' : 'approach') : (r < 0.55 ? 'poke' : r < 0.75 ? 'retreat' : r < 0.9 ? 'approach' : 'jump');
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
      else if (Math.random() < 0.09) {
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

function getInput(f, opp) {
  const inp = f.ai ? aiInput(f, opp) : readInput(f.keys);
  for (const a of ['punch', 'kick', 'special']) {      // small input buffer
    if (inp[a]) f.buf[a] = 6; else if (f.buf[a] > 0) f.buf[a]--;
    inp[a] = f.buf[a] > 0;
  }
  return inp;
}

// ---------- match flow ----------
function startMatch(mode) {
  p1.ai = false; p2.ai = mode === 1; stage = STAGES[stageIdx];
  for (const f of [p1, p2]) { f.stocks = 3; f.pct = 0; f.shownPct = 0; f.pctBump = 0; }
  p1.reset(stage.spawns[0], 1); p2.reset(stage.spawns[1], -1);
  fireballs.length = 0; particles.length = 0; hitstop = 0; shake = 0;
  state = 'intro'; stateT = 0;
}
function loseStock(f) {
  f.stocks--; f.out = true; f.respawnT = 100; f.atk = null; f.hitstun = 0; f.blockstun = 0;
  const cx = Math.max(20, Math.min(W - 20, f.x)), cy = Math.max(20, Math.min(H - 20, f.y - 80));
  spark(cx, cy, f.color, 30); spark(cx, cy, '#fff', 16);
  shake = 14; hitstop = Math.max(hitstop, 12); beep(70, 0.4, 'sawtooth', 0.09);
}
const outOfBounds = f => f.x < BLAST.l || f.x > BLAST.r || f.y > BLAST.b || f.y < BLAST.t;

function tick() {
  if (state === 'menu') {
    if (wasHit('Digit1') || wasHit('Enter')) { pendingMode = 1; state = 'select'; rdy1 = rdy2 = false; cpuT = goT = 0; beep(440, 0.1); }
    else if (wasHit('Digit2')) { pendingMode = 2; state = 'select'; rdy1 = rdy2 = false; cpuT = goT = 0; beep(440, 0.1); }
    return;
  }
  if (wasHit('Escape')) { state = 'menu'; return; }
  if (wasHit('F1')) debug = !debug;

  if (state === 'select') {
    const n = CHARS.length;
    if (!rdy1) {
      if (wasHit('KeyA')) { sel1 = (sel1 + n - 1) % n; beep(300, 0.04); }
      if (wasHit('KeyD')) { sel1 = (sel1 + 1) % n; beep(300, 0.04); }
      if (wasHit('KeyF') || wasHit('Enter')) { rdy1 = true; beep(520, 0.08); }
    } else if (wasHit('KeyG')) rdy1 = false;
    if (pendingMode === 2) {
      if (!rdy2) {
        if (wasHit('ArrowLeft')) { sel2 = (sel2 + n - 1) % n; beep(300, 0.04); }
        if (wasHit('ArrowRight')) { sel2 = (sel2 + 1) % n; beep(300, 0.04); }
        if (wasHit('KeyK')) { rdy2 = true; beep(520, 0.08); }
      } else if (wasHit('KeyL')) rdy2 = false;
    } else if (rdy1 && !rdy2) {
      if (++cpuT > 25) { sel2 = Math.floor(Math.random() * n); rdy2 = true; }
    } else if (!rdy1) { rdy2 = false; cpuT = 0; }
    if (rdy1 && rdy2) {
      if (++goT > 35) { p1.setChar(CHARS[sel1]); p2.setChar(CHARS[sel2]); state = 'stage'; goT = 0; }
    } else goT = 0;
    return;
  }
  if (state === 'stage') {
    const n = STAGES.length;
    if (wasHit('ArrowLeft') || wasHit('KeyA')) { stageIdx = (stageIdx + n - 1) % n; beep(300, 0.04); }
    if (wasHit('ArrowRight') || wasHit('KeyD')) { stageIdx = (stageIdx + 1) % n; beep(300, 0.04); }
    for (let i = 0; i < n; i++) if (wasHit('Digit' + (i + 1))) stageIdx = i;
    if (wasHit('Enter') || wasHit('Space')) { startMatch(pendingMode); beep(440, 0.1); }
    return;
  }
  if (state === 'matchover') { if (wasHit('Enter')) state = 'menu'; return; }

  if ((state === 'fight' || state === 'gameend') && hitstop > 0) { hitstop--; return; }
  stateT++;
  if (shake > 0) shake *= 0.85;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.25; if (--p.life <= 0) particles.splice(i, 1);
  }

  if (state === 'intro') {
    p1.update(NEUTRAL, p2); p2.update(NEUTRAL, p1);
    if (stateT === 70) beep(660, 0.2, 'square', 0.06);
    if (stateT >= 110) { state = 'fight'; stateT = 0; }
    return;
  }

  if (state === 'fight') {
    for (const f of [p1, p2]) {
      if (f.out && --f.respawnT <= 0) { f.respawn(); beep(500, 0.15, 'sine', 0.05); }
    }
    const i1 = p1.out ? NEUTRAL : getInput(p1, p2), i2 = p2.out ? NEUTRAL : getInput(p2, p1);
    if (!p1.out) p1.update(i1, p2);
    if (!p2.out) p2.update(i2, p1);
    if (!p1.out && !p2.out && p1.onGround && p2.onGround && Math.abs(p1.y - p2.y) < 40) {
      const d = p2.x - p1.x, min = 46;
      if (Math.abs(d) < min) {
        const push = (min - Math.abs(d)) / 2 * Math.sign(d || 1);
        p1.x -= push; p2.x += push;
      }
    }
    resolveHits();
    for (const f of [p1, p2]) if (!f.out && outOfBounds(f)) loseStock(f);
    if (p1.stocks <= 0 || p2.stocks <= 0) { state = 'gameend'; stateT = 0; roundMsg = 'GAME!'; fireballs.length = 0; }
    return;
  }

  if (state === 'gameend') {
    if (!p1.out) p1.update(NEUTRAL, p2);
    if (!p2.out) p2.update(NEUTRAL, p1);
    if (stateT > 170) { state = 'matchover'; stateT = 0; }
  }
}

function step() {
  frameN++;
  tick();
  for (const k in keys) prev[k] = keys[k];
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

// --- stage backgrounds (no floor: the stage itself is drawn from its platforms) ---
function drawCityBG() {
  grad('#1b1040', '#f0845c', GROUND);
  ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(W / 2, GROUND - 90, 70, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 24; i++) {
    const bw = 40 + (i * 37) % 30, bh = 80 + (i * 53) % 140, bx = i * 42 - 10;
    ctx.fillStyle = '#2a1647'; ctx.fillRect(bx, GROUND - bh, bw, bh + H - GROUND);
    ctx.fillStyle = '#ffcf6e';
    for (let wy = GROUND - bh + 10; wy < H - 10; wy += 18)
      for (let wx = bx + 6; wx < bx + bw - 8; wx += 12)
        if (((wx * 7 + wy * 13 + i) % 5) < 2) ctx.fillRect(wx, wy, 5, 7);
  }
}
function drawSkyBG() {
  grad('#3a8fe0', '#bfe6ff', GROUND);
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
  grad('#0a0620', '#2b0f4a', GROUND);
  ctx.fillStyle = '#e9e4ff'; ctx.beginPath(); ctx.arc(170, 110, 44, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 16; i++) {
    const bw = 50 + (i * 29) % 40, bh = 120 + (i * 67) % 200, bx = i * 62 - 10;
    ctx.fillStyle = '#120a2e'; ctx.fillRect(bx, GROUND - bh, bw, bh + H - GROUND);
    ctx.strokeStyle = i % 2 ? '#ff3da6' : '#35e0ff'; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, GROUND - bh + 1, bw - 2, bh + H - GROUND);
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
  ctx.fillStyle = '#2a2d3d'; ctx.fillRect(0, 510, W, H - 510);
  ctx.fillStyle = '#1d2030';
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(70 + i * 150, 522 + (i % 2) * 6, 40, 7, 0, 0, Math.PI * 2); ctx.fill(); }
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
    const y = 505 + Math.sin(frameN / 14 + x / 40) * 6;
    ctx.fillStyle = '#ff6a2a'; ctx.fillRect(x, y, 26, H - y);
    ctx.fillStyle = '#ffb347'; ctx.fillRect(x, y, 26, 4);
  }
}
function drawDojoBG() {
  grad('#4a6fa5', '#f7c6a0', GROUND);
  ctx.fillStyle = '#fff2c9'; ctx.beginPath(); ctx.arc(200, 150, 48, 0, Math.PI * 2); ctx.fill();
  for (const [col, off, hgt] of [['#7f93b8', 0, 230], ['#5d7099', 120, 280], ['#41507a', 40, 200]]) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-50, H);
    for (let x = -50; x <= W + 100; x += 110) { ctx.lineTo(x + off % 60, GROUND - hgt + ((x * 7 + off) % 90)); ctx.lineTo(x + 55, GROUND - hgt * 0.55); }
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

const PS = {
  rock:     { body: '#6b4f3a', edge: '#4a3626', top: '#4fbf5f', hi: '#7be08a' },
  moon:     { body: '#6b6f7d', edge: '#4a4d59', top: '#c9ccd8', hi: '#eef0f8' },
  lava:     { body: '#2b1a1a', edge: '#140a0a', top: '#ff7a3a', hi: '#ffd27a' },
  building: { body: '#2a1647', edge: '#1a0d30', top: '#ffcf6e', hi: '#fff2b0' },
  neon:     { body: '#140a30', edge: '#0a0620', top: '#35e0ff', hi: '#ff3da6' },
  wood:     { body: '#5b3a29', edge: '#3b2519', top: '#c98a4b', hi: '#ffd9a0' },
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
  } else if (styleName === 'neon' || styleName === 'building' || styleName === 'wood') {
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

const STAGES = [
  { name: 'Sunset City', desc: 'A rooftop above the city. One solid stage, nowhere to hide. Fall off and you lose a stock.',
    grav: 0.85, bg: drawCityBG, solidStyle: 'building', softStyle: 'building',
    platforms: [{ x: 170, y: 470, w: 620, h: 90, solid: true }],
    spawns: [{ x: 330, y: 470 }, { x: 630, y: 470 }], respawn: { x: 480, y: 70 } },
  { name: 'Sky Islands', desc: 'A small main island and three floating islands. Press Down on a floating island to drop through.',
    grav: 0.85, bg: drawSkyBG, solidStyle: 'rock', softStyle: 'rock',
    platforms: [{ x: 310, y: 470, w: 340, h: 90, solid: true }, { x: 60, y: 350, w: 170 }, { x: 730, y: 350, w: 170 }, { x: 380, y: 240, w: 200 }],
    spawns: [{ x: 400, y: 470 }, { x: 560, y: 470 }], respawn: { x: 480, y: 70 } },
  { name: 'Neon Rooftops', desc: 'Two buildings with a deadly gap between them and a bridge platform above.',
    grav: 0.85, bg: drawNeonBG, solidStyle: 'neon', softStyle: 'neon',
    platforms: [{ x: 70, y: 440, w: 290, h: 100, solid: true }, { x: 600, y: 440, w: 290, h: 100, solid: true }, { x: 395, y: 330, w: 170 }],
    spawns: [{ x: 215, y: 440 }, { x: 745, y: 440 }], respawn: { x: 480, y: 60 } },
  { name: 'Moon Base', desc: 'Low gravity! Jumps are huge and knockback sends you flying.',
    grav: 0.55, bg: drawMoonBG, solidStyle: 'moon', softStyle: 'moon',
    platforms: [{ x: 230, y: 470, w: 500, h: 90, solid: true }, { x: 90, y: 340, w: 130 }, { x: 740, y: 340, w: 130 }, { x: 395, y: 230, w: 170 }],
    spawns: [{ x: 360, y: 470 }, { x: 600, y: 470 }], respawn: { x: 480, y: 60 } },
  { name: 'Magma Pit', desc: 'A narrow rock over a volcano. Lava below, and every mistake is costly.',
    grav: 0.85, bg: drawMagmaBG, solidStyle: 'lava', softStyle: 'lava',
    platforms: [{ x: 260, y: 470, w: 440, h: 90, solid: true }, { x: 100, y: 360, w: 150 }, { x: 710, y: 360, w: 150 }, { x: 400, y: 290, w: 160 }],
    spawns: [{ x: 370, y: 470 }, { x: 590, y: 470 }], respawn: { x: 480, y: 70 } },
  { name: 'Mountain Dojo', desc: 'A wide wooden stage under cherry blossoms. Hard to ring-out, so percent matters most.',
    grav: 0.85, bg: drawDojoBG, solidStyle: 'wood', softStyle: 'wood',
    platforms: [{ x: 120, y: 470, w: 720, h: 90, solid: true }, { x: 210, y: 340, w: 150 }, { x: 600, y: 340, w: 150 }],
    spawns: [{ x: 300, y: 470 }, { x: 660, y: 470 }], respawn: { x: 480, y: 70 } },
];

function drawBG(st) {
  st.bg();
  for (const p of st.platforms) drawPlatform(p, p.solid ? st.solidStyle : st.softStyle, p.solid);
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
  [p1, p2].forEach((f, idx) => {
    f.shownPct += (f.pct - f.shownPct) * 0.2;
    const cx = idx === 0 ? 250 : 710;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(cx - 135, H - 112, 270, 102);
    ctx.fillStyle = f.color; ctx.fillRect(cx - 135, H - 112, 270, 6);
    drawText(f.name + (f.ai ? ' (CPU)' : ''), cx - 125, H - 92, 18, '#fff', 'left');
    const pct = Math.round(f.shownPct), col = pctColor(pct), sc = 1 + f.pctBump * 0.02;
    ctx.save(); ctx.translate(cx + 28, H - 56); ctx.scale(sc, sc);
    drawText(String(pct), 0, 0, 62, col, 'right');
    drawText('%', 4, 10, 28, col, 'left');
    ctx.restore();
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k < f.stocks ? f.color : '#222'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx - 115 + k * 22, H - 24, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  });
}

function drawOffscreen() {
  for (const f of [p1, p2]) {
    if (f.out) continue;
    const sx = f.x, sy = f.y - 80;
    if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) continue;
    const cx = Math.max(26, Math.min(W - 26, sx)), cy = Math.max(26, Math.min(H - 26, sy));
    ctx.fillStyle = f.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawText(f.label, cx, cy, 14, '#fff', 'center', false);
  }
}

function drawCenterMsg() {
  if (state === 'intro') {
    if (stateT < 70) drawText('READY', W / 2, 190, 64, '#fff');
    else drawText('GO!', W / 2, 190, 90 + Math.sin(stateT) * 4, '#ffd24a');
  } else if (state === 'gameend') drawText(roundMsg, W / 2, 190, 100, '#ff4a4a');
  else if (state === 'matchover') {
    const t = p1.stocks > 0 ? `${p1.name} WINS!` : p2.stocks > 0 ? `${p2.name} WINS!` : 'DRAW';
    drawText(t, W / 2, 190, 80, '#ffd24a');
    drawText('Press ENTER for menu', W / 2, 260, 26, '#fff');
  }
}

function drawMenu() {
  drawBG(STAGES[0]);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
  drawText('JIOS STREET FIGHTS', W / 2, 110, 68, '#ffd24a');
  drawText('1  -  1 Player (vs CPU)', W / 2, 200, 34, '#fff');
  drawText('2  -  2 Players', W / 2, 246, 34, '#fff');
  drawText('P1:  A D move   W jump (again in air = double jump)   S crouch / fast fall', W / 2, 322, 19, '#cfd8ff', 'center', false);
  drawText('F punch   G kick   H special   W + H up special (recovery)', W / 2, 348, 19, '#cfd8ff', 'center', false);
  drawText('P2:  ← → move   ↑ jump   ↓ crouch   K punch   L kick   ; special   ↑ + ; up special', W / 2, 382, 19, '#cfd8ff', 'center', false);
  drawText('Hit foes to raise their %. The higher it is, the farther they fly. Knock them off the stage!', W / 2, 428, 18, '#a8a8c8', 'center', false);
  drawText('Hold back to block  ·  Down on a floating platform = drop through  ·  Esc = menu', W / 2, 454, 18, '#a8a8c8', 'center', false);
}

function drawSelect() {
  drawBG(STAGES[0]);
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, W, H);
  drawText('CHOOSE YOUR FIGHTER', W / 2, 44, 44, '#ffd24a');
  const cw = 210, gap = 20, x0 = (W - (CHARS.length * cw + (CHARS.length - 1) * gap)) / 2, cy = 90, ch = 250;
  CHARS.forEach((c, i) => {
    const x = x0 + i * (cw + gap);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, cy, cw, ch);
    for (const [sel, rdy, col, lab, off] of [[sel1, rdy1, '#ff5a4a', 'P1', 0], [sel2, rdy2, '#4aa8ff', pendingMode === 1 ? 'CPU' : 'P2', 1]]) {
      if (sel === i) {
        ctx.strokeStyle = col; ctx.lineWidth = rdy ? 8 : 4; ctx.strokeRect(x + off * 6, cy + off * 6, cw - off * 12, ch - off * 12);
        ctx.fillStyle = col; ctx.fillRect(x + (off ? cw - 44 : 0), cy, 44, 22);
        drawText(rdy ? 'OK' : lab, x + (off ? cw - 22 : 22), cy + 11, 15, '#fff', 'center', false);
      }
    }
    const pv = previews[i]; pv.x = x + cw / 2; pv.y = cy + ch - 56; pv.facing = 1; pv.invuln = 0; drawFighter(pv);
    drawText(c.name, x + cw / 2, cy + ch - 24, 24, '#fff');
  });
  for (const [sel, col, left, label] of [[sel1, '#ff5a4a', true, 'P1'], [sel2, '#4aa8ff', false, pendingMode === 1 ? 'CPU' : 'P2']]) {
    const c = CHARS[sel], x = left ? 60 : W / 2 + 20, w = W / 2 - 80;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x - 10, 360, w + 20, 130);
    drawText(`${label}: ${c.name} - ${c.tag}`, x, 378, 22, col, 'left');
    drawText(`Special: ${c.nName}`, x, 408, 18, '#fff', 'left', false);
    drawText(`Up special: ${c.uName}`, x, 432, 18, '#fff', 'left', false);
    drawText(c.info, x, 464, 15, '#cfd8ff', 'left', false);
  }
  drawText(pendingMode === 1 ? 'P1: A / D choose, F or Enter confirm, G cancel   ·   Esc back'
    : 'P1: A / D + F confirm   ·   P2: ← / → + K confirm   ·   Esc back', W / 2, H - 22, 16, '#a8a8c8', 'center', false);
}

function drawStageSelect() {
  const st = STAGES[stageIdx];
  drawBG(st);
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
  if (state === 'select') { drawSelect(); ctx.restore(); return; }
  if (state === 'stage') { drawStageSelect(); ctx.restore(); return; }
  if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBG(stage);
  drawFighter(p1); drawFighter(p2);
  drawFireballs();
  for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life / 10); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); }
  ctx.globalAlpha = 1;
  if (debug) {
    ctx.lineWidth = 1;
    for (const f of [p1, p2]) {
      if (f.out) continue;
      ctx.strokeStyle = '#4f4'; const b = f.box; ctx.strokeRect(b.x, b.y, b.w, b.h);
      const k = f.atk;
      if (k && k.kind !== 'proj' && k.t >= k.startup && k.t < k.startup + k.active) { ctx.strokeStyle = '#f44'; const h = hitboxOf(f, k); ctx.strokeRect(h.x, h.y, h.w, h.h); }
    }
  }
  ctx.restore();
  drawOffscreen(); drawHUD(); drawCenterMsg();
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
