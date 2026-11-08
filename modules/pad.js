/* MAGIC PAD (v10.49, TNR-4729.21) — play leads by touch: higher on the pad = higher note, every row is already in the song's key.
   Hold = the note rings, slide = the next note. REC writes what you play into MIDI and drops it on the timeline as a new track
   (the MIDI is kept, so NOTES can edit it after). SOUND = what plays your notes: the built-in SYNTH lead, or any track's sound (the sampler). */
(function(){
'use strict';
const API = window.TPAD = window.TPAD || {};
const $ = id => document.getElementById(id);
const mk = (t, c, h) => { const e = document.createElement(t); if(c) e.className = c; if(h != null) e.innerHTML = h; return e; };
const NN = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const pname = p => NN[((p % 12) + 12) % 12] + (Math.floor(p/12) - 1);

let zone = null, oct = 4, quant = true;
let snd = { kind:'synth' };   /* or { kind:'sample', s, root, t0 } */
const voices = new Map();     /* pointerId -> { p, row, stop(), rec } */
let rec = null;               /* { bar, notes:[], open:Map } while recording */
let takes = 0;

/* ---------- key + rows ---------- */
function key(){ return songKeyState || { root:0, minor:true }; }
function rows(){ const k = key(), deg = k.minor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11], base = 12*(oct + 1) + k.root, out = [];
  for(let o=0; o<2; o++) deg.forEach(d=> out.push(base + 12*o + d)); out.push(base + 24); return out; }   /* low → high, 15 rows */
function rowAt(y, h){ const R = rows(); const i = clamp(Math.floor((1 - y/h)*R.length), 0, R.length - 1); return { i, p:R[i] }; }

/* ---------- the sound (same code live and when the take is rendered) ---------- */
function voice(ac, dest, p, t, dur){
  /* dur = null → live (held until stop()) ; number → offline render */
  const out = ac.createGain(); out.connect(dest); out.gain.setValueAtTime(0, t);
  let srcs = [];
  if(snd.kind === 'synth'){
    const f = 440*Math.pow(2, (p - 69)/12), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.connect(out);
    lp.frequency.setValueAtTime(f*8, t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f*3), t + 0.25);
    [-7, 7].forEach(dt=>{ const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; const g = ac.createGain(); g.gain.value = 0.16; o.connect(g); g.connect(lp); srcs.push(o); });
    const sub = ac.createOscillator(); sub.type = 'square'; sub.frequency.value = f/2; const sg = ac.createGain(); sg.gain.value = 0.05; sub.connect(sg); sg.connect(lp); srcs.push(sub);
    out.gain.linearRampToValueAtTime(1, t + 0.008); out.gain.setTargetAtTime(0.75, t + 0.008, 0.12);
    srcs.forEach(o=> o.start(t));
  } else {
    const b = snd.s.buffer, r = Math.pow(2, (p - snd.root)/12), s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = r;
    const avail = (b.duration - snd.t0)/r; if(avail > 0.4){ s.loop = true; s.loopStart = snd.t0 + Math.min(0.25, (b.duration - snd.t0)*0.4); s.loopEnd = b.duration - 0.005; }
    s.connect(out); out.gain.linearRampToValueAtTime(1, t + 0.004); s.start(t, snd.t0); srcs.push(s);
  }
  const release = at => { const rel = snd.kind === 'synth' ? 0.09 : 0.05; out.gain.cancelScheduledValues(at); out.gain.setValueAtTime(out.gain.value || 0.75, at); out.gain.linearRampToValueAtTime(0, at + rel); srcs.forEach(o=>{ try{ o.stop(at + rel + 0.01); }catch(e){} }); };
  if(dur != null){ const rel = snd.kind === 'synth' ? 0.09 : 0.05, end = t + dur; out.gain.setValueAtTime(snd.kind === 'synth' ? 0.75 : 1, Math.max(t + 0.01, end - 0.001)); out.gain.linearRampToValueAtTime(0, end + rel); srcs.forEach(o=> o.stop(end + rel + 0.01)); return null; }
  return { stop:()=> release(ac.currentTime) };
}

/* ---------- sampler: pick a track's sound ---------- */
function soundList(){ const L = [{ kind:'synth', label:'SYNTH' }]; channels.forEach(ch=>{ const s = ch.sample; if(s && s.buffer && !L.some(x=>x.s === s)) L.push({ kind:'sample', s, label:(s.displayName || 'sound').toUpperCase() }); }); return L; }
function setSound(o){
  if(o.kind === 'synth'){ snd = { kind:'synth' }; }
  else { let root = 60, t0 = 0; try{ const N = window.TNOTES && TNOTES._detect ? TNOTES._detect(o.s.buffer, 60/sampleBpm(o.s)) : []; if(N.length){ const ps = N.map(n=>n.p).sort((a,b)=>a-b); root = ps[Math.floor(ps.length/2)]; t0 = Math.max(0, N[0].b*60/sampleBpm(o.s)); } }catch(e){}
    snd = { kind:'sample', s:o.s, root, t0 }; }
  $('padSnd').textContent = '▸ ' + o.label; draw();
}

/* ---------- touch ---------- */
function down(e){ e.preventDefault(); const cv = $('padCv'); cv.setPointerCapture(e.pointerId); try{ ctx.resume(); }catch(err){}
  const r = cv.getBoundingClientRect(), { i, p } = rowAt(e.clientY - r.top, r.height); start(e.pointerId, i, p); }
function move(e){ const v = voices.get(e.pointerId); if(!v) return; const r = $('padCv').getBoundingClientRect(), { i, p } = rowAt(e.clientY - r.top, r.height); if(i === v.row) return; end(e.pointerId); start(e.pointerId, i, p); }
function up(e){ end(e.pointerId); }
function start(id, row, p){ const v = voice(ctx, masterGain, p, ctx.currentTime, null); const o = { p, row, stop:v.stop, rec:null };
  if(rec){ o.rec = { b:currentBeat() - rec.bar, p }; }
  voices.set(id, o); draw(); }
function end(id){ const v = voices.get(id); if(!v) return; voices.delete(id); v.stop();
  if(rec && v.rec){ const e = currentBeat() - rec.bar; if(e > v.rec.b) rec.notes.push({ b:v.rec.b, len:e - v.rec.b, p:v.rec.p, v:100 }); paintRec(); }
  draw(); }

/* ---------- REC → MIDI → new track ---------- */
async function recOn(){
  if(!isRunning){ try{ await ensureRunning(); }catch(e){ setStatus('press play first'); return; } }
  const b = Math.max(0, currentBeat()); rec = { bar:Math.floor(b/BAR)*BAR, notes:[] }; paintRec();
}
async function recOff(){
  const r = rec; rec = null; [...voices.keys()].forEach(end); paintRec(); if(!r) return;
  let notes = r.notes.filter(n=> n.b >= -0.25 && n.len > 0.02);
  if(!notes.length){ $('padInfo').textContent = 'nothing recorded — tap REC, then play'; return; }
  if(quant) notes = notes.map(n=>{ const b = Math.max(0, Math.round(n.b*4)/4); return Object.assign({}, n, { b, len:Math.max(0.25, Math.round(n.len*4)/4) }); });
  notes.forEach(n=>{ if(n.b < 0){ n.len += n.b; n.b = 0; } });
  notes.sort((a,c)=>a.b - c.b);
  const lead = Math.floor(notes[0].b/BAR)*BAR; if(lead > 0){ notes.forEach(n=> n.b -= lead); r.bar += lead; }   /* the clip starts on the bar of your first note */
  const lastEnd = Math.max(...notes.map(n=>n.b + n.len)), beats = Math.max(BAR, Math.ceil(lastEnd/BAR)*BAR);
  $('padInfo').textContent = 'writing ' + notes.length + ' notes…';
  try{
    const sr = ctx.sampleRate, spb = 60/bpm, oc = new OfflineAudioContext(2, Math.ceil(beats*spb*sr), sr), bus = oc.createGain(); bus.gain.value = 0.9; bus.connect(oc.destination);
    notes.forEach(n=> voice(oc, bus, n.p, n.b*spb, Math.min(n.len*spb, beats*spb - n.b*spb - 0.1)));
    const buf = await oc.startRendering(), wav = bufferToWav(buf, 24); takes++;
    const k = key(), kname = NN[k.root] + (k.minor ? 'min' : 'maj'), nm = 'PAD TAKE ' + Date.now().toString(36).toUpperCase();
    const s = await TUNER.addMade({ wav, name:nm, title:'PAD TAKE ' + takes, kind:'lead', bpm, key:kname, midi:TNOTES._write(notes, bpm), track:false });
    if(!s){ $('padInfo').textContent = "couldn't save the take"; return; }
    await addChannelFromSample(s, { clips:[{ start:r.bar, len:beats, off:0 }] });
    try{ refreshTimeline(); drawTL(); if(isRunning) reschedule(); markDirty(); commit(); }catch(e){}
    $('padInfo').textContent = 'PAD TAKE ' + takes + ' → new track · ' + notes.length + ' notes (MIDI kept — edit in NOTES)';
  }catch(e){ $('padInfo').textContent = 'REC: ' + (e && e.message || 'failed'); }
}
function paintRec(){ const b = $('padRec'); b.classList.toggle('on', !!rec); if(rec) $('padInfo').textContent = 'REC · ' + rec.notes.length + ' notes'; }

/* ---------- draw ---------- */
function draw(){
  if(!zone || !zone.classList.contains('on')) return; const cv = $('padCv'), cx = cv.getContext('2d'), s = fitCanvas(cv, cx); if(!s) return;
  const R = rows(), rh = s.h/R.length, cs = getComputedStyle(document.documentElement), green = cs.getPropertyValue('--green').trim() || '#4fd1a5', mono = cs.getPropertyValue('--mono').trim() || 'monospace', k = key();
  const lit = new Set([...voices.values()].map(v=>v.row));
  cx.clearRect(0, 0, s.w, s.h);
  R.forEach((p, i)=>{ const y = s.h - (i + 1)*rh, root = ((p - k.root) % 12 + 12) % 12 === 0;
    if(lit.has(i)){ const g = cx.createLinearGradient(0, 0, s.w, 0); g.addColorStop(0, 'rgba(79,209,165,.05)'); g.addColorStop(0.5, 'rgba(79,209,165,.32)'); g.addColorStop(1, 'rgba(79,209,165,.05)'); cx.fillStyle = g; cx.fillRect(0, y, s.w, rh); }
    else if(root){ cx.fillStyle = 'rgba(242,237,226,.045)'; cx.fillRect(0, y, s.w, rh); }
    cx.fillStyle = root ? 'rgba(242,237,226,.22)' : 'rgba(242,237,226,.07)'; cx.fillRect(0, y, s.w, 1);
    cx.fillStyle = lit.has(i) ? green : root ? '#c9c1b4' : '#5a554e'; cx.font = '8px ' + mono; cx.fillText(pname(p), 8, y + rh/2 + 3); });
  $('padKey').textContent = (NN[k.root] + (k.minor ? ' MIN' : ' MAJ')) + (songKeyState ? '' : ' · no song key yet');
}
function paintPlay(){ const b = $('padPlay'); if(!b) return; const on = isRunning; if(b._on !== on){ b._on = on; b.classList.toggle('playing', on); b.innerHTML = on ? '<svg viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1"/></svg>' : '<svg viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z"/></svg>'; }
  if(rec && !isRunning) recOff(); if(zone.classList.contains('on')) requestAnimationFrame(paintPlay); }

/* ---------- open / build ---------- */
function open(){ zone.classList.add('on'); const L = soundList(); if(snd.kind === 'sample' && !L.some(x=>x.s === snd.s)) setSound(L[0]); else $('padSnd').textContent = '▸ ' + (snd.kind === 'synth' ? 'SYNTH' : (snd.s.displayName || 'sound').toUpperCase());
  $('padInfo').textContent = 'play the beat, tap the pad · REC writes MIDI'; draw(); paintPlay(); }
function close(){ if(rec) recOff(); [...voices.keys()].forEach(end); zone.classList.remove('on'); }
function build(){
  const st = mk('style'); st.textContent = `
  #padZone{ position:fixed; inset:0; z-index:886; background:#060504; display:none; flex-direction:column; padding:env(safe-area-inset-top) 0 0; box-sizing:border-box; height:100dvh; font-family:var(--mono); color:#f2ede2; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
  #padZone.on{ display:flex; } #padZone button{ font-family:var(--mono); touch-action:manipulation; cursor:pointer; }
  .pd-top{ display:flex; align-items:center; gap:6px; padding:12px 10px 8px; } .pd-t{ flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
  .pd-t b{ font:700 13px var(--mono); letter-spacing:3px; color:var(--green,#4fd1a5); } .pd-t span{ font-size:8px; color:#8a8276; letter-spacing:.08em; }
  #padSnd{ max-width:42%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pd-pad{ position:relative; flex:1; min-height:0; margin:0 8px; border:1px solid #241d16; border-radius:8px; overflow:hidden; background:#0a0806; box-shadow:0 0 14px rgba(79,209,165,.06) inset; }
  #padCv{ position:absolute; inset:0; width:100%; height:100%; touch-action:none; }
  .pd-tools{ display:flex; align-items:center; gap:5px; padding:6px 8px 0; justify-content:flex-end; } .pd-tools span{ flex:1; font-size:7px; color:#5a554e; letter-spacing:.05em; }
  .pd-tools .stp-chip{ padding:8px 9px; }
  #padBack{ background:#1a0a0a; border:1px solid #d32f2f; color:#f2ede2; font-size:10px; letter-spacing:.08em; padding:8px 10px; border-radius:4px; }
  #padRec{ width:44px; height:44px; border-radius:50%; background:#0b0907; border:1.5px solid #5a554e; display:flex; align-items:center; justify-content:center; padding:0; }
  #padRec i{ width:14px; height:14px; border-radius:50%; background:#8a3b36; } #padRec.on{ border-color:#d32f2f; box-shadow:0 0 10px rgba(211,47,47,.35); } #padRec.on i{ background:#ff5a4f; }
  #padPlay{ width:44px; height:44px; border-radius:50%; background:#0b0907; border:1.5px solid var(--green,#4fd1a5); display:flex; align-items:center; justify-content:center; padding:0; }
  #padPlay svg{ width:18px; height:18px; fill:var(--green,#4fd1a5); } #padPlay.playing{ border-color:#d32f2f; } #padPlay.playing svg{ fill:#d32f2f; }`;
  document.head.appendChild(st);
  zone = mk('div'); zone.id = 'padZone';
  zone.innerHTML = `<div class="pd-top"><div class="pd-t"><b>MAGIC PAD</b><span id="padKey"></span></div><button class="stp-chip sm" id="padSnd" data-k="PAD SOUND">▸ SYNTH</button></div>
  <div class="pd-pad"><canvas id="padCv"></canvas></div>
  <div class="pd-tools"><span>higher = higher note · all in key · hold = ring · slide = next note</span><button class="stp-chip sm on" id="padQ" data-k="PAD Q">Q 1/16</button><button class="stp-chip sm" id="padOctD" data-k="PAD OCT-">OCT −</button><button class="stp-chip sm" id="padOctU" data-k="PAD OCT+">OCT +</button></div>
  <div class="stp-bar"><button id="padBack" data-k="PAD BACK">◂ TUNER</button><div class="stp-info" id="padInfo"></div><button id="padRec" data-k="PAD REC" aria-label="record"><i></i></button><button id="padPlay" data-k="PAD PLAY" aria-label="play"></button></div>`;
  document.body.appendChild(zone);
  const cv = $('padCv'); cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  $('padBack').addEventListener('click', close);
  $('padPlay').addEventListener('click', ()=>{ if(rec) recOff(); $('transportBtn').click(); });
  $('padRec').addEventListener('click', ()=>{ if(rec) recOff(); else recOn(); });
  $('padSnd').addEventListener('click', ()=>{ const L = soundList(); const i = L.findIndex(x=> snd.kind === 'synth' ? x.kind === 'synth' : x.s === snd.s); setSound(L[(i + 1) % L.length]); });
  $('padQ').addEventListener('click', ()=>{ quant = !quant; $('padQ').classList.toggle('on', quant); $('padQ').textContent = quant ? 'Q 1/16' : 'Q OFF'; });
  $('padOctD').addEventListener('click', ()=>{ oct = Math.max(1, oct - 1); draw(); });
  $('padOctU').addEventListener('click', ()=>{ oct = Math.min(6, oct + 1); draw(); });
  window.addEventListener('resize', ()=> draw());
  const b = $('padBtn'); if(b) b.addEventListener('click', open);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
API.open = open; API._rec = ()=>rec; API._voice = voice;
})();
