// Runs on every Netlify deploy. Scans samples/** and writes samples/index.json.
// Folder = subfolder name. BPM / key / tags are read from the filename:
//   kick_133.wav   bass_133_Fmin_[dark,epic].wav   pad_133_Cmin_#cinematic#sad.wav
// To override name/tags/folder for a file, add an entry to samples/overrides.json (same fields).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, 'samples');
const AUDIO = /\.(wav|mp3|m4a|aac|aif|aiff|flac|ogg|caf)$/i;
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
const out = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else if (AUDIO.test(e.name)) {
      const o = overrides[r] || overrides[e.name] || {}; const m = meta(e.name);
      out.push({ id: 'lib-' + r.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), file: r, name: o.name || clean(e.name), folder: o.folder || (rel ? rel.split('/').join(' / ') : 'Library'), bpm: o.bpm ?? m.bpm, key: o.key ?? m.key, tags: o.tags || tags(e.name) });
    }
  }
})(ROOT, '');
fs.writeFileSync(path.join(ROOT, 'index.json'), JSON.stringify(out, null, 1));
console.log('samples/index.json: ' + out.length + ' samples');
