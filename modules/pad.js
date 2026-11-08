/* MAGIC PAD v2 (v10.50, TNR-4729.21) — touch to play, nothing written on the pad.
   Higher = higher note, every spot is already in the song's key. Slide = LEGATO (the note glides, it never re-attacks).
   RHYTHM = hold the pad and the notes hit on another track's rhythm (your perc loop) — slide up/down to change the note.
   SOUND = pick exactly what plays: BASS / 808 / LEAD synths, any sound on your tracks, or anything in the library.
   REC writes MIDI (glides kept in the sound) and drops the take on the timeline as a new track; NOTES can edit it after. */
(function(){
'use strict';
const API = window.TPAD = window.TPAD || {};
const $ = id => document.getElementById(id);
const mk = (t, c, h) => { const e = document.createElement(t); if(c) e.className = c; if(h != null) e.innerHTML = h; return e; };
const NN = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const GLIDE = 0.03;   /* legato glide time constant (s) */

let zone = null, oct = 2, quant = true, view = 'pad', filt = 'BASS';
let snd = { kind:'synth', preset:'BASS' };
let rhythm = null;            /* channel whose hits drive the notes, or null = freestyle */
let rhHits = [], rhKey = '';  /* song beats of that track's hits */
const touches = new Map();    /* pointerId -> { p, y } */
let live = null;              /* the one mono voice: { v, p, note } */
let rec = null, takes = 0, sched = null, lastHit = -1;

/* ---------- key + pitch from the finger ---------- */
function key(){ return songKeyState || { root:0, minor:true }; }
function scale(){ const k = key(), deg = k.minor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11], base = 12*(oct + 1) + k.root, out = []; for(let o=0;o<2;o++) deg.forEach(d=>out.push(base + 12*o + d)); out.push(base + 24); return out; }
function pitchAt(y, h){ const R = scale(); return R[clamp(Math.floor((1 - y/h)*R.length), 0, R.length - 1)]; }

/* ---------- sounds ---------- */
const PRESETS = ['BASS','808','LEAD'];
function voice(ac, dest, p, t){
  const out = ac.createGain(); out.connect(dest); out.gain.setValueAtTime(0, t);
  const srcs = [], freqs = [], rates = []; let lp = null, lpMul = 1, sus = 0.8, rel = 0.06;
  const f = 440*Math.pow(2, (p - 69)/12);
  if(snd.kind === 'synth'){
    lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.connect(out);
    const osc = (type, mul, gain, det) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f*mul; if(det) o.detune.value = det; const g = ac.createGain(); g.gain.value = gain; o.connect(g); g.connect(lp); srcs.push(o); freqs.push([o, mul]); return o; };
    if(snd.preset === 'BASS'){ osc('sawtooth', 1, 0.22); osc('sine', 1, 0.5); osc('sine', 0.5, 0.25); lpMul = 5; lp.Q.value = 1.5; lp.frequency.setValueAtTime(f*14, t); lp.frequency.setTargetAtTime(f*lpMul, t, 0.08); out.gain.linearRampToValueAtTime(1, t + 0.005); out.gain.setTargetAtTime(sus = 0.85, t + 0.005, 0.15); }
    else if(snd.preset === '808'){ const o = osc('sine', 1, 0.95); o.frequency.setValueAtTime(f*2.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); osc('triangle', 2, 0.06); lpMul = 12; lp.frequency.value = f*lpMul; out.gain.linearRampToValueAtTime(1, t + 0.003); out.gain.setTargetAtTime(sus = 0.7, t + 0.05, 0.6); rel = 0.08; }
    else { osc('sawtooth', 1, 0.16, -7); osc('sawtooth', 1, 0.16, 7); osc('square', 0.5, 0.05); lpMul = 3; lp.Q.value = 2; lp.frequency.setValueAtTime(f*8, t); lp.frequency.setTargetAtTime(f*lpMul, t, 0.08); out.gain.linearRampToValueAtTime(1, t + 0.008); out.gain.setTargetAtTime(sus = 0.75, t + 0.008, 0.12); rel = 0.09; }
    srcs.forEach(o=> o.start(t));
  } else {
    const b = snd.s.buffer, r = Math.pow(2, (p - snd.root)/12), s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = r;
    if((b.duration - snd.t0) > 0.5){ s.loop = true; s.loopStart = snd.t0 + Math.min(0.3, (b.duration - snd.t0)*0.4); s.loopEnd = b.duration - 0.005; }
    s.connect(out); out.gain.linearRampToValueAtTime(1, t + 0.004); sus = 1; s.start(t, snd.t0); srcs.push(s); rates.push(s);
  }
  return {
    glide(np, at){ const nf = 440*Math.pow(2, (np - 69)/12); freqs.forEach(([o, mul])=> o.frequency.setTargetAtTime(nf*mul, at, GLIDE)); if(lp) lp.frequency.setTargetAtTime(nf*lpMul, at, GLIDE); rates.forEach(s=> s.playbackRate.setTargetAtTime(Math.pow(2, (np - snd.root)/12), at, GLIDE)); },
    stop(at){ out.gain.cancelScheduledValues(at); out.gain.setValueAtTime(sus, at); out.gain.linearRampToValueAtTime(0, at + rel); srcs.forEach(o=>{ try{ o.stop(at + rel + 0.02); }catch(e){} }); }
  };
}
function soundName(){ return snd.kind === 'synth' ? snd.preset + ' SYNTH' : (snd.s.displayName || 'sound').toUpperCase(); }
async function pickSample(s){
  if(!s.buffer){ $('padInfo').textContent = 'loading ' + (s.displayName || 'sound') + '…'; await ensureLoaded(s); }
  if(!s.buffer){ $('padInfo').textContent = "couldn't load that one"; return false; }
  let root = 60, t0 = 0;
  try{ const N = TNOTES._detect(s.buffer, 60/sampleBpm(s)); if(N.length){ const ps = N.map(n=>n.p).sort((a,b)=>a-b); root = ps[Math.floor(ps.length/2)]; t0 = Math.max(0, N[0].b*60/sampleBpm(s)); } else { const k = parseKey(s.key); if(k) root = 48 + k.root; } }catch(e){}
  snd = { kind:'sample', s, root, t0 }; return true;
}
function audition(){ try{ ctx.resume(); }catch(e){} const R = scale(), v = voice(ctx, masterGain, R[0] + 12, ctx.currentTime + 0.01); v.stop(ctx.currentTime + 0.45); }

/* ---------- RHYTHM: where the chosen track hits, in song beats ---------- */
function rhythmTracks(){ return channels.filter(c=> c.sample && c.sample.buffer && !(c.sample.folder === 'MADE' && /PAD TAKE/.test(c.sample.displayName || ''))); }
function buildHits(){
  rhHits = []; if(!rhythm) return; const s = rhythm.sample, hits = TNOTES._hits(s), spb = 60/sampleBpm(s); if(!hits.length) return; const hb = hits.map(t=>t/spb), st = 1/96;
  rhythm.clips.forEach(c=>{ if(c.mute) return; let prev = null;
    for(let sb = c.start; sb < c.start + c.len; sb += st){ const pos = samplePosAt(rhythm, sb); if(pos < 0){ prev = null; continue; } const pb = pos/spb;
      if(prev == null){ hb.forEach(h=>{ if(h >= pb - 1e-6 && h < pb + st) rhHits.push(sb + (h - pb)); }); }
      else hb.forEach(h=>{ if(pb >= prev){ if(h > prev && h <= pb) rhHits.push(sb - st + (h - prev)/(pb - prev || 1)*st); } else if(h > prev || h <= pb) rhHits.push(sb); });
      prev = pb; } });
  rhHits.sort((a,b)=>a-b); rhKey = rhythm.id + ':' + JSON.stringify(rhythm.clips) + ':' + bpm;
}
function startSched(){ if(sched) return; lastHit = -1; sched = setInterval(schedTick, 20); schedTick(); }
function stopSched(){ clearInterval(sched); sched = null; }
function schedTick(){
  if(!rhythm || !isRunning || !touches.size){ return; }
  const k = rhythm.id + ':' + JSON.stringify(rhythm.clips) + ':' + bpm; if(k !== rhKey) buildHits();
  const bs = beatSec(), now = ctx.currentTime, end = songEndBeats(), b0 = currentBeat(), b1 = b0 + 0.12/bs;
  const at = h => songStartTime + (h - startBeat)*bs;
  rhHits.forEach(h=>{ let hb = h; if(hb < b0 - 1e-6) hb += end; if(hb >= b1 || hb <= b0 - 1e-6) return; const T = at(hb); if(T <= lastHit + 0.005 || T < now - 0.005) return; lastHit = T; hitAt(Math.max(now, T)); });
}
function fingerPitch(){ const t = [...touches.values()]; return t.length ? t[t.length - 1].p : null; }
function hitAt(T){ const p = fingerPitch(); if(p == null) return; if(live){ live.v.stop(T); closeNote(T); } live = { v:voice(ctx, masterGain, p, T), p, note:openNote(T, p, false) }; draw(); }

/* ---------- recording ---------- */
const beatOf = T => rec.cb - rec.bar + (T - rec.t0)/beatSec();
function openNote(T, p, g){ if(!rec) return null; const n = { b:beatOf(T), p, g:g ? 1 : 0, v:100, len:0 }; rec.notes.push(n); paintRec(); return n; }
function closeNote(T){ if(live && live.note){ live.note.len = Math.max(0.01, beatOf(T) - live.note.b); live.note = null; } }

/* ---------- touch ---------- */
function geo(e){ const r = $('padCv').getBoundingClientRect(); return { y:e.clientY - r.top, h:r.height, x:e.clientX - r.left, w:r.width }; }
function down(e){ e.preventDefault(); $('padCv').setPointerCapture(e.pointerId); try{ ctx.resume(); }catch(err){}
  const g = geo(e), p = pitchAt(g.y, g.h); touches.set(e.pointerId, { p, y:g.y/g.h, x:g.x/g.w });
  if(rhythm && isRunning){ startSched(); }
  else { const T = ctx.currentTime; if(live){ live.v.glide(p, T); closeNote(T); live.p = p; live.note = openNote(T, p, true); } else live = { v:voice(ctx, masterGain, p, T), p, note:openNote(T, p, false) }; }
  draw(); }
function move(e){ const t = touches.get(e.pointerId); if(!t) return; const g = geo(e), p = pitchAt(g.y, g.h); t.y = g.y/g.h; t.x = g.x/g.w;
  if(p !== t.p){ t.p = p; if(live && fingerPitch() === p){ const T = ctx.currentTime; live.v.glide(p, T); closeNote(T); live.p = p; live.note = openNote(T, p, true); } }
  draw(); }
function up(e){ if(!touches.has(e.pointerId)) return; touches.delete(e.pointerId);
  if(!touches.size){ stopSched(); if(live){ const T = ctx.currentTime; live.v.stop(T); closeNote(T); live = null; } }
  else if(live){ const p = fingerPitch(); if(p !== live.p){ const T = ctx.currentTime; live.v.glide(p, T); closeNote(T); live.p = p; live.note = openNote(T, p, true); } }
  draw(); }

/* ---------- REC → MIDI → new track ---------- */
async function recOn(){
  if(!isRunning){ try{ await ensureRunning(); }catch(e){} if(!isRunning){ $('padInfo').textContent = 'press play first'; return; } }
  const cb = currentBeat(); rec = { cb, bar:Math.max(0, Math.floor(cb/BAR)*BAR), t0:ctx.currentTime, notes:[] }; paintRec();
}
async function recOff(){
  if(live){ const T = ctx.currentTime; closeNote(T); }
  const r = rec; rec = null; paintRec(); if(!r) return;
  let notes = r.notes.filter(n=> n.len > 0.02 && n.b + n.len > 0).map(n=> Object.assign({}, n));
  if(!notes.length){ $('padInfo').textContent = 'nothing recorded'; return; }
  notes.sort((a,c)=>a.b - c.b);
  if(quant){ notes.forEach(n=>{ const e = n.b + n.len, q = n.g ? 8 : 4; n.b = Math.round(n.b*q)/q; n.e = e; }); notes.forEach((n, i)=>{ const nx = notes[i+1]; n.len = nx && nx.g ? nx.b - n.b : Math.max(0.25, Math.round((n.e - n.b)*4)/4); delete n.e; }); }
  notes = notes.filter(n=> n.len > 0.01); notes.forEach(n=>{ if(n.b < 0){ n.len += n.b; n.b = 0; } });
  const lead = Math.floor(notes[0].b/BAR)*BAR; if(lead > 0){ notes.forEach(n=> n.b -= lead); r.bar += lead; }
  const lastEnd = Math.max(...notes.map(n=>n.b + n.len)), beats = Math.max(BAR, Math.ceil(lastEnd/BAR)*BAR);
  $('padInfo').textContent = 'writing ' + notes.length + ' notes…';
  try{
    const sr = ctx.sampleRate, spb = 60/bpm, oc = new OfflineAudioContext(2, Math.ceil(beats*spb*sr + sr*0.2), sr), bus = oc.createGain(); bus.gain.value = 0.9; bus.connect(oc.destination);
    let v = null, vEnd = 0;   /* glided notes ride the same voice — the render sounds like what you played */
    notes.forEach(n=>{ const t = n.b*spb, e = (n.b + n.len)*spb;
      if(n.g && v && Math.abs(vEnd - t) < 0.02){ v.glide(n.p, t); vEnd = e; return; }
      if(v) v.stop(vEnd); v = voice(oc, bus, n.p, t); vEnd = e; });
    if(v) v.stop(vEnd);
    const full = await oc.startRendering(), buf = new AudioBuffer({ length:Math.ceil(beats*spb*sr), sampleRate:sr, numberOfChannels:2 });
    for(let c=0;c<2;c++) buf.copyToChannel(full.getChannelData(c).subarray(0, buf.length), c);
    const wav = bufferToWav(buf, 24); takes++;
    const k = key(), kname = NN[k.root] + (k.minor ? 'min' : 'maj');
    const s = await TUNER.addMade({ wav, name:'PAD TAKE ' + Date.now().toString(36).toUpperCase(), title:'PAD TAKE ' + takes, kind:snd.kind === 'synth' && snd.preset !== 'LEAD' ? 'bass' : 'lead', bpm, key:kname, midi:TNOTES._write(notes, bpm), track:false });
    if(!s){ $('padInfo').textContent = "couldn't save the take"; return; }
    await addChannelFromSample(s, { clips:[{ start:r.bar, len:beats, off:0 }] });
    try{ refreshTimeline(); drawTL(); if(isRunning) reschedule(); markDirty(); commit(); }catch(e){}
    $('padInfo').textContent = 'PAD TAKE ' + takes + ' → new track · ' + notes.length + ' notes';
  }catch(e){ $('padInfo').textContent = 'REC: ' + (e && e.message || 'failed'); }
}
function paintRec(){ $('padRec').classList.toggle('on', !!rec); if(rec) $('padInfo').textContent = 'REC · ' + rec.notes.length + ' notes'; }

/* ---------- SOUND picker (inline, replaces the pad until you pick) ---------- */
const FILTERS = ['BASS','LEAD','ONE-SHOTS','TRACKS','ALL'];
function libList(){
  const seen = new Set(), out = []; const add = s => { if(!s || seen.has(s.id) || s.hidden) return; seen.add(s.id); out.push(s); };
  if(filt === 'TRACKS'){ channels.forEach(c=> add(c.sample)); return out; }
  const nm = s => ((s.displayName || '') + ' ' + (s.name || '') + ' ' + (s.tags || []).join(' ')).toUpperCase();   /* not the folder: HYBRID BASS has drum loops too */
  samples.forEach(s=>{ const n = nm(s), loop = /LOOP|FULL/.test(n);
    if(filt === 'BASS' && !/BASS|808|SUB|REESE/.test(n)) return; if(filt === 'LEAD' && !/LEAD|SYNTH|PLUCK|KEYS|PAD|BELL|ARP|MELOD/.test(n)) return; if(filt === 'ONE-SHOTS' && loop) return;
    add(s); });
  return out.sort((a,b)=> (/LOOP/i.test(a.displayName||'') - /LOOP/i.test(b.displayName||'')) || (a.displayName||'').localeCompare(b.displayName||''));
}
function renderPicker(){
  const box = $('padPick'); box.innerHTML = '';
  const row = mk('div', 'pp-row'); PRESETS.forEach(p=>{ const b = mk('button', 'stp-chip' + (snd.kind === 'synth' && snd.preset === p ? ' on' : ''), p + ' SYNTH'); b.dataset.k = 'PAD SYNTH ' + p; b.onclick = ()=>{ snd = { kind:'synth', preset:p }; audition(); renderPicker(); paintTop(); }; row.appendChild(b); }); box.appendChild(row);
  const fr = mk('div', 'pp-row'); FILTERS.forEach(f=>{ const b = mk('button', 'stp-chip sm' + (filt === f ? ' on' : ''), f); b.onclick = ()=>{ filt = f; renderPicker(); }; fr.appendChild(b); }); box.appendChild(fr);
  const L = libList(), list = mk('div', 'pp-list');
  if(!L.length) list.appendChild(mk('div', 'pp-empty', filt === 'ONE-SHOTS' || filt === 'BASS' ? 'no one-shots in the library yet — use the synths above for now' : 'nothing here'));
  L.slice(0, 300).forEach(s=>{ const b = mk('button', 'pp-item' + (snd.kind === 'sample' && snd.s === s ? ' on' : '')); b.innerHTML = '<b>' + (s.displayName || s.name || 'sound').toUpperCase() + '</b><i>' + (s.folder || '') + '</i>';
    b.onclick = async ()=>{ if(await pickSample(s)){ audition(); renderPicker(); paintTop(); } }; list.appendChild(b); });
  box.appendChild(list);
}
function setView(v){ view = v; $('padPick').style.display = v === 'pick' ? 'flex' : 'none'; $('padCv').style.display = v === 'pick' ? 'none' : 'block'; $('padSnd').classList.toggle('on', v === 'pick'); if(v === 'pick') renderPicker(); else draw(); paintTop(); }

/* ---------- draw: no labels, just light where you touch ---------- */
function draw(){
  if(!zone || !zone.classList.contains('on') || view !== 'pad') return; const cv = $('padCv'), cx = cv.getContext('2d'), s = fitCanvas(cv, cx); if(!s) return;
  const R = scale(), rh = s.h/R.length, k = key(); cx.clearRect(0, 0, s.w, s.h);
  R.forEach((p, i)=>{ if(((p - k.root) % 12 + 12) % 12 === 0){ const y = s.h - (i + 1)*rh; cx.fillStyle = 'rgba(242,237,226,.035)'; cx.fillRect(0, y, s.w, rh); } });
  touches.forEach(t=>{ const i = R.indexOf(t.p), y = s.h - (i + 1)*rh, g = cx.createLinearGradient(0, 0, s.w, 0); g.addColorStop(0, 'rgba(79,209,165,.03)'); g.addColorStop(0.5, 'rgba(79,209,165,.22)'); g.addColorStop(1, 'rgba(79,209,165,.03)'); cx.fillStyle = g; cx.fillRect(0, y, s.w, rh);
    const rg = cx.createRadialGradient(t.x*s.w, t.y*s.h, 0, t.x*s.w, t.y*s.h, 46); rg.addColorStop(0, 'rgba(79,209,165,.55)'); rg.addColorStop(1, 'rgba(79,209,165,0)'); cx.fillStyle = rg; cx.beginPath(); cx.arc(t.x*s.w, t.y*s.h, 46, 0, Math.PI*2); cx.fill(); });
}
function paintTop(){ const k = key(); $('padKey').textContent = NN[k.root] + (k.minor ? ' MIN' : ' MAJ') + (songKeyState ? '' : ' · set the song KEY');
  $('padSnd').textContent = '▸ ' + soundName(); $('padRh').textContent = rhythm ? 'RHYTHM ▸ ' + (rhythm.sample.displayName || 'track').toUpperCase() : 'RHYTHM OFF'; $('padRh').classList.toggle('on', !!rhythm); }
function paintPlay(){ const b = $('padPlay'); if(!b || !zone.classList.contains('on')) return; const on = isRunning; if(b._on !== on){ b._on = on; b.classList.toggle('playing', on); b.innerHTML = on ? '<svg viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1"/></svg>' : '<svg viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z"/></svg>'; }
  if(rec && !isRunning) recOff(); requestAnimationFrame(paintPlay); }

/* ---------- open / build ---------- */
function open(){ zone.classList.add('on'); if(rhythm && !channels.includes(rhythm)) rhythm = null;
  if(!rhythm && !open._did){ open._did = true; rhythm = rhythmTracks().find(c=> /perc|drum|top|groove|baile|conga|bongo/i.test(c.sample.displayName || c.sample.name || '')) || null; }
  if(snd.kind === 'sample' && !samples.includes(snd.s)) snd = { kind:'synth', preset:'BASS' };
  $('padInfo').textContent = rhythm ? 'play the beat · hold the pad = notes on the ' + (rhythm.sample.displayName || 'track').toLowerCase() + ' rhythm' : 'play the beat · touch the pad · slide = glide'; setView('pad'); paintPlay(); }
function close(){ if(rec) recOff(); touches.clear(); stopSched(); if(live){ live.v.stop(ctx.currentTime); live = null; } zone.classList.remove('on'); }
function build(){
  const st = mk('style'); st.textContent = `
  #padZone{ position:fixed; inset:0; z-index:886; background:#060504; display:none; flex-direction:column; padding:env(safe-area-inset-top) 0 0; box-sizing:border-box; height:100dvh; font-family:var(--mono); color:#f2ede2; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
  #padZone.on{ display:flex; } #padZone button{ font-family:var(--mono); touch-action:manipulation; cursor:pointer; }
  .pd-top{ display:flex; align-items:center; gap:6px; padding:12px 10px 8px; } .pd-t{ flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
  .pd-t b{ font:700 13px var(--mono); letter-spacing:3px; color:var(--green,#4fd1a5); } .pd-t span{ font-size:8px; color:#8a8276; letter-spacing:.08em; }
  .pd-top .stp-chip{ max-width:34%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pd-pad{ position:relative; flex:1; min-height:0; margin:0 8px; border:1px solid #241d16; border-radius:8px; overflow:hidden; background:#0a0806; box-shadow:0 0 14px rgba(79,209,165,.06) inset; }
  #padCv{ position:absolute; inset:0; width:100%; height:100%; touch-action:none; }
  #padPick{ position:absolute; inset:0; display:none; flex-direction:column; gap:6px; padding:8px; box-sizing:border-box; }
  .pp-row{ display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end; } .pp-list{ flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:3px; -webkit-overflow-scrolling:touch; }
  .pp-item{ display:flex; justify-content:space-between; align-items:center; gap:8px; background:#0b0907; border:1px solid #241d16; border-radius:4px; padding:9px 8px; color:#c9c1b4; text-align:left; }
  .pp-item b{ font-weight:400; font-size:8.5px; letter-spacing:.04em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .pp-item i{ font-style:normal; font-size:7px; color:#5a554e; white-space:nowrap; }
  .pp-item.on{ border-color:var(--green,#4fd1a5); color:var(--green,#4fd1a5); } .pp-empty{ font-size:8px; color:#5a554e; padding:10px 4px; }
  .pd-tools{ display:flex; align-items:center; gap:5px; padding:6px 8px 0; justify-content:flex-end; } .pd-tools .stp-chip{ padding:8px 9px; }
  #padBack{ background:#1a0a0a; border:1px solid #d32f2f; color:#f2ede2; font-size:10px; letter-spacing:.08em; padding:8px 10px; border-radius:4px; }
  #padRec{ width:44px; height:44px; border-radius:50%; background:#0b0907; border:1.5px solid #5a554e; display:flex; align-items:center; justify-content:center; padding:0; }
  #padRec i{ width:14px; height:14px; border-radius:50%; background:#8a3b36; } #padRec.on{ border-color:#d32f2f; box-shadow:0 0 10px rgba(211,47,47,.35); } #padRec.on i{ background:#ff5a4f; }
  #padPlay{ width:44px; height:44px; border-radius:50%; background:#0b0907; border:1.5px solid var(--green,#4fd1a5); display:flex; align-items:center; justify-content:center; padding:0; }
  #padPlay svg{ width:18px; height:18px; fill:var(--green,#4fd1a5); } #padPlay.playing{ border-color:#d32f2f; } #padPlay.playing svg{ fill:#d32f2f; }`;
  document.head.appendChild(st);
  zone = mk('div'); zone.id = 'padZone';
  zone.innerHTML = `<div class="pd-top"><div class="pd-t"><b>MAGIC PAD</b><span id="padKey"></span></div><button class="stp-chip sm" id="padRh" data-k="PAD RHYTHM"></button><button class="stp-chip sm" id="padSnd" data-k="PAD SOUND"></button></div>
  <div class="pd-pad"><canvas id="padCv"></canvas><div id="padPick"></div></div>
  <div class="pd-tools"><button class="stp-chip sm on" id="padQ" data-k="PAD Q">Q 1/16</button><button class="stp-chip sm" id="padOctD" data-k="PAD OCT-">OCT −</button><button class="stp-chip sm" id="padOctU" data-k="PAD OCT+">OCT +</button></div>
  <div class="stp-bar"><button id="padBack" data-k="PAD BACK">◂ TUNER</button><div class="stp-info" id="padInfo"></div><button id="padRec" data-k="PAD REC" aria-label="record"><i></i></button><button id="padPlay" data-k="PAD PLAY" aria-label="play"></button></div>`;
  document.body.appendChild(zone);
  const cv = $('padCv'); cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  $('padBack').addEventListener('click', ()=>{ if(view === 'pick') setView('pad'); else close(); });
  $('padPlay').addEventListener('click', ()=>{ if(rec) recOff(); $('transportBtn').click(); });
  $('padRec').addEventListener('click', ()=>{ if(rec) recOff(); else recOn(); });
  $('padSnd').addEventListener('click', ()=> setView(view === 'pick' ? 'pad' : 'pick'));
  $('padRh').addEventListener('click', ()=>{ const L = rhythmTracks(), i = rhythm ? L.indexOf(rhythm) : -1; rhythm = i + 1 < L.length ? L[i + 1] : null; rhKey = ''; paintTop(); $('padInfo').textContent = rhythm ? 'hold the pad = notes on this rhythm' : 'freestyle · touch = note · slide = glide'; });
  $('padQ').addEventListener('click', ()=>{ quant = !quant; $('padQ').classList.toggle('on', quant); $('padQ').textContent = quant ? 'Q 1/16' : 'Q OFF'; });
  $('padOctD').addEventListener('click', ()=>{ oct = Math.max(0, oct - 1); draw(); });
  $('padOctU').addEventListener('click', ()=>{ oct = Math.min(6, oct + 1); draw(); });
  window.addEventListener('resize', ()=> draw());
  const b = $('padBtn'); if(b) b.addEventListener('click', open);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
API.open = open; API._rec = ()=>rec; API._rh = ()=>rhHits; API._snd = ()=>snd;
})();
