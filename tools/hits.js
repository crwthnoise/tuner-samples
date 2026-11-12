// v11 AUTO-SIDECHAIN: finds where the KICK and SNARE hit in every loop and bakes the times into samples/meta.json
// (hk = kick times in seconds, hs = snare times) — build.js copies them into samples/index.json, so the app never has to listen first.
// Hats / other perc are ignored on purpose. Same detector idea as modules/steps.js detectHits, plus a DECAY check
// so sustained bass notes and pads are NOT taken for kicks.
// Usage: node tools/hits.js            (needs ffmpeg; only (re)analyses files that have no hk/hs yet)
//        node tools/hits.js --all      (re-analyse everything)
//        node tools/hits.js --report   (print what it finds, change nothing)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', 'samples'), META = path.join(ROOT, 'meta.json');
const ALL = process.argv.includes('--all'), REPORT = process.argv.includes('--report');
const SR = 44100;

function biquad(type, f0, Q, sr) {
  const w = 2 * Math.PI * f0 / sr, c = Math.cos(w), s = Math.sin(w), a = s / (2 * Q); let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = a; b1 = 0; b2 = -a; }   // bp (0 dB peak)
  const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
function run(x, q) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = q.b0 * x[i] + q.b1 * x1 + q.b2 * x2 - q.a1 * y1 - q.a2 * y2; y[i] = v; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; } return y; }

function detect(mono, sr) {
  const lo = run(run(mono, biquad('lp', 110, 0.707, sr)), biquad('lp', 110, 0.707, sr));
  const mid = run(run(mono, biquad('hp', 200, 0.707, sr)), biquad('lp', 2800, 0.707, sr));   // snare body + crack
  const hi = run(run(mono, biquad('hp', 7000, 0.707, sr)), biquad('hp', 7000, 0.707, sr));    // hats / air — only used to REJECT hat leakage
  const hop = Math.round(sr * 0.005);
  const env = d => { const n = Math.floor(d.length / hop), e = new Float32Array(n); let mx = 0; for (let i = 0; i < n; i++) { let m = 0; for (let j = i * hop, z = j + hop; j < z; j++) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > m) m = v; } e[i] = m; if (m > mx) mx = m; } return { e, mx }; };
  const L = env(lo), M = env(mid), H = env(hi);
  const onsets = ({ e, mx }, lvl, decayAt, decayMax) => {
    const O = []; let lastT = -1;
    for (let i = 0; i < e.length; i++) {
      const rise = e[i] - Math.max(i > 0 ? e[i - 1] : 0, i > 1 ? e[i - 2] * 0.9 : 0);
      if (e[i] > lvl * mx && rise > 0.18 * mx) {
        const t = i * hop / sr;
        if (t - lastT > 0.09) {
          let pk = e[i]; for (let j = i; j < Math.min(e.length, i + 6); j++) pk = Math.max(pk, e[j]);
          O.push({ t: Math.max(0, t - 0.005), pk, i }); lastT = t;
        }
      }
    }
    // decay check: a drum hit falls away; a held bass note / pad does not
    return O.filter((o, n) => { const j = o.i + Math.round(decayAt * sr / hop), nxt = O[n + 1]; if (j >= e.length) return true; if (nxt && nxt.i <= j) return true; return e[j] < decayMax * o.pk; });
  };
  // the filtered envelopes peak a little AFTER the real attack — walk back to where the raw audio really starts, so the duck lands ON the hit
  const refine = o => { const a = Math.max(0, Math.floor((o.t - 0.06) * sr)), z = Math.min(mono.length, Math.floor((o.t + 0.012) * sr)); let m = 0; for (let j = a; j < z; j++) { const v = Math.abs(mono[j]); if (v > m) m = v; } for (let j = a; j < z; j++) if (Math.abs(mono[j]) > 0.22 * m) return Math.max(0, j / sr - 0.001); return o.t; };
  const K = onsets(L, 0.35, 0.12, 0.8).map(o => ({ ...o, t: refine(o) }));
  const lowAt = o => { let m = 0; for (let j = Math.max(0, o.i - 1); j < Math.min(L.e.length, o.i + 5); j++) m = Math.max(m, L.e[j]); return m; };
  // snare = mid-band hit that is NOT a kick and NOT a hat: the mids must clearly beat the highs at that moment
  const Mo = onsets(M, 0.5, 0.12, 0.6).map(o => ({ ...o, t: refine(o) }));
  // a mid hit with real low-end under it is a KICK the low band under-read (soft sub) — promote it; the rest are snare candidates
  Mo.forEach(o => { if (lowAt(o) > 0.3 * L.mx && !K.some(k => Math.abs(k.t - o.t) < 0.035)) K.push(o); }); K.sort((a, b) => a.t - b.t);
  const S = Mo.filter(o => lowAt(o) <= 0.3 * L.mx).filter(o => { if (K.some(k => Math.abs(k.t - o.t) < 0.035)) return false; let h = 0; for (let j = o.i; j < Math.min(H.e.length, o.i + 4); j++) h = Math.max(h, H.e[j]); return o.pk > 0.8 * h; });
  return { hk: K.map(o => +o.t.toFixed(3)), hs: S.map(o => +o.t.toFixed(3)), mx: Math.max(L.mx, M.mx) };
}
function decode(file) { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)); }

// only DRUM loops carry sidechain hits. Bass / lead / vocal / chord loops have attacks too, but they must never trigger ducking.
// hats and tops are ignored on purpose. (Name or folder decides; own uploads are checked by the app itself.)
const DRUMISH = /KICK|SNARE|DRUM|DROP|CLAP|BREAK|\bBD\b|STEPS/i, NOT_DRUM = /HAT|\bTOP\b|PERC|BASS_LOOP|LEAD|VOCAL|CHORD|MELODY|SYNTH|PAD|RISER/i;
const isDrum = r => DRUMISH.test(r) && !(NOT_DRUM.test(path.basename(r)) && !/DRUM|KICK|SNARE/i.test(path.basename(r)));
let meta = {}; try { meta = JSON.parse(fs.readFileSync(META, 'utf8')); } catch (e) {}
let done = 0, withHits = 0; const rep = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name, full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full, r); continue; }
    if (!/\.(m4a|wav|mp3|aac|ogg|flac)$/i.test(e.name)) continue;
    const m = meta[r] = meta[r] || {};
    if (!ALL && !REPORT && m.hk) continue;
    let x; try { x = decode(full); } catch (err) { console.log('skip', r, String(err.message).slice(0, 80)); continue; }
    const h = isDrum(r) ? detect(x, SR) : { hk: [], hs: [] }; done++;
    if (h.hk.length + h.hs.length >= 2) withHits++;
    rep.push(r.padEnd(60).slice(0, 60) + ' kick ' + String(h.hk.length).padStart(2) + '  snare ' + String(h.hs.length).padStart(2));
    if (!REPORT) { m.hk = h.hk; m.hs = h.hs; }
  }
})(ROOT, '');
if (!REPORT) fs.writeFileSync(META, JSON.stringify(meta));
console.log(rep.join('\n')); console.log(`analysed ${done} loops · ${withHits} carry kick/snare hits` + (REPORT ? ' (report only)' : ' · saved to samples/meta.json'));
