// v10.23 SMALL LOOPS: turns every samples/**.wav into an AAC .m4a (~10× smaller) and writes samples/meta.json
// with what the app needs to keep loops seamless after decoding:
//   frames  = exact loop length in samples (AAC adds silence at the start + end; the app cuts it back to this)
//   sr      = original sample rate
//   fpAt/fp = a 256-sample fingerprint of the original audio, so the app can find exactly where the loop starts
//   peaks   = waveform for the library rows
// Usage: node tools/encode.js   (needs ffmpeg) — the .wav files are removed after encoding (originals live on the Mac)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', 'samples');
const META = path.join(ROOT, 'meta.json');
let meta = {}; try { meta = JSON.parse(fs.readFileSync(META, 'utf8')); } catch (e) {}

function readWav(file) {
  const b = fs.readFileSync(file); if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not RIFF');
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) { const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { data = { off: p + 8, len: Math.min(sz, b.length - p - 8) }; break; }
    p += 8 + sz + (sz & 1); }
  const bps = fmt.bits / 8, frame = bps * fmt.ch, frames = Math.floor(data.len / frame);
  const tag = fmt.tag === 0xFFFE ? (bps === 4 && fmt.bits === 32 ? 3 : 1) : fmt.tag;
  const rd = o => tag === 3 ? (bps === 4 ? b.readFloatLE(o) : b.readDoubleLE(o)) : bps === 2 ? b.readInt16LE(o) / 32768 : bps === 3 ? b.readIntLE(o, 3) / 8388608 : bps === 4 ? b.readInt32LE(o) / 2147483648 : (b[o] - 128) / 128;
  const mono = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += rd(data.off + f * frame + c * bps); mono[f] = s / fmt.ch; }
  return { sr: fmt.sr, ch: fmt.ch, frames, mono };
}
function peaks(mono, n = 96) { const out = new Array(n).fill(0), per = mono.length / n; for (let i = 0; i < n; i++) { let mx = 0; for (let f = Math.floor(i * per); f < Math.floor((i + 1) * per); f++) { const v = Math.abs(mono[f]); if (v > mx) mx = v; } out[i] = mx; } const top = Math.max(...out) || 1; return out.map(v => Math.round(v / top * 99)); }
/* fingerprint: the 256-sample block (inside the first 3 s, not at the very start) with the most high-frequency detail = sharpest match */
function fingerprint(mono, sr) {
  const N = 256, lim = Math.min(mono.length - N, Math.floor(sr * 3)); let best = 4096, bestE = -1;
  for (let a = 4096; a < lim; a += 128) { let e = 0; for (let i = 1; i < N; i++) { const d = mono[a + i] - mono[a + i - 1]; e += d * d; } if (e > bestE) { bestE = e; best = a; } }
  if (lim <= 4096) best = 0;
  const top = Math.max(1e-6, ...Array.from(mono.subarray(best, best + N), Math.abs));
  const i16 = new Int16Array(N); for (let i = 0; i < N; i++) i16[i] = Math.round(mono[best + i] / top * 32767);
  return { fpAt: best, fpScale: +top.toFixed(6), fp: Buffer.from(i16.buffer).toString('base64') };
}
let n = 0, before = 0, after = 0;
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name, full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full, r); continue; }
    if (!/\.wav$/i.test(e.name)) continue;
    const w = readWav(full), outRel = r.replace(/\.wav$/i, '.m4a'), out = path.join(ROOT, outRel);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', full, '-c:a', 'aac', '-b:a', w.ch > 1 ? '160k' : '96k', '-movflags', '+faststart', out]);
    meta[outRel] = { frames: w.frames, sr: w.sr, ...fingerprint(w.mono, w.sr), peaks: peaks(w.mono), src: e.name };
    before += fs.statSync(full).size; after += fs.statSync(out).size; fs.unlinkSync(full); n++;
    process.stdout.write('.');
  }
})(ROOT, '');
fs.writeFileSync(META, '{\n' + Object.entries(meta).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n}\n');
console.log(`\n${n} loops: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
