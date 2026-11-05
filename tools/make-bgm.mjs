// Procedural EDM track for the binary-star video.
// 128 BPM, 4/4, 64 bars = exactly 120 s. Every section boundary sits on a bar line,
// so the composition can sync visuals to the same grid (see ARRANGEMENT in index.html).
import { writeFileSync } from "node:fs";

const SR = 44100;
const BPM = 128;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 64;
const DUR = BARS * BAR; // 120 s
const N = Math.ceil(DUR * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const sendL = new Float32Array(N); // delay send
const sendR = new Float32Array(N);

// ---------- deterministic noise ----------
let seed = 0x5eed1234;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rnd() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- arrangement (bar -> flags) ----------
// S0 0-7 intro | S1 8-15 drop | S2 16-23 +lead | S3 24-31 | S4 32-39 breakdown/build
// S5 40-47 drop2 +lead | S6 48-55 peak | S7 56-63 outro
function sec(bar) { return Math.floor(bar / 8); }
function arr(bar) {
  const s = sec(bar), b = bar % 8;
  const a = { kick: false, clap: false, hat: false, ohat: false, bass: false, pad: true, arp: true, lead: false, roll: false, riser: false, arpCut: 1 };
  if (s === 0) {
    a.arpCut = 0.15 + 0.85 * (bar / 8);
    if (b >= 4) { a.hat = true; a.kick = true; }
    if (b === 7) { a.roll = true; a.riser = true; a.kick = false; }
  } else if (s === 4) {
    a.arpCut = b < 4 ? 0.35 : 0.35 + 0.65 * ((b - 4) / 4);
    if (b >= 4) { a.hat = true; a.roll = true; }
    if (b >= 6) a.riser = true;
  } else if (s === 7) {
    if (b < 4) { a.kick = a.clap = a.hat = a.ohat = a.bass = true; }
    a.arpCut = b < 4 ? 1 : 1 - 0.6 * ((b - 4) / 4);
  } else {
    a.kick = a.clap = a.hat = a.ohat = a.bass = true;
    a.lead = s === 2 || s === 5 || s === 6;
    if (b === 7 && s !== 6) { a.riser = true; }
    if (b === 7 && s === 3) { a.roll = true; a.kick = true; }
    if (b === 7 && s === 6) { a.riser = true; } // into the merger / outro
  }
  return a;
}
const CRASH_BARS = [8, 16, 24, 32, 40, 42, 45, 48, 56];
const IMPACT_BARS = [8, 40, 56];

// chords: Am F C G  (bass midi, triad midi)
const CHORDS = [
  [45, [57, 60, 64]],
  [41, [53, 57, 60]],
  [48, [55, 60, 64]],
  [43, [55, 59, 62]],
];
// lead: 8 eighth-notes per bar, -1 = rest, over the 4-bar loop
const LEAD = [
  [76, -1, 72, 76, 79, -1, 76, 72],
  [77, -1, 76, 72, 69, -1, 72, -1],
  [72, -1, 76, 79, 84, -1, 79, 76],
  [74, -1, 71, 74, 79, 81, 79, 74],
];

// sidechain envelope: duck on every kick
function duck(t) {
  const bar = Math.floor(t / BAR);
  if (bar >= BARS || !arr(bar).kick) return 1;
  const since = t % BEAT;
  return 1 - 0.7 * Math.exp(-since / 0.09);
}

// ---------- helpers ----------
function add(i, l, r) { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } }
function addSend(i, l, r) { if (i >= 0 && i < N) { sendL[i] += l; sendR[i] += r; } }
const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));

// ---------- instruments ----------
function kick(t0, gain = 1) {
  const len = 0.42 * SR, s0 = Math.round(t0 * SR);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 45 + 110 * Math.exp(-t / 0.035);
    ph += f / SR;
    const env = Math.exp(-t / 0.16);
    const click = i < 90 ? noise() * 0.25 * (1 - i / 90) : 0;
    const v = (Math.sin(2 * Math.PI * ph) * env + click) * 0.95 * gain;
    add(s0 + i, v, v);
  }
}
function clap(t0, gain = 1) {
  const len = 0.25 * SR, s0 = Math.round(t0 * SR);
  let lp = 0, hp = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const bursts = (t < 0.01 ? 1 : t < 0.02 ? 0.6 : t < 0.03 ? 0.9 : 0.7) * Math.exp(-Math.max(0, t - 0.03) / 0.07);
    const n = noise();
    lp += (n - lp) * 0.45; // tame top
    hp = 0.92 * (hp + lp - prev); prev = lp; // remove lows
    const v = hp * bursts * 0.55 * gain;
    add(s0 + i, v * 0.9, v * 1.1);
  }
}
function hat(t0, open = false, gain = 1) {
  const len = (open ? 0.18 : 0.045) * SR, s0 = Math.round(t0 * SR);
  let hp = 0, prev = 0;
  const pan = open ? 0.15 : -0.15;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = noise();
    hp = 0.6 * (hp + n - prev); prev = n;
    const v = hp * Math.exp(-t / (open ? 0.06 : 0.012)) * (open ? 0.22 : 0.18) * gain;
    add(s0 + i, v * (1 - pan), v * (1 + pan));
  }
}
function snare(t0, gain = 1) {
  const len = 0.12 * SR, s0 = Math.round(t0 * SR);
  let hp = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = noise();
    hp = 0.85 * (hp + n - prev); prev = n;
    const v = (hp * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * Math.exp(-t / 0.035) * 0.35 * gain;
    add(s0 + i, v, v);
  }
}
function crash(t0, gain = 1) {
  const len = 2.2 * SR, s0 = Math.round(t0 * SR);
  let hpL = 0, pL = 0, hpR = 0, pR = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const a = noise(), b = noise();
    hpL = 0.7 * (hpL + a - pL); pL = a;
    hpR = 0.7 * (hpR + b - pR); pR = b;
    const env = Math.exp(-t / 0.55) * 0.22 * gain;
    add(s0 + i, hpL * env, hpR * env);
  }
}
function impact(t0) {
  const len = 1.6 * SR, s0 = Math.round(t0 * SR);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += (38 + 40 * Math.exp(-t / 0.08)) / SR;
    const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.5) * 0.55;
    add(s0 + i, v, v);
  }
}
function riser(t0, dur) {
  const len = dur * SR, s0 = Math.round(t0 * SR);
  let lp = 0, ph = 0;
  for (let i = 0; i < len; i++) {
    const x = i / len;
    const n = noise();
    const c = 0.02 + 0.5 * x * x;
    lp += (n - lp) * c;
    ph += (200 + 1800 * x * x) / SR;
    const tone = Math.sin(2 * Math.PI * ph) * 0.05;
    const v = (lp * 0.35 + tone) * x * x;
    add(s0 + i, v * (1 - 0.3 * Math.sin(x * 40)), v * (1 + 0.3 * Math.sin(x * 40)));
  }
}
function bassNote(t0, dur, midi) {
  const len = dur * SR, s0 = Math.round(t0 * SR), f = mtof(midi);
  let ph = 0, ph2 = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += f / SR; ph2 += (f * 0.5) / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.18);
    const raw = saw(ph) * 0.6 + Math.sin(2 * Math.PI * ph2) * 0.6;
    lp += (raw - lp) * (0.05 + 0.25 * Math.exp(-t / 0.05));
    const v = lp * env * 0.55 * duck(t0 + t);
    add(s0 + i, v, v);
  }
}
function padChord(t0, dur, notes, gain = 1) {
  const len = dur * SR, s0 = Math.round(t0 * SR);
  const dets = [-0.12, 0, 0.12];
  const voices = [];
  notes.forEach((m, k) => dets.forEach((d, j) => voices.push({ f: mtof(m + d), ph: (k * 0.31 + j * 0.17) % 1, pan: (j - 1) * 0.6 })));
  let lpL = 0, lpR = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let l = 0, r = 0;
    for (const v of voices) { v.ph += v.f / SR; const s = saw(v.ph); l += s * (1 - v.pan); r += s * (1 + v.pan); }
    lpL += (l - lpL) * 0.06; lpR += (r - lpR) * 0.06;
    const env = Math.min(1, t / 0.08) * Math.min(1, (len - i) / (0.08 * SR));
    const g = env * 0.028 * gain * (0.35 + 0.65 * duck(t0 + t));
    add(s0 + i, lpL * g, lpR * g);
  }
}
function pluck(t0, midi, cut, gain = 1, pan = 0) {
  const len = 0.22 * SR, s0 = Math.round(t0 * SR), f = mtof(midi);
  let ph = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += f / SR;
    const sq = ph % 1 < 0.5 ? 1 : -1;
    lp += (sq - lp) * (0.03 + 0.4 * cut * Math.exp(-t / 0.05));
    const v = lp * Math.exp(-t / 0.07) * 0.13 * gain * (0.5 + 0.5 * duck(t0 + t));
    add(s0 + i, v * (1 - pan), v * (1 + pan));
    addSend(s0 + i, v * 0.35, v * 0.35);
  }
}
function leadNote(t0, dur, midi) {
  const len = dur * SR, s0 = Math.round(t0 * SR), f = mtof(midi);
  let p1 = 0, p2 = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.15);
    p1 += (f * vib) / SR; p2 += (f * vib * 1.005) / SR;
    const raw = saw(p1) * 0.6 + saw(p2) * 0.5;
    lp += (raw - lp) * 0.22;
    const env = Math.min(1, t / 0.01) * (0.6 + 0.4 * Math.exp(-t / 0.1)) * Math.min(1, (len - i) / (0.02 * SR));
    const v = lp * env * 0.12;
    add(s0 + i, v * 0.9, v * 1.1);
    addSend(s0 + i, v * 0.5, v * 0.5);
  }
}

// ---------- sequence ----------
for (let bar = 0; bar < BARS; bar++) {
  const a = arr(bar);
  const t = bar * BAR;
  const [bass, triad] = CHORDS[bar % 4];
  const outroFade = bar >= 60 ? 1 - (bar - 60) / 4.2 : 1;

  if (a.pad) padChord(t, BAR, triad.map((m) => m), (sec(bar) === 4 ? 1.4 : 1) * outroFade);
  for (let b = 0; b < 4; b++) {
    const tb = t + b * BEAT;
    if (a.kick) kick(tb, sec(bar) === 0 ? 0.7 : 1);
    if (a.clap && (b === 1 || b === 3)) clap(tb);
    if (a.ohat) hat(tb + BEAT / 2, true);
    if (a.bass) { bassNote(tb + BEAT / 2, BEAT / 2 * 0.9, bass); if (sec(bar) === 6) bassNote(tb + BEAT * 0.75, BEAT / 4 * 0.9, bass + 12); }
  }
  if (a.hat) for (let s = 0; s < 16; s++) if (s % 2 === 1 || sec(bar) === 6) hat(t + s * BEAT / 4, false, s % 4 === 2 ? 1 : 0.7);
  // arp 16ths
  if (a.arp) {
    const tones = [triad[0] + 12, triad[1] + 12, triad[2] + 12, triad[0] + 24];
    const pat = [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 1, 0, 1, 2, 3];
    for (let s = 0; s < 16; s++) pluck(t + s * BEAT / 4, tones[pat[s]], a.arpCut, outroFade, s % 2 ? 0.3 : -0.3);
  }
  if (a.lead) {
    const row = LEAD[bar % 4];
    for (let e = 0; e < 8; e++) if (row[e] > 0) leadNote(t + e * BEAT / 2, BEAT / 2 * 0.9, row[e]);
  }
  if (a.roll) {
    // snare roll accelerating: 8ths -> 16ths -> 32nds over the bar
    const sub = bar % 8 === 7 ? [8, 16] : [4, 8];
    for (let half = 0; half < 2; half++) {
      const n = sub[half];
      for (let k = 0; k < n; k++) snare(t + half * 2 * BEAT + k * (2 * BEAT / n), 0.35 + 0.65 * ((half * n + k) / (2 * n)));
    }
  }
  if (a.riser) riser(t, BAR);
}
for (const b of CRASH_BARS) crash(b * BAR, b === 42 || b === 45 ? 0.6 : 1);
for (const b of IMPACT_BARS) impact(b * BAR);
kick(56 * BAR); // extra punch on the merger downbeat

// ---------- delay (3/16 ping-pong) ----------
const D = Math.round(BEAT * 0.75 * SR);
for (let i = D; i < N; i++) {
  sendL[i] += sendR[i - D] * 0.38;
  sendR[i] += sendL[i - D] * 0.38;
}
for (let i = 0; i < N; i++) { L[i] += sendL[i] * 0.6; R[i] += sendR[i] * 0.6; }

// ---------- master: normalise, soft clip, fade out ----------
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 1.25 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = t > DUR - 3 ? Math.max(0, (DUR - t) / 3) : 1;
  const l = Math.tanh(L[i] * g) * 0.92 * fade, r = Math.tanh(R[i] * g) * 0.92 * fade;
  buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}
const out = process.argv[2] || "bgm.wav";
writeFileSync(out, buf);
console.log(`wrote ${out}: ${DUR.toFixed(3)} s, ${BPM} BPM, peak pre-gain ${peak.toFixed(2)}`);
