/* NOTES (v10.45, TNR-4729.20) — change the notes of a bassline (or any one-note-at-a-time sound) right in TUNER.
   It keeps YOUR sound: every note is the real slice of the audio, moved / re-pitched / shortened. Nothing gets re-synthesized.
   Notes come from the sound's MIDI (MAKE / SING keep it); a plain loop gets its notes read from the audio.
   The first change makes "<name> · EDIT" in the library and swaps it onto the track; the original stays untouched. */
(function(){
'use strict';
const API = window.TNOTES = window.TNOTES || {};   /* (TUNER already has a NOTES list of note names) */
const $ = id => document.getElementById(id);
const mk = (t, c, h) => { const e = document.createElement(t); if(c) e.className = c; if(h != null) e.innerHTML = h; return e; };
const NN = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const pname = p => NN[((p % 12) + 12) % 12] + (Math.floor(p/12) - 1);

/* ---------- MIDI in / out ---------- */
function parseSMF(ab){
  const d = new DataView(ab); let i = 0; const str = n => { let s = ''; for(let k=0;k<n;k++) s += String.fromCharCode(d.getUint8(i+k)); return s; };
  if(str(4) !== 'MThd') return null; const hl = d.getUint32(4); const ntr = d.getUint16(10), div = d.getUint16(12); const ppq = div & 0x8000 ? 480 : div; i = 8 + hl;
  const notes = [];
  for(let t=0; t<ntr && i < d.byteLength; t++){
    if(str(4) !== 'MTrk'){ break; } const len = d.getUint32(i+4); let p = i + 8; const end = p + len; let tick = 0, run = 0; const on = {};
    const vlq = ()=>{ let v = 0, b; do{ b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while(b & 0x80); return v; };
    while(p < end){ tick += vlq(); let st = d.getUint8(p); if(st & 0x80){ p++; run = st; } else st = run;
      const ty = st & 0xf0;
      if(st === 0xff){ p++; const l = vlq(); p += l; continue; } if(st === 0xf0 || st === 0xf7){ const l = vlq(); p += l; continue; }
      if(ty === 0x90 || ty === 0x80){ const n = d.getUint8(p), v = d.getUint8(p+1); p += 2; const k = (st & 15) + ':' + n;
        if(ty === 0x90 && v > 0){ on[k] = { tick, v }; } else if(on[k]){ notes.push({ b:on[k].tick/ppq, len:Math.max(1/64, (tick - on[k].tick)/ppq), p:n, v:on[k].v }); delete on[k]; } }
      else if(ty === 0xc0 || ty === 0xd0) p += 1; else p += 2; }
    i = end; }
  return notes.sort((a,b)=>a.b-b.b);
}
function writeSMF(notes, bpm){
  const ppq = 480, ev = []; notes.forEach(n=>{ const s = Math.round(n.b*ppq), e = Math.max(s+1, Math.round((n.b+n.len)*ppq)); ev.push([s, 0x90, n.p, n.v||100]); ev.push([e, 0x80, n.p, 0]); });
  ev.sort((a,b)=> a[0]-b[0] || a[1]-b[1]);
  const tr = []; const vlq = v => { const o = [v & 0x7f]; while(v >>= 7) o.unshift((v & 0x7f) | 0x80); return o; };
  const us = Math.round(60000000/(bpm||120)); tr.push(0, 0xff, 0x51, 3, (us>>16)&255, (us>>8)&255, us&255);
  let last = 0; ev.forEach(([t, s, n, v])=>{ tr.push(...vlq(t - last), s, n, v); last = t; }); tr.push(0, 0xff, 0x2f, 0);
  const out = new Uint8Array(14 + 8 + tr.length), dv = new DataView(out.buffer);
  out.set([0x4d,0x54,0x68,0x64], 0); dv.setUint32(4, 6); dv.setUint16(8, 0); dv.setUint16(10, 1); dv.setUint16(12, ppq);
  out.set([0x4d,0x54,0x72,0x6b], 14); dv.setUint32(18, tr.length); out.set(tr, 22); return out.buffer;
}

/* ---------- read notes from audio (one note at a time: bass, leads) ---------- */
function detectNotes(buf, spb){
  /* pitch track at ~8 kHz, 20 ms frames; a new note starts when the pitch changes or the level jumps */
  const sr0 = buf.sampleRate, k = Math.max(1, Math.floor(sr0/8000)), sr = sr0/k, src = buf.getChannelData(0), N = Math.floor(src.length/k), d = new Float32Array(N);
  for(let i=0;i<N;i++){ let a = 0; for(let j=0;j<k;j++) a += src[i*k + j]; d[i] = a/k; }
  const hop = Math.round(sr*0.02), W = Math.round(sr*0.064), F = Math.max(0, Math.floor((N - W)/hop)), minL = Math.floor(sr/500), maxL = Math.min(Math.floor(sr/27), W - 8);
  const P = new Float32Array(F), E = new Float32Array(F); let mx = 0;
  for(let f=0; f<F; f++){ const a = f*hop; let e0 = 0; for(let j=0;j<W;j++) e0 += d[a+j]*d[a+j]; E[f] = Math.sqrt(e0/W); if(E[f] > mx) mx = E[f];
    if(e0 < 1e-7){ P[f] = 0; continue; } let best = 0, bl = 0; const Wc = W - maxL;
    for(let L=minL; L<=maxL; L++){ let c = 0, e1 = 0, e2 = 0; for(let j=0;j<Wc;j++){ const x = d[a+j], y = d[a+j+L]; c += x*y; e1 += x*x; e2 += y*y; } const r = c/Math.sqrt(e1*e2 + 1e-12); if(r > best + 0.01){ best = r; bl = L; } }
    P[f] = best > 0.6 && bl ? 69 + 12*Math.log2((sr/bl)/440) : 0; }
  if(mx <= 0) return [];
  const out = []; let cur = null;
  const close = f => { if(cur){ const ps = cur.ps.slice().sort((a,b)=>a-b), p = Math.round(ps[Math.floor(ps.length/2)]); const t0 = Math.max(0, cur.f0*hop/sr - 0.008), t1 = f*hop/sr + W/sr*0.5; if(t1 - t0 > 0.05) out.push({ b:t0/spb, len:(t1 - t0)/spb, p, v:100 }); cur = null; } };
  for(let f=0; f<F; f++){ const voiced = P[f] > 0 && E[f] > 0.08*mx, pr = Math.round(P[f]);
    if(!voiced){ close(f); continue; }
    const jump = f > 1 && E[f] - Math.min(E[f-1], E[f-2]) > 0.22*mx;
    if(cur){ const cp = Math.round(cur.ps[cur.ps.length - 1]); const nxt = f + 1 < F ? Math.round(P[f+1]) : pr; if((pr !== cp && nxt === pr) || jump){ close(f); } }
    if(!cur) cur = { f0:f, ps:[] }; cur.ps.push(P[f]); }
  close(F);
  return out;
}
/* ---------- state ---------- */
let zone = null, ed = null;   /* ed = { ch, orig, src (buffer the slices come from), spb, notes[], beats, sel, edit (sample) } */
const scaleSet = ()=>{ const k = songKeyState || (ed && parseKey(ed.orig.key)); if(!k) return null; const deg = k.minor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11]; return new Set(deg.map(x=>(x + k.root) % 12)); };
let snapScale = true;
function snapPitch(p, dir){ const S = scaleSet(); if(!snapScale || !S) return p; if(S.has(((p % 12) + 12) % 12)) return p; for(let k=1;k<7;k++){ const a = p + k*(dir || 1), b = p - k*(dir || 1); if(S.has(((a % 12)+12)%12)) return a; if(S.has(((b % 12)+12)%12)) return b; } return p; }

async function open(ch){
  if(!ch){ setStatus('tap a loop first'); return; }
  const s = ch.sample; if(!s.buffer) await ensureLoaded(s); if(!s.buffer){ setStatus("can't read that sound"); return; }
  let saved = null; try{ saved = await Store.get('notes:' + s.id); }catch(e){}
  let orig = s, src = s.buffer, notes = null, how = 'MIDI';
  if(saved && saved.notes){ const o = samples.find(x=>x.id === saved.orig); if(o){ if(!o.buffer) await ensureLoaded(o); if(o.buffer){ orig = o; src = o.buffer; notes = saved.notes.map(n=>Object.assign({}, n, { src:Object.assign({}, n.src) })); how = 'EDIT'; } } }
  const spb = 60/sampleBpm(orig);
  if(!notes){
    let mid = null; if(s.midi || s.folder === 'MADE'){ try{ mid = await Store.get('smidi:' + s.id); }catch(e){} }
    let L = mid ? parseSMF(mid instanceof ArrayBuffer ? mid : (mid.buffer || mid)) : null;
    if(!L || !L.length){ L = detectNotes(src, spb); how = 'READ FROM THE AUDIO'; }
    if(!L.length){ setStatus('no clear notes in this one (works best on one-note-at-a-time sounds)'); return; }
    notes = L.map((n, i)=>{ const t0 = n.b*spb, nx = L[i+1], t1 = Math.min(src.duration, Math.max(t0 + n.len*spb, nx ? Math.min(nx.b*spb, t0 + n.len*spb + 0.04) : t0 + n.len*spb + 0.04));
      return { b:n.b, len:n.len, p:n.p, v:n.v || 100, src:{ t0, t1, p0:n.p } }; });
  }
  ed = { ch, orig, src, spb, notes, beats:loopBeats(s), sel:-1, edit: saved && saved.notes ? s : null, how };
  lock.on = false; lock.base = new WeakMap(); lock.marks = []; shuf.ref = null; shuf.level = 0; shuf.hist = []; if(zone){ paintLock(); $('ntInfo').textContent = 'changes land on the track as you go'; }
  zone.classList.add('on'); $('ntTitle').textContent = (s.displayName || 'sound').toUpperCase(); $('ntHow').textContent = notes.length + ' notes · ' + how; paint(); draw(); headLoop();
}
function close(){ zone.classList.remove('on'); }

/* ---------- render the edited notes from the original slices ---------- */
let rT = null, saveT = null, busy = false, again = false;
function changed(){ clearTimeout(rT); rT = setTimeout(render, 160); draw(); }
async function render(){
  if(busy){ again = true; return; } busy = true;
  try{
    const sr = ed.src.sampleRate, len = ed.beats*ed.spb, oc = new OfflineAudioContext(ed.src.numberOfChannels, Math.ceil(len*sr), sr);
    ed.notes.forEach(n=>{ const r = Math.pow(2, (n.p - n.src.p0)/12), t = n.b*ed.spb; if(t >= len) return; const s = oc.createBufferSource(); s.buffer = ed.src; s.playbackRate.value = r;
      const g = oc.createGain(); s.connect(g); g.connect(oc.destination); const avail = Math.max(0.01, (n.src.t1 - n.src.t0)/r), want = Math.min(n.len*ed.spb, len - t), XF = 0.008;
      if(want <= avail + 0.003 || avail < 0.04){ const dur = Math.min(want, avail);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.002); g.gain.setValueAtTime(1, t + Math.max(0.002, dur - 0.006)); g.gain.linearRampToValueAtTime(0, t + dur);
        s.start(t, n.src.t0); s.stop(t + dur + 0.005); return; }
      /* v10.47b: longer than its slice (GROOVE LOCK stretched it) → keep it ringing by looping the note's own tail, crossfaded — no bleed from the next note */
      const a = t + avail - XF; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.002); g.gain.setValueAtTime(1, a); g.gain.linearRampToValueAtTime(0, a + XF);
      s.start(t, n.src.t0); s.stop(a + XF + 0.002);
      const tailLen = Math.min(0.06, (n.src.t1 - n.src.t0)*0.4), ls = n.src.t1 - tailLen, e = oc.createBufferSource(); e.buffer = ed.src; e.playbackRate.value = r; e.loop = true; e.loopStart = ls; e.loopEnd = n.src.t1;
      const g2 = oc.createGain(); e.connect(g2); g2.connect(oc.destination); const end = t + want;
      g2.gain.setValueAtTime(0, a); g2.gain.linearRampToValueAtTime(1, a + XF); g2.gain.setValueAtTime(1, Math.max(a + XF, end - 0.006)); g2.gain.linearRampToValueAtTime(0, end);
      e.start(a, n.src.t1 - XF*r); e.stop(end + 0.005); });
    const buf = await oc.startRendering();
    if(!ed.edit){
      const wav = bufferToWav(buf, 24), o = ed.orig;
      const s = await addSample(new File([wav], (o.name || 'sound').replace(/\.[^.]+$/, '') + ' EDIT ' + Date.now() + '.wav', { type:'audio/wav' }), { folder:o.folder === 'MADE' ? 'MADE' : 'My samples', bpm:sampleBpm(o), key:o.key, displayName:(o.displayName || 'sound') + ' · EDIT', tags:(o.tags || []).concat(['edit']), arrayBuf:wav, quiet:true });
      if(!s) return; ed.edit = s; s.midi = true;
      const ch = ed.ch; ch.sample = s; ch.buffer = s.buffer; ch.env = s.env; rebuildBuffer(ch); if(isRunning) reschedule(); refreshTimeline(); drawTL(); markDirty(); commit();
      setStatus('EDIT on the track · the original is still in your library');
    } else {
      const s = ed.edit; s.buffer = buf; s._st = new Map(); s._hq = new Map(); s.env = buildEnvelope(buf); s.peaks = buildPeaks(buf); try{ s.waveImg = renderWaveformImage(buf); }catch(e){}
      channels.forEach(c=>{ if(c.sample === s){ c.buffer = buf; c.env = s.env; rebuildBuffer(c); } }); if(isRunning) reschedule(); drawTL(); markDirty();
    }
    clearTimeout(saveT); const s = ed.edit, notes = ed.notes.map(n=>Object.assign({}, n, { src:Object.assign({}, n.src) })), origId = ed.orig.id, bp = sampleBpm(ed.orig);
    saveT = setTimeout(()=>{ try{ saveSampleAudio(s, bufferToWav(s.buffer, 24), 'audio/wav'); saveSampleMeta(s); Store.set('notes:' + s.id, { orig:origId, notes }); Store.set('smidi:' + s.id, writeSMF(notes, bp)); }catch(e){} commit(); }, 700);
  }catch(e){ setStatus('NOTES: ' + (e && e.message || 'render failed')); }
  finally{ busy = false; if(again){ again = false; render(); } }
}

/* ---------- GROOVE LOCK (v10.47) — the notes that are CLOSE to a hit of another track (your perc) snap onto it ----------
   Only notes within a 1/32 of a hit move; the rest stay where you put them. Strength 0 = your timing, 100 = dead on the perc.
   Non-destructive: the slider always works from where the notes were, so OFF puts them back. */
const LOCK_WIN = 0.125;   /* beats = a 1/32 note */
const lock = { on:false, src:null, amt:100, base:new WeakMap(), marks:[] };
function hitsOf(s){
  if(s._hits) return s._hits; const buf = s.buffer; if(!buf) return [];
  const sr = buf.sampleRate, hop = Math.max(64, Math.round(sr*0.005)), n = Math.floor(buf.length/hop), e = new Float32Array(n), chs = [];
  for(let c=0;c<buf.numberOfChannels;c++) chs.push(buf.getChannelData(c));
  for(let i=0;i<n;i++){ let a = 0; for(const d of chs) for(let j=i*hop, z=j+hop; j<z; j++) a += d[j]*d[j]; e[i] = Math.sqrt(a/(hop*chs.length)); }
  let mx = 0; const fl = new Float32Array(n); fl[0] = e[0]; mx = fl[0]; for(let i=1;i<n;i++){ fl[i] = Math.max(0, e[i] - e[i-1]); if(fl[i] > mx) mx = fl[i]; }
  const out = []; let last = -1e9; const gap = Math.round(0.04*sr/hop);
  for(let i=0;i<n-1;i++){ if(fl[i] < 0.08*mx || (i && fl[i] < fl[i-1]) || fl[i] < fl[i+1]) continue;
    let m = 0, k0 = Math.max(0, i-10), k1 = Math.min(n, i+11); for(let k=k0;k<k1;k++) m += fl[k]; m /= (k1 - k0);
    if(fl[i] < 1.6*m) continue; if(i - last < gap){ if(out.length && fl[i] > out[out.length-1].f){ out[out.length-1] = { t:Math.max(0, (i-0.25)*hop/sr), f:fl[i] }; last = i; } continue; }
    out.push({ t:Math.max(0, (i-0.25)*hop/sr), f:fl[i] }); last = i; }
  return (s._hits = out.map(h=>h.t));
}
function lockSources(){ return channels.filter(c=> c !== ed.ch && c.sample && c.sample.buffer); }
function pickSource(){ const L = lockSources(); return L.find(c=> /perc|drum|top|groove|hat|shak|conga|bongo|baile|loop/i.test(c.sample.displayName || c.sample.name || '')) || L[0] || null; }
const percBeat = (pc, sb)=>{ const pos = samplePosAt(pc, sb); return pos < 0 ? null : pos*sampleBpm(pc.sample)/60; };
function songBeatsOf(b){ const L = ed.beats, out = []; ed.ch.clips.forEach(c=>{ if(c.mute) return; let sb = c.start + (((b - c.off) % L) + L) % L; for(; sb < c.start + c.len; sb += L) out.push(sb); }); return out.sort((a,c)=>a-c); }
function lockDelta(b){
  const pc = lock.src, hits = hitsOf(pc.sample), pl = pc.sample.buffer.duration*sampleBpm(pc.sample)/60, spb = 60/sampleBpm(pc.sample); if(!hits.length) return null;
  for(const sb of songBeatsOf(b)){ const pb = percBeat(pc, sb); if(pb == null) continue; let best = null;
    for(const t of hits){ let d = t/spb - pb; d -= Math.round(d/pl)*pl; if(best == null || Math.abs(d) < Math.abs(best)) best = d; }
    return best; }
  return null;
}
function lockMarks(){ /* where the perc hits land inside this bass loop (drawn as ticks on the roll) */
  const pc = lock.src, hits = hitsOf(pc.sample), spb = 60/sampleBpm(pc.sample), L = ed.beats, out = [];
  const c = ed.ch.clips.find(x=>!x.mute); if(!c || !hits.length) return out; const hb = hits.map(t=>t/spb);
  let prev = null; const st = 1/96;
  for(let x=0; x<L; x+=st){ const sb = c.start + x; if(sb >= c.start + c.len) break; const pb = percBeat(pc, sb); if(pb == null){ prev = null; continue; }
    if(prev != null){ hb.forEach(h=>{ if(pb >= prev ? (h >= prev && h < pb) : (h >= prev || h < pb)) out.push(((x - st + c.off) % L + L) % L); }); }
    prev = pb; }
  return out;
}
function applyLock(){
  if(!ed) return; let near = 0; const cur = ed.notes[ed.sel];
  ed.notes.forEach(n=>{ if(!lock.base.has(n)) lock.base.set(n, { b:n.b, len:n.len }); const o = lock.base.get(n); n.b = o.b; n.len = o.len; });
  if(lock.on && lock.src){
    ed.notes.forEach(n=>{ const o = lock.base.get(n), d = lockDelta(o.b); if(d == null || Math.abs(d) > LOCK_WIN) return; near++; n.b = clamp(o.b + d*lock.amt/100, 0, ed.beats - 1/64); });
    /* v10.47b: lengths follow the groove — a note never gets shorter than you made it, and notes that touched still touch (no clipped gaps) */
    const by = ed.notes.slice().sort((a,c)=> lock.base.get(a).b - lock.base.get(c).b);
    by.forEach((n, i)=>{ const o = lock.base.get(n), nx = by[i+1], ox = nx && lock.base.get(nx);
      const legato = ox && ox.b - (o.b + o.len) < 0.13;
      let L = legato ? nx.b - n.b : o.len + Math.max(0, o.b - n.b);
      if(nx && n.b + L > nx.b) L = nx.b - n.b;
      n.len = Math.max(1/32, Math.min(L, ed.beats - n.b)); });
  }
  ed.notes.sort((a,c)=>a.b-c.b); ed.sel = cur ? ed.notes.indexOf(cur) : -1;
  $('ntInfo').textContent = lock.on && lock.src ? near + ' of ' + ed.notes.length + ' notes locked to ' + (lock.src.sample.displayName || 'the perc').toUpperCase() : 'changes land on the track as you go';
  changed();
}
function paintLock(){ const on = lock.on; $('ntLockBtn').classList.toggle('on', on); $('ntLock').style.display = on ? 'flex' : 'none';
  $('ntLockSrc').textContent = lock.src ? '▸ ' + (lock.src.sample.displayName || 'track').toUpperCase() : 'NO OTHER TRACK'; $('ntLockVal').textContent = lock.amt; $('ntLockAmt').value = lock.amt; }
function setLock(on){
  if(!ed) return; if(on){ if(!lock.src || !channels.includes(lock.src) || lock.src === ed.ch) lock.src = pickSource(); if(!lock.src){ setStatus('add your perc loop to the song first, then LOCK'); return; } }
  lock.on = on; lock.marks = on ? lockMarks() : []; paintLock(); applyLock();
}

/* ---------- the roll ---------- */
let view = { lo:36, hi:60 };
function fitView(){ const ps = ed.notes.map(n=>n.p); const lo = Math.min(...ps), hi = Math.max(...ps); const mid = Math.round((lo + hi)/2), span = Math.max(18, hi - lo + 8); view = { lo:mid - Math.ceil(span/2), hi:mid + Math.ceil(span/2) }; }
function geom(){ const cv = $('ntRoll'), r = cv.getBoundingClientRect(), KW = 30; return { cv, r, KW, w:r.width - KW, h:r.height, rows:view.hi - view.lo + 1 }; }
const xOf = (g, b)=> g.KW + b/ed.beats*g.w, yOf = (g, p)=> (view.hi - p)*g.h/g.rows;
function draw(){
  if(!ed || !zone.classList.contains('on')) return; const cv = $('ntRoll'), cx = cv.getContext('2d'); const s = fitCanvas(cv, cx); if(!s) return;
  if(!draw._fit){ fitView(); draw._fit = true; }
  const g = geom(), rh = g.h/g.rows, S = scaleSet(), cs = getComputedStyle(document.documentElement), green = cs.getPropertyValue('--green').trim() || '#4fd1a5', mono = cs.getPropertyValue('--mono').trim() || 'monospace';
  cx.clearRect(0, 0, s.w, s.h);
  for(let p=view.lo; p<=view.hi; p++){ const y = yOf(g, p), pc = ((p % 12) + 12) % 12, inS = S && S.has(pc);
    cx.fillStyle = pc === 0 ? 'rgba(242,237,226,.07)' : inS ? 'rgba(79,209,165,.05)' : (S ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.015)'); cx.fillRect(g.KW, y, g.w, rh);
    cx.fillStyle = [1,3,6,8,10].includes(pc) ? '#14110e' : '#2a2520'; cx.fillRect(0, y + 0.5, g.KW - 3, rh - 1);
    if(pc === 0 || rh > 13){ cx.fillStyle = pc === 0 ? '#f2ede2' : '#8a8276'; cx.font = '7px ' + mono; cx.fillText(pname(p), 2, y + rh/2 + 2.5); } }
  for(let b=0; b<=ed.beats*4; b++){ const x = xOf(g, b/4); cx.fillStyle = b % 16 === 0 ? 'rgba(242,237,226,.25)' : b % 4 === 0 ? 'rgba(242,237,226,.1)' : 'rgba(242,237,226,.035)'; cx.fillRect(x, 0, 1, g.h); }
  if(lock.on) lock.marks.forEach(b=>{ const x = xOf(g, b); cx.fillStyle = 'rgba(211,47,47,.55)'; cx.fillRect(x, 0, 1, g.h); });
  ed.notes.forEach((n, i)=>{ const x = xOf(g, n.b), w = Math.max(3, n.len/ed.beats*g.w), y = yOf(g, n.p), sel = i === ed.sel;
    cx.fillStyle = sel ? '#f2ede2' : green; cx.globalAlpha = sel ? 1 : 0.85; cx.fillRect(x + 0.5, y + 1, w - 1, rh - 2); cx.globalAlpha = 1;
    cx.fillStyle = '#060504'; cx.fillRect(x + w - 3, y + 2, 1.5, rh - 4);
    if(rh > 11 && w > 22){ cx.fillStyle = '#060504'; cx.font = '7px ' + mono; cx.fillText(pname(n.p), x + 3, y + rh/2 + 2.5); } });
}
function hit(g, px, py){ for(let i=ed.notes.length-1;i>=0;i--){ const n = ed.notes[i], x = xOf(g, n.b), w = Math.max(10, n.len/ed.beats*g.w), y = yOf(g, n.p), rh = g.h/g.rows; if(px >= x - 2 && px <= x + w + 2 && py >= y - 3 && py <= y + rh + 3) return { i, edge: px > x + w - Math.min(14, w*0.35) }; } return null; }
let drag = null;
function events(cv){
  cv.addEventListener('pointerdown', e=>{ e.preventDefault(); cv.setPointerCapture(e.pointerId); const g = geom(), px = e.clientX - g.r.left, py = e.clientY - g.r.top; if(px < g.KW) return;
    const h = hit(g, px, py);
    if(h){ ed.sel = h.i; const n = ed.notes[h.i]; drag = { i:h.i, mode:'move', x0:px, y0:py, b0:n.b, p0:n.p, l0:n.len, moved:false }; hear(n); }
    else { const b = Math.max(0, Math.floor((px - g.KW)/g.w*ed.beats*4)/4), p = snapPitch(view.hi - Math.floor(py/(g.h/g.rows))), base = nearest(b); if(!base){ return; }
      const nx = ed.notes.find(x=> x.b > b + 1e-6), len = clamp((nx ? nx.b : ed.beats) - b, 0.25, 1);   /* rings until the next note (max a beat) */
      const nn = { b, len:Math.min(len, ed.beats - b), p, v:base.v, src:Object.assign({}, base.src) }; ed.notes.push(nn); ed.notes.sort((a,c)=>a.b-c.b); ed.sel = ed.notes.indexOf(nn); drag = null; hear(nn); manual(); changed(); }
    draw(); });
  cv.addEventListener('pointermove', e=>{ if(!drag) return; const g = geom(), px = e.clientX - g.r.left, py = e.clientY - g.r.top, n = ed.notes[drag.i]; const db = (px - drag.x0)/g.w*ed.beats, dp = -(py - drag.y0)/(g.h/g.rows);
    if(Math.abs(px - drag.x0) + Math.abs(py - drag.y0) > 5) drag.moved = true; if(!drag.moved) return;
    { n.b = clamp(Math.round((drag.b0 + db)*4)/4, 0, ed.beats - 0.125); const np = snapPitch(drag.p0 + Math.round(dp), Math.sign(dp)); if(np !== n.p){ n.p = np; hear(n); } }
    draw(); });
  const end = ()=>{ if(!drag) return; const moved = drag.moved, i = drag.i; drag = null;
    if(!moved){ ed.notes.splice(i, 1); ed.sel = -1; manual(); changed(); return; }   /* tap a note = delete it */
    manual(); if(moved){ const cur = ed.notes[ed.sel]; if(cur) lock.base.set(cur, { b:cur.b, len:cur.len }); ed.notes.sort((a,c)=>a.b-c.b); ed.sel = ed.notes.indexOf(cur); changed(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}
function nearest(b){ let best = null, bd = 1e9; ed.notes.forEach(n=>{ const d = Math.abs(n.b - b); if(d < bd){ bd = d; best = n; } }); return best; }
let prev = null;
function hear(n){ try{ if(prev) prev.stop(); }catch(e){} try{ ctx.resume(); }catch(e){} const r = Math.pow(2, (n.p - n.src.p0)/12), s = ctx.createBufferSource(); s.buffer = ed.src; s.playbackRate.value = r; const g = ctx.createGain(); g.gain.value = 0.8; s.connect(g); g.connect(masterGain); const dur = Math.min(0.5, (n.src.t1 - n.src.t0)/r); s.start(ctx.currentTime, n.src.t0); s.stop(ctx.currentTime + dur); prev = s; }

/* playhead while the song plays */
let raf = null;
function headLoop(){ if(raf) return; const step = ()=>{ raf = null; if(!zone.classList.contains('on')) return; const ov = $('ntHead'), cx = ov.getContext('2d'), s = fitCanvas(ov, cx); if(s){ cx.clearRect(0, 0, s.w, s.h);
      if(isRunning && ed){ const pos = samplePosAt(ed.ch, currentBeat()); if(pos >= 0){ const b = pos/ed.ch.sample.buffer.duration*ed.beats, g = geom(), x = xOf(g, b); cx.fillStyle = 'rgba(242,237,226,.6)'; cx.fillRect(x, 0, 1.2, s.h); } } }
    paintPlay(); raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); }
function paintPlay(){ const b = $('ntPlay'); if(!b) return; const on = isRunning; if(b._on === on) return; b._on = on; b.classList.toggle('playing', on); b.innerHTML = on ? '<svg viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1"/></svg>' : '<svg viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z"/></svg>'; }
function paint(){ paintShuf(); }

/* ---------- SHUFFLE (v10.51) — new versions of YOUR line that keep the vibe ----------
   Press 1–2: only the rhythm moves (same notes, same order = same story).  Press 3–4: rhythm moves more + a couple of
   neighbour notes swap.  Press 5+: full shuffle, still only your notes.  ◂ = back to the version before.
   The rhythm prefers the hits of your perc/drum track when there is one, so new rhythms sit in the groove. */
const shuf = { ref:null, level:0, hist:[] };
const copyNotes = L => L.map(n=> Object.assign({}, n, { src:Object.assign({}, n.src) }));
function manual(){ shuf.ref = null; shuf.level = 0; paintShuf(); }
function grooveSpots(){
  /* v10.52: linked to the perc — when a perc/drum track is in the song, SHUFFLE only puts notes on its hits */
  const L = ed.beats, grid = []; for(let b=0; b<L; b+=0.25) grid.push(b);
  try{ const pc = (lock.src && channels.includes(lock.src)) ? lock.src : pickSource(); if(pc){ const keep = lock.src; lock.src = pc; const m = lockMarks(); lock.src = keep;
    const hits = [...new Set(m.map(b=> Math.round(b*48)/48))].filter(b=> b >= 0 && b < L).sort((a,b)=>a-b); if(hits.length >= 4) return { spots:hits, pc }; } }catch(e){}
  return { spots:grid, pc:null };
}
const rnd = a => a[Math.floor(Math.random()*a.length)];
function shuffleOnce(){
  if(!ed || !ed.notes.length) return;
  if(!shuf.ref){ shuf.ref = copyNotes(ed.notes).sort((a,c)=>a.b-c.b); shuf.level = 0; }
  shuf.hist.push(copyNotes(ed.notes)); if(shuf.hist.length > 30) shuf.hist.shift();
  shuf.level++; const lv = shuf.level, ref = shuf.ref, n = ref.length, L = ed.beats, gs = grooveSpots(), spots = gs.spots;
  const sig = L => L.map(n=> n.b.toFixed(2) + ':' + n.p).join(','), now = sig(ed.notes); let out, spotsUse = spots;
  for(let attempt = 0; attempt < 8; attempt++){
  if(attempt === 5) spotsUse = [...new Set(spots.concat(Array.from({length:L*4}, (_, i)=> i/4)))].sort((a,b)=>a-b);
  /* 1 · rhythm: move notes to nearby groove spotsUse (further each level); first note stays put until press 5 */
  let on = ref.map(r=> r.b);  /* (try a few times so a press never gives the same thing back) */
  if(lv >= 5){ const pool = spotsUse.slice(); on = []; for(let i=0; i<n && pool.length; i++) on.push(pool.splice(Math.floor(Math.random()*pool.length), 1)[0]); on.sort((a,b)=>a-b); }
  else { const reach = [0, 0.25, 0.5, 0.75, 1][lv], share = lv <= 2 ? 0.4 : 0.6;
    on = on.map((b, i)=>{ if(i === 0 || Math.random() > share) return b; const near = spotsUse.filter(x=> Math.abs(x - b) <= reach + 1e-6 && Math.abs(x - b) > 1e-6); return near.length ? rnd(near) : b; });
    if(gs.pc) on = on.map(b=>{ let best = b, bd = 1e9; spotsUse.forEach(x=>{ const d = Math.abs(x - b); if(d < bd){ bd = d; best = x; } }); return bd <= 0.125 ? best : b; });   /* close ones sit right on the hit */
    const used = new Set(); on = on.map(b=>{ let x = b; if(used.has(x.toFixed(3))){ const free = spotsUse.filter(y=> y > x && !used.has(y.toFixed(3))); x = free.length ? free[0] : x + 0.25; } used.add(x.toFixed(3)); return x; }).sort((a,b)=>a-b); }
  /* 2 · which note goes where: same order (levels 1–2), a couple of neighbour swaps (3–4), shuffled (5+) */
  let order = ref.map((_, i)=> i);
  if(lv >= 5){ for(let i=n-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [order[i], order[j]] = [order[j], order[i]]; } }
  else if(lv >= 3){ const swaps = lv === 3 ? 1 : 2; for(let k=0;k<swaps && n > 2;k++){ const i = 1 + Math.floor(Math.random()*(n - 2)); [order[i], order[i+1]] = [order[i+1], order[i]]; } }
  /* 3 · lengths: each note keeps its length but never runs into the next one */
  out = on.slice(0, n).map((b, i)=>{ const r = ref[order[i]], nx = on[i+1]; const len = Math.max(0.125, Math.min(r.len, (nx != null ? nx : L) - b, L - b)); return Object.assign({}, r, { b, len, src:Object.assign({}, r.src) }); });
  if(sig(out) !== now) break; }
  ed.notes = out; ed.sel = -1; lock.base = new WeakMap();
  if(gs.pc && !lock.on){ lock.src = gs.pc; setLock(true); } else if(lock.on) applyLock(); else changed(); paintShuf();
}
function unshuffle(){ if(!shuf.hist.length) return; ed.notes = shuf.hist.pop(); ed.sel = -1; shuf.level = Math.max(0, shuf.level - 1); if(!shuf.level) shuf.ref = null; lock.base = new WeakMap(); if(lock.on) applyLock(); else changed(); paintShuf(); }
function paintShuf(){ const t = $('ntLvl'); if(!t) return; const lv = shuf.level;
  t.textContent = !lv ? 'keeps your notes · new rhythm' : lv <= 2 ? 'v' + lv + ' · new rhythm, same notes' : lv <= 4 ? 'v' + lv + ' · rhythm + a few swaps' : 'v' + lv + ' · full shuffle'; $('ntUndo').disabled = !shuf.hist.length; }

function build(){
  zone = mk('div'); zone.id = 'notesZone';
  zone.innerHTML = `<div class="nt-top"><div class="nt-t"><b>NOTES</b><span id="ntTitle"></span><i id="ntHow"></i></div><button class="stp-chip sm" id="ntLockBtn" data-k="NOTES LOCK">LOCK</button></div>
  <div class="nt-roll"><canvas id="ntRoll"></canvas><canvas id="ntHead"></canvas></div>
  <div class="nt-hint">tap = add · tap a note = delete · drag = move</div>
  <div class="nt-lock" id="ntLock"><button class="stp-chip sm" id="ntLockSrc" data-k="LOCK SOURCE"></button><input type="range" id="ntLockAmt" min="0" max="100" value="100"><span id="ntLockVal">100</span></div>
  <div class="nt-tools"><span id="ntLvl"></span><button class="stp-chip" id="ntUndo" data-k="SHUFFLE BACK" aria-label="back">◂</button><button class="nt-shuf" id="ntShuf" data-k="SHUFFLE">SHUFFLE</button></div>
  <div class="stp-bar"><button id="ntBack" data-k="NOTES BACK">◂ TUNER</button><div class="stp-info" id="ntInfo">changes land on the track as you go</div><button id="ntPlay" data-k="NOTES PLAY" aria-label="play"></button></div>`;
  document.body.appendChild(zone);
  $('ntBack').addEventListener('click', close);
  $('ntPlay').addEventListener('click', ()=> $('transportBtn').click());
  $('ntShuf').addEventListener('click', shuffleOnce); $('ntUndo').addEventListener('click', unshuffle);
  $('ntLockBtn').addEventListener('click', ()=> setLock(!lock.on));
  $('ntLockSrc').addEventListener('click', ()=>{ const L = lockSources(); if(L.length < 2) return; lock.src = L[(L.indexOf(lock.src) + 1) % L.length]; lock.marks = lockMarks(); paintLock(); applyLock(); });
  $('ntLockAmt').addEventListener('input', e=>{ lock.amt = +e.target.value; $('ntLockVal').textContent = lock.amt; clearTimeout(lock._t); lock._t = setTimeout(applyLock, 60); });
  paintLock();
  events($('ntRoll'));
  window.addEventListener('resize', ()=> draw());
}
function boot(){ build();
  const lp = $('loopPill'); if(lp){ lp.style.cursor = 'pointer'; lp.addEventListener('click', ()=>{ const ch = selCh(); if(!ch) return; if(ch.sample.folder === 'STEPS' && window.STEPS && STEPS.open) STEPS.open(false); else { draw._fit = false; open(ch); } }); }
  const ob = $('optNotes'); if(ob) ob.addEventListener('click', ()=>{ const ch = selCh(); closeOptions(); if(ch){ if(ch.sample.folder === 'STEPS' && window.STEPS) STEPS.open(false); else { draw._fit = false; open(ch); } } });
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
API.open = ch => { draw._fit = false; return open(ch); }; API._ed = ()=>ed; API._shuffle = shuffleOnce; API._unshuffle = unshuffle; API._hits = hitsOf; API._parse = parseSMF; API._write = writeSMF; API._detect = detectNotes;
})();
