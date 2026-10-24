'use strict';
// JIOS STREET FIGHTS - a tiny original 2D fighting game. No dependencies.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 960, H = 540, GROUND = 470;

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
  punch: wasHit(m.punch), kick: wasHit(m.kick), special: wasHit(m.special),
});
const NEUTRAL = { left: false, right: false, up: false, down: false, punch: false, kick: false, special: false };

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

// ---------- moves ----------
const ATK = {
  punch:   { startup: 4,  active: 4, recover: 9,  dmg: 6,  stun: 14, kb: 5, reach: 68, y: -132, h: 32 },
  kick:    { startup: 8,  active: 5, recover: 15, dmg: 11, stun: 20, kb: 8, reach: 96, y: -88,  h: 40 },
  low:     { startup: 7,  active: 4, recover: 13, dmg: 8,  stun: 17, kb: 5, reach: 92, y: -32,  h: 30 },
  special: { startup: 14, active: 0, recover: 26 },
};

// ---------- game state ----------
let state = 'menu', stateT = 0, frameN = 0, round = 1, timeLeft = 99, timerFrames = 0;
let hitstop = 0, shake = 0, roundMsg = '', debug = false;
const fireballs = [], particles = [];
let pendingMode = 1, stageIdx = 0, stage = { platforms: [] };

class Fighter {
  constructor(o) { Object.assign(this, o); this.wins = 0; this.reset(); }
  reset() {
    this.x = this.startX; this.y = GROUND; this.vx = 0; this.vy = 0; this.facing = this.startFacing;
    this.hp = 100; this.shownHp = 100; this.hitstun = 0; this.blockstun = 0; this.kbv = 0;
    this.atk = null; this.crouch = false; this.blocking = false; this.cool = 0;
    this.ko = false; this.onGround = true; this.flash = 0;
    this.buf = { punch: 0, kick: 0, special: 0 };
    this.platform = null; this.dropT = 0;
  }
  get box() {
    const h = this.crouch && this.onGround ? 105 : 165;
    return { x: this.x - 24, y: this.y - h, w: 48, h };
  }
  startAtk(name) {
    this.atk = { ...ATK[name], name, t: 0, hit: false };
    if (this.onGround) this.vx = 0;
    if (name === 'special') this.cool = 70;
    this.buf.punch = this.buf.kick = this.buf.special = 0;
    beep(name === 'special' ? 300 : 180, 0.05, 'triangle', 0.04);
  }
  physics() {
    // walked off the edge of a floating platform -> fall
    if (this.onGround && this.platform) {
      const p = this.platform;
      if (this.x < p.x - 10 || this.x > p.x + p.w + 10) { this.platform = null; this.onGround = false; this.vy = 0; }
    }
    if (!this.onGround) {
      const prevY = this.y;
      this.vy += 0.85; this.y += this.vy;
      if (this.vy > 0 && this.dropT <= 0) {   // land on a platform from above (pass through from below)
        for (const p of stage.platforms) {
          if (this.x >= p.x - 8 && this.x <= p.x + p.w + 8 && prevY <= p.y && this.y >= p.y) {
            this.y = p.y; this.vy = 0; this.onGround = true; this.platform = p; this.vx = 0; break;
          }
        }
      }
      if (!this.onGround && this.y >= GROUND) { this.y = GROUND; this.vy = 0; this.onGround = true; this.platform = null; this.vx = 0; }
    }
    if (this.dropT > 0) this.dropT--;
    this.x = Math.max(40, Math.min(W - 40, this.x));
  }
  update(inp, opp) {
    if (this.cool > 0) this.cool--;
    if (this.flash > 0) this.flash--;
    if (this.ko) { this.x += this.kbv; this.kbv *= 0.9; this.physics(); return; }
    if (this.hitstun > 0 || this.blockstun > 0) {
      if (this.hitstun > 0) this.hitstun--; else this.blockstun--;
      this.x += this.kbv; this.kbv *= 0.85; this.blocking = false; this.physics(); return;
    }
    const grounded = this.onGround;
    if (!this.atk) {
      if (grounded) {
        this.facing = opp.x > this.x ? 1 : -1;
        const dropping = !!this.platform && inp.down;      // Down on a floating platform = drop through
        this.crouch = inp.down && !this.platform;
        const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        this.vx = this.crouch ? 0 : dir * 3.8;
        if (dropping) { this.platform = null; this.onGround = false; this.vy = 2; this.dropT = 14; this.y += 1; }
        else if (inp.up && !this.crouch) { this.vy = -17; this.onGround = false; this.platform = null; this.vx = dir * 4.2; }
        this.blocking = this.facing === 1 ? inp.left : inp.right;
      } else { this.blocking = false; this.crouch = false; }
      if (inp.special && grounded && this.cool === 0) this.startAtk('special');
      else if (inp.kick) this.startAtk(this.crouch && grounded ? 'low' : 'kick');
      else if (inp.punch) this.startAtk('punch');
    } else {
      this.blocking = false;
      if (grounded) this.vx = 0;
      const a = this.atk; a.t++;
      if (a.name === 'special' && a.t === a.startup) {
        fireballs.push({ x: this.x + this.facing * 52, y: this.y - 95, vx: this.facing * 7, owner: this, dmg: 9, stun: 16, kb: 7, r: 16 });
      }
      if (a.t >= a.startup + a.active + a.recover) this.atk = null;
    }
    this.x += this.vx;
    this.physics();
  }
}

const p1 = new Fighter({ name: 'EMBER', color: '#e0533a', dark: '#7d2a20', accent: '#ffd24a', startX: 300, startFacing: 1, keys: P1KEYS });
const p2 = new Fighter({ name: 'TIDE', color: '#3a9be0', dark: '#1f4f7d', accent: '#7dffe0', startX: 660, startFacing: -1, keys: P2KEYS, ai: true });

// ---------- helpers ----------
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function hitboxOf(f, k) {
  const x = f.facing === 1 ? f.x + 12 : f.x - 12 - k.reach;
  return { x, y: f.y + k.y, w: k.reach, h: k.h };
}
function spark(x, y, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 14 + Math.random() * 10, color });
  }
}

function landHit(a, d, dmg, stun, kb, px, py) {
  const dir = a.x < d.x ? 1 : -1;
  if (d.blocking && d.onGround) {
    d.hp -= Math.max(1, Math.round(dmg * 0.12));
    d.blockstun = 11; d.kbv = dir * kb * 0.8;
    spark(px, py, '#9fe8ff', 6); beep(120, 0.06, 'square', 0.05); hitstop = Math.max(hitstop, 3);
  } else {
    d.hp -= dmg; d.hitstun = stun; d.kbv = dir * kb; d.atk = null; d.flash = 6;
    spark(px, py, '#ffb347', 14); beep(90, 0.1, 'sawtooth', 0.07);
    hitstop = Math.max(hitstop, 6); shake = 6;
  }
  if (d.x <= 41 || d.x >= W - 41) a.x -= dir * 2;
}

function resolveHits() {
  const hits = [];
  for (const [a, d] of [[p1, p2], [p2, p1]]) {
    const k = a.atk;
    if (!k || k.hit || k.name === 'special') continue;
    if (k.t < k.startup || k.t >= k.startup + k.active) continue;
    const hb = hitboxOf(a, k), hurt = d.box;
    if (overlap(hb, hurt)) {
      k.hit = true;
      hits.push([a, d, k, hb.x + hb.w / 2, hb.y + hb.h / 2]);
    }
  }
  for (const [a, d, k, px, py] of hits) landHit(a, d, k.dmg, k.stun, k.kb, px, py);

  for (let i = fireballs.length - 1; i >= 0; i--) {
    const fb = fireballs[i];
    fb.x += fb.vx;
    const d = fb.owner === p1 ? p2 : p1;
    if (fb.x < -40 || fb.x > W + 40) { fireballs.splice(i, 1); continue; }
    if (overlap({ x: fb.x - fb.r, y: fb.y - fb.r, w: fb.r * 2, h: fb.r * 2 }, d.box)) {
      landHit(fb.owner, d, fb.dmg, fb.stun, fb.kb, fb.x, fb.y);
      fireballs.splice(i, 1);
    }
  }
  if (fireballs.length >= 2) {
    for (let i = fireballs.length - 1; i >= 0; i--) for (let j = i - 1; j >= 0; j--) {
      const a = fireballs[i], b = fireballs[j];
      if (a && b && a.owner !== b.owner && Math.abs(a.x - b.x) < 30 && Math.abs(a.y - b.y) < 30) {
        spark((a.x + b.x) / 2, a.y, '#fff', 12); fireballs.splice(i, 1); fireballs.splice(j, 1); break;
      }
    }
  }
}

// ---------- AI ----------
function aiInput(f, o) {
  const i = { ...NEUTRAL };
  const dx = o.x - f.x, dist = Math.abs(dx), tw = dx > 0 ? 'right' : 'left', aw = dx > 0 ? 'left' : 'right';
  f.aiT = (f.aiT || 0) - 1;
  if (f.aiT <= 0) {
    const r = Math.random();
    f.aiMode = dist > 300 ? (r < 0.35 ? 'zone' : 'approach') : (r < 0.55 ? 'poke' : r < 0.75 ? 'retreat' : r < 0.9 ? 'approach' : 'jump');
    f.aiT = 25 + Math.random() * 35;
  }
  if (o.atk && dist < 150 && !f.atk && Math.random() < 0.05) { f.aiMode = 'block'; f.aiT = 22; }
  switch (f.aiMode) {
    case 'approach': if (dist > 100) i[tw] = true; else f.aiT = 0; break;
    case 'retreat': i[aw] = true; break;
    case 'block': i[aw] = true; if (Math.random() < 0.4) i.down = true; break;
    case 'zone': if (f.cool === 0 && dist > 200 && Math.random() < 0.08) i.special = true; break;
    case 'jump': if (f.onGround) { i.up = true; i[tw] = true; } break;
    case 'poke':
      if (dist > 110) i[tw] = true;
      else if (Math.random() < 0.09) {
        const r = Math.random();
        if (r < 0.4) i.punch = true; else if (r < 0.7) i.kick = true; else { i.down = true; i.kick = true; }
      }
      break;
  }
  // use the floating platforms a little
  if (f.platform) i.down = o.y > f.y + 80 && Math.random() < 0.05;
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

// ---------- round flow ----------
function startMatch(mode) {
  p1.wins = p2.wins = 0; round = 1; p2.ai = mode === 1; stage = STAGES[stageIdx]; startRound();
}
function startRound() {
  p1.reset(); p2.reset(); fireballs.length = 0; particles.length = 0;
  timeLeft = 99; timerFrames = 0; hitstop = 0; state = 'intro'; stateT = 0;
}
function endRound(winners, msg) {
  winners.forEach(w => w.wins++);
  roundMsg = msg; state = 'ko'; stateT = 0; fireballs.length = 0;
  if (msg === 'K.O.') hitstop = 25;
}
function checkKO() {
  const dead = [p1, p2].filter(f => f.hp <= 0);
  if (!dead.length) return;
  dead.forEach(f => {
    const opp = f === p1 ? p2 : p1;
    f.hp = 0; f.ko = true; f.vy = -9; f.onGround = false; f.platform = null; f.atk = null; f.hitstun = f.blockstun = 0;
    f.kbv = (f.x < opp.x ? -1 : 1) * 6;
  });
  endRound([p1, p2].filter(f => !f.ko), 'K.O.');
}

function tick() {
  if (state === 'menu') {
    if (wasHit('Digit1') || wasHit('Enter')) { pendingMode = 1; state = 'stage'; beep(440, 0.1); }
    else if (wasHit('Digit2')) { pendingMode = 2; state = 'stage'; beep(440, 0.1); }
    return;
  }
  if (wasHit('Escape')) { state = 'menu'; return; }
  if (state === 'stage') {
    const n = STAGES.length;
    if (wasHit('ArrowLeft') || wasHit('KeyA')) { stageIdx = (stageIdx + n - 1) % n; beep(300, 0.04); }
    if (wasHit('ArrowRight') || wasHit('KeyD')) { stageIdx = (stageIdx + 1) % n; beep(300, 0.04); }
    for (let i = 0; i < n; i++) if (wasHit('Digit' + (i + 1))) stageIdx = i;
    if (wasHit('Enter') || wasHit('Space')) { startMatch(pendingMode); beep(440, 0.1); }
    return;
  }
  if (wasHit('F1')) debug = !debug;

  if (state === 'matchover') { if (wasHit('Enter')) state = 'menu'; return; }

  if ((state === 'fight' || state === 'ko') && hitstop > 0) { hitstop--; return; }
  stateT++;
  if (shake > 0) shake *= 0.85;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.25; if (--p.life <= 0) particles.splice(i, 1);
  }

  if (state === 'intro') {
    p1.update(NEUTRAL, p2); p2.update(NEUTRAL, p1);
    if (stateT === 80) beep(660, 0.2, 'square', 0.06);
    if (stateT >= 120) { state = 'fight'; stateT = 0; }
    return;
  }

  if (state === 'fight') {
    const i1 = getInput(p1, p2), i2 = getInput(p2, p1);
    p1.update(i1, p2); p2.update(i2, p1);
    if (p1.onGround && p2.onGround && Math.abs(p1.y - p2.y) < 40) {
      const d = p2.x - p1.x, min = 46;
      if (Math.abs(d) < min) {
        const push = (min - Math.abs(d)) / 2 * Math.sign(d || 1);
        p1.x -= push; p2.x += push;
        p1.x = Math.max(40, Math.min(W - 40, p1.x)); p2.x = Math.max(40, Math.min(W - 40, p2.x));
      }
    }
    resolveHits();
    checkKO();
    if (state === 'fight' && ++timerFrames >= 60) {
      timerFrames = 0;
      if (--timeLeft <= 0) {
        const w = p1.hp > p2.hp ? [p1] : p2.hp > p1.hp ? [p2] : [];
        endRound(w, 'TIME UP');
      }
    }
    return;
  }

  if (state === 'ko') {
    p1.update(NEUTRAL, p2); p2.update(NEUTRAL, p1);
    if (stateT > 170) {
      if (p1.wins >= 2 || p2.wins >= 2) { state = 'matchover'; stateT = 0; }
      else { round++; startRound(); }
    }
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
  if (stroke) { ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = '#000'; ctx.strokeText(t, x, y); }
  ctx.fillStyle = color; ctx.fillText(t, x, y);
}

function drawCityBG() {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#1b1040'); g.addColorStop(0.6, '#7a2e6b'); g.addColorStop(1, '#f0845c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(W / 2, GROUND - 90, 70, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 24; i++) {
    const bw = 40 + (i * 37) % 30, bh = 80 + (i * 53) % 140, bx = i * 42 - 10;
    ctx.fillStyle = '#2a1647'; ctx.fillRect(bx, GROUND - bh, bw, bh);
    ctx.fillStyle = '#ffcf6e';
    for (let wy = GROUND - bh + 10; wy < GROUND - 10; wy += 18)
      for (let wx = bx + 6; wx < bx + bw - 8; wx += 12)
        if (((wx * 7 + wy * 13 + i) % 5) < 2) ctx.fillRect(wx, wy, 5, 7);
  }
  ctx.fillStyle = '#2b1a2f'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2;
  for (let x = -200; x < W + 200; x += 80) { ctx.beginPath(); ctx.moveTo(W / 2 + (x - W / 2) * 0.4, GROUND); ctx.lineTo(x, H); ctx.stroke(); }
  ctx.fillStyle = '#4a2c4d'; ctx.fillRect(0, GROUND, W, 4);
}

// ---------- stages ----------
function drawSkyBG() {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#3a8fe0'); g.addColorStop(1, '#bfe6ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff6c9'; ctx.beginPath(); ctx.arc(780, 110, 50, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7fb2d9';
  for (const [x, y, w] of [[60, 200, 120], [800, 260, 140], [420, 140, 90]]) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w * 0.6, y + 40); ctx.lineTo(x + w * 0.4, y + 55); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 230 + frameN * (0.15 + i * 0.03)) % (W + 240)) - 120, cy = 70 + (i * 61) % 200;
    ctx.beginPath(); ctx.ellipse(cx, cy, 60, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 30, cy - 10, 40, 16, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#6b4f3a'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#4fbf5f'; ctx.fillRect(0, GROUND, W, 10);
  ctx.fillStyle = '#7be08a'; ctx.fillRect(0, GROUND, W, 4);
}

function drawNeonBG() {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#0a0620'); g.addColorStop(1, '#2b0f4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e9e4ff'; ctx.beginPath(); ctx.arc(170, 110, 44, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 16; i++) {
    const bw = 50 + (i * 29) % 40, bh = 120 + (i * 67) % 200, bx = i * 62 - 10;
    ctx.fillStyle = '#120a2e'; ctx.fillRect(bx, GROUND - bh, bw, bh);
    ctx.strokeStyle = i % 2 ? '#ff3da6' : '#35e0ff'; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, GROUND - bh + 1, bw - 2, bh - 2);
  }
  ctx.fillStyle = '#14092b'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#35e0ff'; ctx.fillRect(0, GROUND, W, 3);
}

function drawPlatform(p, style) {
  if (style === 'island') {
    ctx.fillStyle = '#6b4f3a';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 6); ctx.lineTo(p.x + p.w, p.y + 6);
    ctx.lineTo(p.x + p.w * 0.7, p.y + 60); ctx.lineTo(p.x + p.w * 0.5, p.y + 85); ctx.lineTo(p.x + p.w * 0.3, p.y + 55);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4fbf5f'; ctx.fillRect(p.x - 4, p.y, p.w + 8, 12);
    ctx.fillStyle = '#7be08a'; ctx.fillRect(p.x - 4, p.y, p.w + 8, 4);
  } else {
    ctx.fillStyle = '#3b2a52'; ctx.fillRect(p.x, p.y, p.w, 14);
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(p.x, p.y, p.w, 4);
    ctx.fillStyle = '#ff3da6';
    for (let x = p.x + 10; x < p.x + p.w - 6; x += 30) ctx.fillRect(x, p.y + 7, 12, 3);
  }
}

const STAGES = [
  { name: 'Sunset City', desc: 'The classic street. No platforms.', platforms: [], style: 'ledge', bg: drawCityBG },
  { name: 'Sky Islands', desc: 'Floating islands! Jump up onto them. Press Down on an island to drop through.',
    platforms: [{ x: 120, y: 350, w: 210 }, { x: 630, y: 350, w: 210 }, { x: 375, y: 235, w: 210 }], style: 'island', bg: drawSkyBG },
  { name: 'Neon Rooftops', desc: 'Two high ledges for hit-and-run fighting.',
    platforms: [{ x: 90, y: 330, w: 240 }, { x: 630, y: 330, w: 240 }], style: 'ledge', bg: drawNeonBG },
];

function drawBG(st) {
  st.bg();
  for (const p of st.platforms) drawPlatform(p, st.style);
}

function drawStageSelect() {
  const st = STAGES[stageIdx];
  drawBG(st);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, 125); ctx.fillRect(0, H - 90, W, 90);
  drawText('SELECT STAGE', W / 2, 42, 44, '#ffd24a');
  drawText('◀  ' + st.name + '  ▶', W / 2, 92, 30, '#fff');
  for (let i = 0; i < STAGES.length; i++) {
    ctx.fillStyle = i === stageIdx ? '#ffd24a' : '#666';
    ctx.beginPath(); ctx.arc(W / 2 + (i - (STAGES.length - 1) / 2) * 26, H - 76, 7, 0, Math.PI * 2); ctx.fill();
  }
  drawText(st.desc, W / 2, H - 50, 18, '#cfd8ff', 'center', false);
  drawText('A / D or ← / → change  ·  Enter to fight  ·  Esc back', W / 2, H - 22, 16, '#a8a8c8', 'center', false);
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
  const a = f.atk, crouch = f.crouch && f.onGround, air = !f.onGround && !f.ko;
  ctx.save();
  const sh = Math.max(0.4, 1 - (GROUND - f.y) / 250);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(f.x, GROUND + 2, 34 * sh, 8 * sh, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(f.x, f.y); ctx.scale(f.facing, 1);
  if (f.ko) { ctx.translate(0, f.onGround ? -16 : -60); ctx.rotate(f.onGround ? -Math.PI / 2 : -Math.PI / 3); }
  else if (f.hitstun > 0) ctx.rotate(-0.12);
  const bob = (!a && f.onGround && !crouch && f.hitstun === 0 && !f.ko) ? Math.sin(frameN / 9) * 2 : 0;
  ctx.translate(0, bob);

  const flash = f.flash > 0;
  const base = flash ? '#fff' : f.color, dark = flash ? '#fff' : f.dark, skin = flash ? '#fff' : '#f1c9a5';
  const legTop = crouch ? -46 : air ? -70 : -78, legBot = air ? -20 : 0;
  const torsoTop = crouch ? -98 : -136, torsoBot = legTop - 2;
  const kicking = a && (a.name === 'kick' || a.name === 'low');

  // legs
  const bx = crouch ? -26 : -12, fx = crouch ? 18 : 10;
  limb(bx, legTop, bx - 4, legBot, 17, dark);
  if (kicking) {
    const e = atkExt(a), fy = a.name === 'low' ? -18 : -70;
    limb(4, legTop + 2, 4 + a.reach * 0.85 * e, legTop + (fy - legTop) * e, 17, dark);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(4 + a.reach * 0.85 * e, legTop + (fy - legTop) * e, 9, 0, 7); ctx.fill();
  } else limb(fx, legTop, fx + 4, legBot, 17, dark);

  // torso, belt, head
  ctx.fillStyle = base; ctx.fillRect(-20, torsoTop, 40, torsoBot - torsoTop);
  ctx.fillStyle = '#222'; ctx.fillRect(-20, torsoBot - 8, 40, 8);
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(6, torsoTop - 15, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = flash ? '#fff' : f.accent; ctx.fillRect(-9, torsoTop - 25, 30, 6);
  ctx.fillStyle = '#222'; ctx.fillRect(14, torsoTop - 19, 4, 4);

  // arms
  const sy = torsoTop + 14;
  const fist = (x, y) => { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); };
  limb(-4, sy, 22, sy + 6, 13, dark); fist(24, sy + 6);   // rear arm
  if (a && a.name === 'punch') {
    const e = atkExt(a), x = 14 + (a.reach - 8) * e;
    limb(6, sy, x, sy, 14, base); fist(x, sy);
  } else if (a && a.name === 'special') {
    limb(6, sy, 44, sy + 4, 14, base); fist(46, sy + 4);
    if (a.t >= a.startup) {
      const r = 6 + 12 * (1 - (a.t - a.startup) / a.recover);
      ctx.fillStyle = f.accent; ctx.beginPath(); ctx.arc(64, sy + 4, r, 0, 7); ctx.fill();
    }
  } else if (f.blocking || f.blockstun > 0) {
    limb(6, sy, 24, torsoTop - 8, 14, base); fist(24, torsoTop - 8);
    if (f.blockstun > 0) { ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(30, torsoTop + 30, 52, -1, 1); ctx.stroke(); }
  } else { limb(6, sy, 30, sy - 4, 14, base); fist(32, sy - 4); }
  ctx.restore();
}

function drawFireballs() {
  for (const fb of fireballs) {
    const g = ctx.createRadialGradient(fb.x, fb.y, 2, fb.x, fb.y, fb.r + 10);
    g.addColorStop(0, '#fff'); g.addColorStop(0.5, fb.owner.accent); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r + 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fb.owner.accent; ctx.globalAlpha = 0.4;
    ctx.fillRect(fb.x - fb.vx * 4 - (fb.vx > 0 ? 28 : 0), fb.y - 6, 28, 12); ctx.globalAlpha = 1;
  }
}

function drawHUD() {
  const bw = 380, by = 28, bh = 26;
  for (const [f, x, right] of [[p1, 40, false], [p2, W - 40 - bw, true]]) {
    f.shownHp += (f.hp - f.shownHp) * 0.08;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 4, by - 4, bw + 8, bh + 8);
    ctx.fillStyle = '#5a1a1a'; ctx.fillRect(x, by, bw, bh);
    const tw = bw * Math.max(0, f.shownHp) / 100, hw = bw * Math.max(0, f.hp) / 100;
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(right ? x + bw - tw : x, by, tw, bh);
    ctx.fillStyle = f.hp > 30 ? '#4ee36b' : '#ff4a4a'; ctx.fillRect(right ? x + bw - hw : x, by, hw, bh);
    drawText(f.name + (f.ai ? ' (CPU)' : ''), right ? x + bw : x, by + 48, 20, '#fff', right ? 'right' : 'left');
    for (let i = 0; i < 2; i++) {
      const px = right ? x + 14 + i * 24 : x + bw - 14 - i * 24;
      ctx.fillStyle = i < f.wins ? f.accent : '#333'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, by + 52, 8, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
  drawText(String(Math.max(0, timeLeft)).padStart(2, '0'), W / 2, 44, 42, '#fff');
}

function drawCenterMsg() {
  if (state === 'intro') {
    if (stateT < 80) drawText(`ROUND ${round}`, W / 2, 200, 64, '#fff');
    else drawText('FIGHT!', W / 2, 200, 80 + Math.sin(stateT) * 4, '#ffd24a');
  } else if (state === 'ko') drawText(roundMsg, W / 2, 200, 90, '#ff4a4a');
  else if (state === 'matchover') {
    const t = p1.wins > p2.wins ? `${p1.name} WINS!` : p2.wins > p1.wins ? `${p2.name} WINS!` : 'DRAW';
    drawText(t, W / 2, 190, 80, '#ffd24a');
    drawText('Press ENTER for menu', W / 2, 260, 26, '#fff');
  }
}

function drawMenu() {
  drawBG(STAGES[0]);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
  drawText('JIOS STREET FIGHTS', W / 2, 110, 68, '#ffd24a');
  drawText('1  -  1 Player (vs CPU)', W / 2, 210, 34, '#fff');
  drawText('2  -  2 Players', W / 2, 256, 34, '#fff');
  drawText('P1:  A D move   W jump   S crouch   F punch   G kick   H fireball', W / 2, 340, 20, '#cfd8ff', 'center', false);
  drawText('P2:  \u2190 \u2192 move   \u2191 jump   \u2193 crouch   K punch   L kick   ; fireball', W / 2, 372, 20, '#cfd8ff', 'center', false);
  drawText('Hold back to block  \u00b7  Down+Kick = low kick  \u00b7  First to 2 rounds wins  \u00b7  Esc = menu', W / 2, 420, 18, '#a8a8c8', 'center', false);
  drawText('On floating platforms: press Down to drop through', W / 2, 450, 18, '#a8a8c8', 'center', false);
}

function render() {
  ctx.save();
  if (state === 'menu') { drawMenu(); ctx.restore(); return; }
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
      ctx.strokeStyle = '#4f4'; const b = f.box; ctx.strokeRect(b.x, b.y, b.w, b.h);
      if (f.atk && f.atk.reach) { const k = f.atk; if (k.t >= k.startup && k.t < k.startup + k.active) { ctx.strokeStyle = '#f44'; const h = hitboxOf(f, k); ctx.strokeRect(h.x, h.y, h.w, h.h); } }
    }
  }
  ctx.restore();
  drawHUD(); drawCenterMsg();
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
