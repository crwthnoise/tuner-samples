// Runs on every Netlify deploy. Scans samples/** and writes samples/index.json.
// Folder = subfolder name. BPM / key / tags are read from the filename:
//   kick_133.wav   bass_133_Fmin_[dark,epic].wav   pad_133_Cmin_#cinematic#sad.wav
// To override name/tags/folder for a file, add an entry to samples/overrides.json (same fields).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, 'samples');
const AUDIO = /\.(wav|mp3|m4a|aac|aif|aiff|flac|ogg|caf)$/i;
let META = {}; try { META = JSON.parse(fs.readFileSync(path.join(ROOT, 'meta.json'), 'utf8')); } catch (e) {}
let overrides = {}; try { for (const o of JSON.parse(fs.readFileSync(path.join(ROOT, 'overrides.json'), 'utf8'))) if (o.file) overrides[o.file] = o; } catch (e) {}
function meta(name) {
  let bpm = null, key = null;
  for (const p of name.replace(/\.[^.]+$/, '').toUpperCase().split(/[_\s\-]/)) {
    if (!bpm && /^\d{2,3}$/.test(p)) { const n = +p; if (n >= 40 && n <= 240) bpm = n; }
    if (!key && /^[A-G]#?(MIN|MAJ)$/.test(p)) { const sharp = p[1] === '#'; key = p[0] + (sharp ? '#' : '') + (p.endsWith('MIN') ? 'min' : 'maj'); }
  }
  return { bpm, key };
}
function tags(name) { const t = []; const m = name.match(/\[([^\]]+)\]|\(([^)]+)\)/); if (m) (m[1] || m[2]).split(/[,;|]/).forEach(x => { x = x.trim().toLowerCase(); if (x) t.push(x); }); (name.match(/#([a-z0-9\-]+)/gi) || []).forEach(h => t.push(h.slice(1).toLowerCase())); return [...new Set(t)]; }
function clean(name) { const base = name.replace(/\.[^.]+$/, ''); const out = base.replace(/\[[^\]]*\]|\([^)]*\)|#[a-z0-9\-]+/gi, '').split(/[_\-\s]+/).filter(t => { if (!t) return false; if (/^\d{2,3}$/.test(t)) { const n = +t; if (n >= 40 && n <= 240) return false; } if (/^(\d{2,3})?bpm$/i.test(t)) return false; if (/^[A-G]#?(min|maj|m)$/i.test(t)) return false; return true; }).join(' ').trim(); return out || base; }

/* waveform for the library rows (v10.9): 96 peak values 0-99, read straight from WAV PCM — the app draws rows without downloading the loop */
function wavPeaks(file, n = 96) {
  try {
    const b = fs.readFileSync(file); if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
    let p = 12, fmt = null, data = null;
    while (p + 8 <= b.length) { const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4);
      if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), bits: b.readUInt16LE(p + 22) };
      if (id === 'data') { data = { off: p + 8, len: Math.min(sz, b.length - p - 8) }; break; }
      p += 8 + sz + (sz & 1); }
    if (!fmt || !data) return null;
    const bps = fmt.bits / 8, frame = bps * fmt.ch, frames = Math.floor(data.len / frame); if (!frames) return null;
    const rd = o => fmt.tag === 3 ? (bps === 4 ? b.readFloatLE(o) : b.readDoubleLE(o)) : bps === 2 ? b.readInt16LE(o) / 32768 : bps === 3 ? b.readIntLE(o, 3) / 8388608 : bps === 4 ? b.readInt32LE(o) / 2147483648 : (b[o] - 128) / 128;
    const out = new Array(n).fill(0), per = frames / n, step = Math.max(1, Math.floor(per / 400));
    for (let i = 0; i < n; i++) { let mx = 0; const a = Math.floor(i * per), z = Math.floor((i + 1) * per);
      for (let f = a; f < z; f += step) for (let c = 0; c < fmt.ch; c++) { const v = Math.abs(rd(data.off + f * frame + c * bps)); if (v > mx) mx = v; }
      out[i] = mx; }
    const top = Math.max(...out) || 1; return out.map(v => Math.round(v / top * 99));
  } catch (e) { return null; }
}
const out = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else if (AUDIO.test(e.name)) {
      const o = overrides[r] || overrides[e.name] || {}; const m = meta(e.name);
      out.push({ id: 'lib-' + (META[r] ? r.replace(/\.m4a$/i, '.wav') : r).replace(/[^a-z0-9]+/gi, '-').toLowerCase(), file: r, name: e.name.replace(/\.[^.]+$/, '').replace(/_?\[[^\]]*\]|_?#[a-z0-9\-]+/gi, '').toUpperCase(),   /* v10.23: always the ORIGINAL file name, ALL CAPS */ folder: o.folder || (rel ? rel.split('/').join(' / ') : 'Library'), bpm: o.bpm ?? m.bpm, key: o.key ?? m.key, tags: o.tags || tags(e.name), peaks: (META[r] && META[r].peaks) || wavPeaks(path.join(dir, e.name)), ...(META[r] ? { frames: META[r].frames, sr: META[r].sr, fpAt: META[r].fpAt, fpScale: META[r].fpScale, fp: META[r].fp } : {}) });
    }
  }
})(ROOT, '');
fs.writeFileSync(path.join(ROOT, 'index.json'), '[\n' + out.map(o => JSON.stringify(o)).join(',\n') + '\n]\n');
console.log('samples/index.json: ' + out.length + ' samples');
