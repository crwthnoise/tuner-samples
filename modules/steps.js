/* STEPS (v10.39, TNR-4729.20) — TUNER step sequencer + pattern presets + per-hit DRAWN sidechain.
   One STEPS pattern = one drum loop on the timeline (KICK · SNARE · HATS rendered into a 1-bar loop).
   The kick and snare hits drive the sidechain: each has its own shape, drawn with dots like an FL automation clip.
   A normal drum LOOP can drive it too: TUNER finds its kicks and snares (KICK/SNARE HITS toggle). */
(function(){
'use strict';
window.STEPS = window.STEPS || {}; const STEPS = window.STEPS;
const CLOUD = 'https://space.crwth.workers.dev';
const ROWS = [ { k:'k', n:'KICK', re:/KICK|BD\b/i }, { k:'s', n:'SNARE', re:/SNARE|CLAP/i }, { k:'h', n:'HATS', re:/HAT|\bHH\b/i } ];
const SPEEDS = [ ['8', 0.5, '1/8'], ['16', 0.25, '1/16'], ['16T', 1/6, '1/16T'], ['32', 0.125, '1/32'] ];
const DEF_HITS = ()=>({ k:{ on:true, len:1, depth:1, pts:[[0,1],[0.08,0.95],[0.45,0.35],[1,0]] }, s:{ on:false, len:0.5, depth:0.6, pts:[[0,1],[0.35,0.4],[1,0]] }, loopOn:false });
const PRESETS = {
  '4OTF':{ label:'4 ON THE FLOOR', k:[0,4,8,12], s:[4,12], h:[2,6,10,14], speed:'16', sc:{ k:{ on:true, len:1, depth:1, pts:[[0,1],[0.08,0.95],[0.45,0.35],[1,0]] }, s:{ on:false } } },
  'TRAP':{ label:'TRAP', k:[0,3,10], s:[8], h:[0,2,4,6,8,10,12,14], speed:'8', sc:{ k:{ on:true, len:0.5, depth:0.75, pts:[[0,1],[0.25,0.6],[1,0]] }, s:{ on:false } } }
};
const DRUMWORDS = /KICK|SNARE|CLAP|HAT|DRUM|PERC|TOP|CYMBAL|RIDE|SHAKER|TAMB|FILL|STEPS|BREAK/i;
const $ = id => document.getElementById(id);
const mk = (t, c, h) => { const e = document.createElement(t); if(c) e.className = c; if(h != null) e.innerHTML = h; return e; };
const pin = ()=>{ try{ return localStorage.getItem('tuner_makerPin') || ''; }catch(e){ return ''; } };

function newPat(){ return { v:1, preset:null, k:Array(16).fill(0), s:Array(16).fill(0), h:Array(16).fill(0), speed:'16', snd:{ k:{src:'synth'}, s:{src:'synth'}, h:{src:'synth'} }, vol:{ k:1, s:0.85, h:0.5 }, bpm:null }; }
function hits(){ if(!scHits) scHits = DEF_HITS(); return scHits; }
let pending = {};   /* sampleId -> pattern (from a project file, before the sample exists) */
let pat = null, patSample = null;   /* the pattern being edited + its sample (null until the first hit) */

/* ---------------- sounds ---------------- */
const synthCache = {};
function synth(kind){
  const sr = ctx.sampleRate, key = kind + sr; if(synthCache[key]) return synthCache[key];
  const dur = kind === 'k' ? 0.5 : kind === 's' ? 0.3 : 0.09, n = Math.floor(sr*dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  let ph = 0, lp = 0, last = 0;
  for(let i=0;i<n;i++){ const t = i/sr; let v = 0;
    if(kind === 'k'){ const f = 45 + 110*Math.exp(-t*28); ph += 2*Math.PI*f/sr; v = Math.sin(ph)*Math.exp(-t*7) + (t < 0.004 ? (Math.random()*2-1)*0.3*(1 - t/0.004) : 0); v = Math.tanh(v*1.6)*0.9; }
    else if(kind === 's'){ const nz = Math.random()*2-1; const hp = nz - last; last = nz; ph += 2*Math.PI*190/sr; v = hp*0.55*Math.exp(-t*16) + Math.sin(ph)*0.5*Math.exp(-t*30); }
    else { const nz = Math.random()*2-1; const hp = nz - last; last = nz; lp += (hp - lp)*0.6; v = (hp - lp*0.3)*0.5*Math.exp(-t*55); }
    d[i] = v; }
  return (synthCache[key] = b);
}
const cloudCache = new Map(); let cloudIdx = null, cloudIdxP = null;
function loadCloudIdx(){ if(cloudIdx) return Promise.resolve(cloudIdx); if(cloudIdxP) return cloudIdxP; const p = pin(); if(!p) return Promise.resolve(null);
  cloudIdxP = fetch(CLOUD + '/m/packs/index.json?' + Date.now(), { headers:{ 'x-pin':p } }).then(r=> r.ok ? r.json() : null).then(j=>{ cloudIdxP = null; if(!j || !j.packs) return null; const L = []; Object.entries(j.packs).forEach(([pk, files])=> files.forEach(([rel])=> L.push({ pack:pk, rel }))); cloudIdx = L; return L; }).catch(()=>{ cloudIdxP = null; return null; });
  return cloudIdxP; }
function cloudUrl(pk, rel){ return CLOUD + '/m/packs/' + [pk].concat(rel.split('/')).map(encodeURIComponent).join('/'); }
async function cloudBuf(pk, rel){ const id = pk + '/' + rel; if(cloudCache.has(id)) return cloudCache.get(id);
  const r = await fetch(cloudUrl(pk, rel), { headers:{ 'x-pin':pin() } }); if(!r.ok) throw new Error('cloud ' + r.status);
  const b = await ctx.decodeAudioData(await r.arrayBuffer()); cloudCache.set(id, b); return b; }
async function soundBuf(ref, row){ try{
  if(ref && ref.src === 'lib'){ const s = samples.find(x=>x.id === ref.id); if(s){ if(!s.buffer) await ensureLoaded(s); if(s.buffer) return s.buffer; } }
  if(ref && ref.src === 'cloud') return await cloudBuf(ref.pack, ref.rel);
}catch(e){} return synth(row); }
function refName(ref, row){ if(!ref || ref.src === 'synth') return 'BASIC ' + ROWS.find(r=>r.k===row).n;
  if(ref.src === 'lib'){ const s = samples.find(x=>x.id === ref.id); return s ? (s.displayName || s.name) : 'missing'; }
  return (ref.rel.split('/').pop() || '').replace(/\.[^.]+$/,'').replace(/_/g,' '); }
function isShot(name, path){ return !/LOOP/i.test(name) && (/SHOT|ONE.?SHOT/i.test(name + ' ' + (path||'')) || !/_\d{2,3}_/.test(name)); }
function cands(row){
  const R = ROWS.find(r=>r.k===row), L = [{ src:'synth' }];
  samples.forEach(s=>{ const nm = (s.name||'') + ' ' + (s.displayName||'') + ' ' + (s.tags||[]).join(' '); if(s.folder === 'STEPS' || !R.re.test(nm)) return; if(row === 'h' && /OPEN/i.test(nm)) return; if(s.buffer ? s.buffer.duration < 2.5 : isShot(s.name||'')) L.push({ src:'lib', id:s.id }); });
  (cloudIdx||[]).forEach(e=>{ const f = e.rel.split('/').pop(); if(!R.re.test(f) || !isShot(f, e.rel)) return; if(row === 'h' && /OPEN/i.test(f)) return; if(row === 'k' && /BASS|808/i.test(f)) return; L.push({ src:'cloud', pack:e.pack, rel:e.rel }); });
  return L; }
const sameRef = (a,b)=> a && b && a.src === b.src && (a.src === 'synth' || (a.src === 'lib' ? a.id === b.id : (a.pack === b.pack && a.rel === b.rel)));

/* ---------------- render a pattern into a 1-bar loop ---------------- */
function patHits(p){ const H = []; for(let i=0;i<16;i++){ if(p.k[i]) H.push({ b:i*0.25, y:'k' }); if(p.s[i]) H.push({ b:i*0.25, y:'s' }); } return H; }
function hatTimes(p){ const sp = SPEEDS.find(x=>x[0]===p.speed) || SPEEDS[1], iv = sp[1], T = []; for(let t=0; t < 4 - 1e-6; t += iv){ const slot = Math.floor(t/0.25 + 1e-6); if(p.h[slot]) T.push(t); } return T; }
async function renderPat(p){
  const bs = 60/bpm, len = 4*bs, sr = ctx.sampleRate, tail = 2, N = Math.ceil(len*sr);
  const oc = new OfflineAudioContext(2, Math.ceil((len + tail)*sr), sr);
  const add = (buf, t, g)=>{ const s = oc.createBufferSource(); s.buffer = buf; const gn = oc.createGain(); gn.gain.value = g; s.connect(gn); gn.connect(oc.destination); s.start(t); };
  const bk = await soundBuf(p.snd.k, 'k'), bsn = await soundBuf(p.snd.s, 's'), bh = await soundBuf(p.snd.h, 'h');
  for(let i=0;i<16;i++){ if(p.k[i]) add(bk, i*0.25*bs, p.vol.k); if(p.s[i]) add(bsn, i*0.25*bs, p.vol.s); }
  hatTimes(p).forEach((t, j)=> add(bh, t*bs, p.vol.h * (p.speed === '32' || p.speed === '16T' ? (j % 2 ? 0.7 : 1) : (Math.abs(t % 0.5) < 1e-6 ? 1 : 0.8))));
  const r = await oc.startRendering(), out = ctx.createBuffer(2, N, sr);
  for(let c=0;c<2;c++){ const src = r.getChannelData(c), dst = out.getChannelData(c); for(let i=0;i<N;i++) dst[i] = src[i]; for(let i=N, j=0; i<src.length; i++, j++) dst[j % N] += src[i]; }   /* tails fold back to the top = seamless loop */
  p.bpm = bpm; return out;
}
function setSampleHits(s, p){ const rb = p.bpm || bpm; s.hits = patHits(p).map(h=>({ t:h.b*60/rb, y:h.y })).sort((a,b)=>a.t-b.t); s._hk = null; }
function applyBuffer(s, buf){ s.buffer = buf; s.bpm = pat.bpm; s._gbpm = undefined; s._st = new Map(); s._hq = new Map(); s.env = buildEnvelope(buf); s.peaks = buildPeaks(buf); try{ s.waveImg = renderWaveformImage(buf); }catch(e){} }
const isEmpty = p => !p.k.some(Boolean) && !p.s.some(Boolean) && !p.h.some(Boolean);
let rT = null, saveT = null, busy = false, again = false;
function changed(){ clearTimeout(rT); rT = setTimeout(rerender, 90); paint(); }
async function rerender(){
  if(busy){ again = true; return; } busy = true;
  try{
    if(!patSample && isEmpty(pat)) return;
    const buf = await renderPat(pat);
    if(!patSample){
      const wav = bufferToWav(buf, 24);
      const s = await addSample(new File([wav], 'STEPS-' + Date.now() + '.wav', { type:'audio/wav' }), { folder:'STEPS', bpm:pat.bpm, displayName:'STEPS' + (pat.preset ? ' · ' + PRESETS[pat.preset].label : ''), tags:['steps','drums'], arrayBuf:wav, quiet:true });
      if(!s) return; s.pat = pat; patSample = s; setSampleHits(s, pat); savePat();
      await addChannelFromSample(s);
      const ch = channels.find(c=>c.sample === s);
      if(ch && !sidechainTrigger){ setTrigger(ch); }
      setStatus('STEPS → track');
    } else {
      applyBuffer(patSample, buf); setSampleHits(patSample, pat); patSample.pat = pat;
      channels.forEach(ch=>{ if(ch.sample === patSample) rebuildBuffer(ch); });
      if(isRunning) reschedule(); drawTL(); markDirty();
      clearTimeout(saveT); saveT = setTimeout(()=>{ try{ saveSampleAudio(patSample, bufferToWav(patSample.buffer, 24), 'audio/wav'); }catch(e){} savePat(); commit(); }, 700);
    }
  } catch(e){ setStatus('STEPS: ' + (e && e.message || 'render failed')); }
  finally { busy = false; if(again){ again = false; rerender(); } else paint(); }
}
function savePat(){ if(!patSample) return; try{ Store.set('steps:' + patSample.id, JSON.parse(JSON.stringify(pat))); }catch(e){} }

/* ---------------- the sidechain engine (called from TUNER's clock + export) ---------------- */
const loading = new Set();
function lazyHits(s){
  if(s.hits || loading.has(s.id)) return;
  loading.add(s.id);
  (async ()=>{ try{
    let p = s.pat || pending[s.id] || (s.folder === 'STEPS' ? await Store.get('steps:' + s.id) : null);
    if(p){ s.pat = p; setSampleHits(s, p); }
    else if(hits().loopOn && s.buffer){ s.hits = await detectHits(s.buffer); s._hk = null; }
  }catch(e){} loading.delete(s.id); })();
}
STEPS.hitMode = function(){ const tr = sidechainTrigger; if(!tr || !scHits) return false; const isSteps = tr.sample.folder === 'STEPS'; if(!isSteps && !scHits.loopOn) return false; if(!(scHits.k.on || scHits.s.on)) return false; lazyHits(tr.sample); return true; };
function shapeVal(pts, x){ if(x <= 0) return pts[0][1]; for(let i=1;i<pts.length;i++){ if(x <= pts[i][0]){ const a = pts[i-1], b = pts[i], w = b[0]-a[0]; return w > 0 ? a[1] + (b[1]-a[1])*(x-a[0])/w : b[1]; } } return pts[pts.length-1][1]; }
STEPS.duckAt = function(beat){
  const tr = sidechainTrigger; if(!tr || tr.mute || !scHits) return 0; const s = tr.sample; if(!s.hits || !s.hits.length || !s.buffer) return 0;
  const c = clipAt(tr, beat); if(!c) return 0; const pos = samplePosAt(tr, beat); if(pos < 0) return 0;
  if(!s._hk){ s._hk = { k:s.hits.filter(h=>h.y==='k').map(h=>h.t), s:s.hits.filter(h=>h.y==='s').map(h=>h.t) }; }
  const D = s.buffer.duration, toB = loopBeats(s)/D, into = beat - c.start; let best = 0;
  for(const y of ['k','s']){ const sh = scHits[y]; if(!sh || !sh.on) continue; const T = s._hk[y]; if(!T.length) continue;
    let dt = -1; for(let i=T.length-1;i>=0;i--){ if(T[i] <= pos + 1e-6){ dt = pos - T[i]; break; } }
    if(dt < 0){ const w = pos + D - T[T.length-1]; if(w*toB <= into + 1e-6) dt = w; }
    if(dt < 0) continue; const db = dt*toB; if(db >= sh.len) continue;
    const v = shapeVal(sh.pts, db/sh.len) * sh.depth; if(v > best) best = v; }
  return best > 1 ? 1 : best;
};
async function detectHits(buf){
  const sr = buf.sampleRate, oc = new OfflineAudioContext(2, buf.length, sr), src = oc.createBufferSource(); src.buffer = buf;
  const l1 = oc.createBiquadFilter(), l2 = oc.createBiquadFilter(); l1.type = l2.type = 'lowpass'; l1.frequency.value = l2.frequency.value = 110;
  const h1 = oc.createBiquadFilter(); h1.type = 'highpass'; h1.frequency.value = 300; const m1 = oc.createBiquadFilter(); m1.type = 'bandpass'; m1.frequency.value = 1800; m1.Q.value = 0.7;
  const mg = oc.createChannelMerger(2); src.connect(l1); l1.connect(l2); l2.connect(mg, 0, 0); src.connect(h1); h1.connect(m1); m1.connect(mg, 0, 1); mg.connect(oc.destination); src.start();
  const r = await oc.startRendering(), hop = Math.round(sr*0.005);
  const env = d => { const n = Math.floor(d.length/hop), e = new Float32Array(n); let mx = 0; for(let i=0;i<n;i++){ let m = 0; for(let j=i*hop, z=j+hop; j<z; j++){ const v = d[j] < 0 ? -d[j] : d[j]; if(v > m) m = v; } e[i] = m; if(m > mx) mx = m; } return { e, mx }; };
  const onsets = ({e, mx}, lvl)=>{ const O = []; let lastT = -1; for(let i=0;i<e.length;i++){ const rise = e[i] - Math.max(i > 0 ? e[i-1] : 0, i > 1 ? e[i-2]*0.9 : 0); if(e[i] > lvl*mx && rise > 0.18*mx){ const t = i*hop/sr; if(t - lastT > 0.09){ let pk = e[i]; for(let j=i;j<Math.min(e.length,i+6);j++) pk = Math.max(pk, e[j]); O.push({ t:Math.max(0, t - 0.005), pk }); lastT = t; } } } return O; };
  const L = env(r.getChannelData(0)), M = env(r.getChannelData(1));
  const K = onsets(L, 0.35), S = onsets(M, 0.45).filter(o=> !(K.some(k=>Math.abs(k.t - o.t) < 0.03) && o.pk < 0.7*M.mx));
  return K.map(o=>({ t:o.t, y:'k' })).concat(S.map(o=>({ t:o.t, y:'s' }))).sort((a,b)=>a.t-b.t);
}
STEPS.meta = function(){ const o = {}; channels.forEach(ch=>{ if(ch.sample.pat) o[ch.sample.id] = ch.sample.pat; }); return Object.keys(o).length ? o : null; };
STEPS.onSettings = function(o){ if(o && o.steps) Object.assign(pending, o.steps); samples.forEach(s=>{ if(pending[s.id] && !s.pat){ s.pat = pending[s.id]; s.hits = null; } }); if(zone && zone.classList.contains('on')) paint(); };

/* ---------------- DUCK the loops (sidechain already set) ---------------- */
function duckAll(){ let n = 0; const pi = FX_SLOTS.indexOf('PUMP');
  channels.forEach(ch=>{ if(ch === sidechainTrigger || ch.scDuck) return; const nm = (ch.sample.name||'') + ' ' + (ch.sample.displayName||'') + ' ' + (ch.sample.tags||[]).join(' '); if(ch.sample.folder === 'STEPS' || DRUMWORDS.test(nm)) return;
    ch.scDuck = true; if(!ch.rack.includes('PUMP')){ ch.rack.push('PUMP'); rewireLive(ch); } if(!(ch.fx[pi] > 0)) ch.fx[pi] = 1; n++; });
  if(n){ renderRack(); refreshTimeline(); markDirty(); commit(); drawTL(); } return n; }

/* ---------------- UI ---------------- */
let zone = null, scTab = 'k', cIdx = {}, prevSrc = null;
function stepsChOf(){ const ch = selCh(); return ch && ch.sample.folder === 'STEPS' ? ch : null; }
async function open(){
  const ch = stepsChOf() || channels.find(c=>c.sample.folder === 'STEPS' && c === sidechainTrigger) || null;
  if(ch){ patSample = ch.sample; pat = patSample.pat || pending[patSample.id] || await Store.get('steps:' + patSample.id).catch(()=>null) || newPat(); patSample.pat = pat; }
  else { patSample = null; pat = newPat(); }
  hits(); zone.classList.add('on'); paint(); drawShape();
  loadCloudIdx().then(()=>paint());
}
function close(){ zone.classList.remove('on'); stopPrev(); }
function stopPrev(){ if(prevSrc){ try{ prevSrc.stop(); }catch(e){} prevSrc = null; } }
async function hear(row){ stopPrev(); try{ await ctx.resume(); }catch(e){} const b = await soundBuf(pat.snd[row], row); const s = ctx.createBufferSource(); s.buffer = b; const g = ctx.createGain(); g.gain.value = pat.vol[row]*0.9; s.connect(g); g.connect(masterGain); s.start(); prevSrc = s; }
function stepSound(row, dir){ const L = cands(row); let i = L.findIndex(r=>sameRef(r, pat.snd[row])); i = (i < 0 ? 0 : i) + dir; i = (i + L.length) % L.length; pat.snd[row] = L[i]; changed(); hear(row); }
function applyPreset(k){
  const P = PRESETS[k]; const keep = pat.snd, vol = pat.vol;
  pat = Object.assign(newPat(), { preset:k, speed:P.speed, snd:keep, vol }); P.k.forEach(i=>pat.k[i]=1); P.s.forEach(i=>pat.s[i]=1); P.h.forEach(i=>pat.h[i]=1);
  const H = hits(); H.k = Object.assign({}, H.k, JSON.parse(JSON.stringify(P.sc.k))); H.s.on = !!P.sc.s.on;
  if(patSample){ patSample.displayName = 'STEPS · ' + P.label; try{ saveSampleMeta(patSample); }catch(e){} }
  changed(); drawShape();
  setTimeout(()=>{ const ch = channels.find(c=>c.sample === patSample); if(ch && sidechainTrigger !== ch) setTrigger(ch); const n = duckAll(); setStatus(P.label + (n ? ' · ' + n + ' loop' + (n>1?'s':'') + ' ducked' : '')); }, 400);
}
function setSpeed(k){ pat.speed = k; if(k === '8'){ for(let i=0;i<16;i++) pat.h[i] = i % 2 ? 0 : 1; } else if(!pat.h.some(Boolean)) pat.h.fill(1); else if(k !== '8' && pat.h.every((v,i)=> v === (i % 2 ? 0 : 1))) pat.h.fill(1); changed(); }

function build(){
  zone = mk('div', '', ''); zone.id = 'stepsZone';
  zone.innerHTML = `
  <div class="stp-top"><div class="stp-title">STEPS</div><div class="stp-pre" id="stpPre"></div></div>
  <div class="stp-grid" id="stpGrid"></div>
  <div class="stp-sc">
    <div class="stp-sch"><span>SIDECHAIN</span><div class="stp-tabs" id="stpTabs"></div><button class="stp-tg" id="stpOn">ON</button></div>
    <div class="stp-src" id="stpSrc"></div>
    <canvas id="stpShape"></canvas>
    <div class="stp-row2"><div class="stp-lens" id="stpLens"></div><label>DEPTH</label><input type="range" id="stpDepth" min="0" max="100"><b id="stpDepthV"></b></div>
    <div class="stp-hint">tap = add a dot · drag = move · tap a dot = remove</div>
  </div>
  <div class="stp-bar"><button id="stpBack" data-k="STEPS BACK">◂ TUNER</button><div class="stp-info" id="stpInfo"></div><button id="stpDuck" data-k="STEPS DUCK">DUCK LOOPS</button><button id="stpPlay" data-k="STEPS PLAY" aria-label="play"></button></div>`;
  document.body.appendChild(zone);
  $('stpBack').addEventListener('click', close);
  $('stpPlay').addEventListener('click', ()=>{ if(!channels.length && isEmpty(pat)){ setStatus('tap some steps first'); return; } $('transportBtn').click(); setTimeout(paintPlay, 60); });
  $('stpDuck').addEventListener('click', ()=>{ if(!sidechainTrigger){ setStatus('no TRIGGER yet — tap some steps'); return; } const n = duckAll(); setStatus(n ? n + ' loop' + (n>1?'s':'') + ' now DUCKED' : 'nothing new to duck'); });
  $('stpOn').addEventListener('click', ()=>{ const H = hits(); H[scTab].on = !H[scTab].on; markDirty(); commit(); paint(); drawShape(); });
  $('stpDepth').addEventListener('input', e=>{ const H = hits(); H[scTab].depth = +e.target.value/100; $('stpDepthV').textContent = e.target.value + '%'; markDirty(); drawShape(); });
  $('stpDepth').addEventListener('change', ()=> commit());
  shapeEvents($('stpShape'));
  window.addEventListener('resize', ()=>{ if(zone.classList.contains('on')) drawShape(); });
}
function paintPlay(){ const b = $('stpPlay'); if(!b) return; b.classList.toggle('playing', isRunning); b.innerHTML = isRunning ? '<svg viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1"/></svg>' : '<svg viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z"/></svg>'; }
function paint(){
  if(!zone || !pat) return; const H = hits();
  const pre = $('stpPre'); pre.innerHTML = '';
  Object.entries(PRESETS).forEach(([k, P])=>{ const b = mk('button', 'stp-chip' + (pat.preset === k ? ' on' : ''), P.label); b.dataset.k = 'STEPS ' + P.label; b.addEventListener('click', ()=> applyPreset(k)); pre.appendChild(b); });
  const clr = mk('button', 'stp-chip ghost', 'CLEAR'); clr.addEventListener('click', ()=>{ pat.k.fill(0); pat.s.fill(0); pat.h.fill(0); pat.preset = null; changed(); }); pre.appendChild(clr);
  const g = $('stpGrid'); g.innerHTML = '';
  ROWS.forEach(R=>{
    const row = mk('div', 'stp-r');
    const lab = mk('button', 'stp-lab', `<b>${R.n}</b><i>${refName(pat.snd[R.k], R.k)}</i>`); lab.addEventListener('click', ()=> hear(R.k)); row.appendChild(lab);
    const cells = mk('div', 'stp-cells');
    const live = R.k === 'h' ? new Set(hatTimes(Object.assign({}, pat, { h:Array(16).fill(1) })).map(t=>Math.floor(t/0.25 + 1e-6))) : null;
    for(let i=0;i<16;i++){ const c = mk('button', 'stp-c' + (pat[R.k][i] ? ' on' : '') + (i % 4 === 0 ? ' bt' : '') + (live && !live.has(i) ? ' dead' : '')); c.addEventListener('pointerdown', e=>{ e.preventDefault(); pat[R.k][i] = pat[R.k][i] ? 0 : 1; if(R.k !== 'h' || true) pat.preset = pat.preset; changed(); }); cells.appendChild(c); }
    row.appendChild(cells);
    const ar = mk('div', 'stp-ar'); const a1 = mk('button', '', '◂'), a2 = mk('button', '', '▸'); a1.addEventListener('click', ()=> stepSound(R.k, -1)); a2.addEventListener('click', ()=> stepSound(R.k, 1)); ar.appendChild(a1); ar.appendChild(a2); row.appendChild(ar);
    g.appendChild(row);
    if(R.k === 'h'){ const sp = mk('div', 'stp-sp'); sp.appendChild(mk('span', '', 'HAT SPEED')); SPEEDS.forEach(([k,,lb])=>{ const b = mk('button', 'stp-chip sm' + (pat.speed === k ? ' on' : ''), lb); b.addEventListener('click', ()=> setSpeed(k)); sp.appendChild(b); });
      const v = mk('div', 'stp-vols'); ROWS.forEach(Q=>{ const w = mk('label', '', Q.n[0]); const r = mk('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = Math.round(pat.vol[Q.k]*100); r.addEventListener('input', ()=>{ pat.vol[Q.k] = +r.value/100; clearTimeout(rT); rT = setTimeout(rerender, 150); }); w.appendChild(r); v.appendChild(w); }); sp.appendChild(v);
      g.appendChild(sp); }
  });
  const tabs = $('stpTabs'); tabs.innerHTML = '';
  [['k','KICK'],['s','SNARE']].forEach(([k, n])=>{ const b = mk('button', 'stp-chip sm' + (scTab === k ? ' on' : '') + (H[k].on ? ' live' : ''), n); b.addEventListener('click', ()=>{ scTab = k; paint(); drawShape(); }); tabs.appendChild(b); });
  $('stpOn').textContent = H[scTab].on ? 'ON' : 'OFF'; $('stpOn').classList.toggle('on', !!H[scTab].on);
  $('stpDepth').value = Math.round(H[scTab].depth*100); $('stpDepthV').textContent = Math.round(H[scTab].depth*100) + '%';
  const lens = $('stpLens'); lens.innerHTML = '';
  [[0.25,'1/16'],[0.5,'1/8'],[1,'1/4'],[2,'1/2']].forEach(([v, lb])=>{ const b = mk('button', 'stp-chip sm' + (Math.abs(H[scTab].len - v) < 1e-6 ? ' on' : ''), lb); b.addEventListener('click', ()=>{ H[scTab].len = v; markDirty(); commit(); paint(); drawShape(); }); lens.appendChild(b); });
  const tr = sidechainTrigger, src = $('stpSrc');
  if(!tr) src.innerHTML = '<span>TRIGGER: none yet — tap some steps</span>';
  else if(tr.sample.folder === 'STEPS') src.innerHTML = '<span>TRIGGER: <b>' + (tr.sample.displayName||'STEPS') + '</b> · its kicks + snares</span>';
  else { src.innerHTML = '<span>TRIGGER: <b>' + (tr.sample.displayName||'loop') + '</b></span>'; const t = mk('button', 'stp-chip sm' + (H.loopOn ? ' on' : ''), H.loopOn ? 'KICK/SNARE HITS ON' : 'USE KICK/SNARE HITS'); t.addEventListener('click', async ()=>{ H.loopOn = !H.loopOn; if(H.loopOn && !tr.sample.hits && tr.sample.buffer){ setStatus('finding kicks + snares…'); tr.sample.hits = await detectHits(tr.sample.buffer); tr.sample._hk = null; const nk = tr.sample.hits.filter(h=>h.y==='k').length, ns = tr.sample.hits.length - nk; setStatus(nk + ' kicks · ' + ns + ' snares found'); } markDirty(); commit(); paint(); drawShape(); }); src.appendChild(t); }
  const nk = pat.k.filter(Boolean).length, ns = pat.s.filter(Boolean).length;
  $('stpInfo').textContent = (patSample ? 'on the timeline' : (isEmpty(pat) ? 'tap steps or a preset' : 'adding…')) + ' · ' + bpm + ' BPM';
  paintPlay();
}

/* ---------------- drawn shape (dots, FL-style: the line = the ducked loop's volume) ---------------- */
let drag = null;
function shapeGeom(cv){ const r = cv.getBoundingClientRect(); return { w:r.width, h:r.height, pad:10, r }; }
function drawShape(){
  const cv = $('stpShape'); if(!cv || !zone.classList.contains('on')) return; const cx = cv.getContext('2d'); const s = fitCanvas(cv, cx); if(!s) return;
  const { w, h } = s, pad = 10, gw = w - pad*2, gh = h - pad*2, sh = hits()[scTab];
  cx.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement), green = cs.getPropertyValue('--green').trim() || '#4fd1a5';
  cx.strokeStyle = 'rgba(255,255,255,.07)'; cx.lineWidth = 1; const div = Math.round(sh.len/0.0625);
  for(let i=0;i<=div;i++){ const x = pad + gw*i/div; cx.globalAlpha = (i % 4 === 0) ? 1 : 0.4; cx.beginPath(); cx.moveTo(x, pad); cx.lineTo(x, pad+gh); cx.stroke(); } cx.globalAlpha = 1;
  [0, 0.5, 1].forEach(v=>{ cx.beginPath(); cx.moveTo(pad, pad + gh*v); cx.lineTo(pad+gw, pad + gh*v); cx.stroke(); });
  const X = x => pad + x*gw, Y = d => pad + d*sh.depth*gh;   /* y down = more duck */
  cx.beginPath(); cx.moveTo(X(0), pad); sh.pts.forEach(([x, d])=> cx.lineTo(X(x), Y(d))); cx.lineTo(X(1), pad); cx.closePath(); cx.fillStyle = sh.on ? 'rgba(79,209,165,.10)' : 'rgba(255,255,255,.04)'; cx.fill();
  cx.beginPath(); sh.pts.forEach(([x, d], i)=> i ? cx.lineTo(X(x), Y(d)) : cx.moveTo(X(x), Y(d))); cx.strokeStyle = sh.on ? green : '#5a554e'; cx.lineWidth = 1.6; cx.stroke();
  sh.pts.forEach(([x, d])=>{ cx.beginPath(); cx.arc(X(x), Y(d), 4.5, 0, Math.PI*2); cx.fillStyle = '#060504'; cx.fill(); cx.strokeStyle = sh.on ? green : '#8a8276'; cx.lineWidth = 1.5; cx.stroke(); });
  cx.fillStyle = '#8a8276'; cx.font = '8px ' + (cs.getPropertyValue('--mono').trim() || 'monospace'); cx.fillText((scTab === 'k' ? 'KICK' : 'SNARE') + ' HIT', pad + 3, h - 3); cx.textAlign = 'right'; cx.fillText('VOLUME ↑', w - pad - 3, pad + 9); cx.textAlign = 'left';
}
function shapeEvents(cv){
  const toPt = e => { const g = shapeGeom(cv), sh = hits()[scTab]; const x = clamp((e.clientX - g.r.left - g.pad)/(g.w - g.pad*2), 0, 1); const dRaw = clamp((e.clientY - g.r.top - g.pad)/(g.h - g.pad*2), 0, 1); return { x, d: sh.depth > 0.01 ? clamp(dRaw/sh.depth, 0, 1) : dRaw, g }; };
  cv.addEventListener('pointerdown', e=>{ e.preventDefault(); cv.setPointerCapture(e.pointerId); const sh = hits()[scTab], p = toPt(e), g = p.g;
    let hit = -1, best = 22; sh.pts.forEach(([x, d], i)=>{ const px = g.pad + x*(g.w - g.pad*2), py = g.pad + d*sh.depth*(g.h - g.pad*2); const dd = Math.hypot(px - (e.clientX - g.r.left), py - (e.clientY - g.r.top)); if(dd < best){ best = dd; hit = i; } });
    if(hit < 0){ let i = sh.pts.findIndex(q=>q[0] > p.x); if(i <= 0) i = sh.pts.length - 1; sh.pts.splice(i, 0, [p.x, p.d]); hit = i; drag = { i:hit, added:true, x0:e.clientX, y0:e.clientY, t0:performance.now() }; }
    else drag = { i:hit, added:false, x0:e.clientX, y0:e.clientY, t0:performance.now(), moved:false };
    if(!sh.on){ sh.on = true; paint(); } drawShape(); });
  cv.addEventListener('pointermove', e=>{ if(!drag) return; const sh = hits()[scTab], p = toPt(e); if(Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) drag.moved = true; if(!drag.moved && !drag.added) return;
    const i = drag.i, last = sh.pts.length - 1; let x = p.x; if(i === 0) x = 0; else if(i === last) x = 1; else x = clamp(x, sh.pts[i-1][0] + 0.005, sh.pts[i+1][0] - 0.005); sh.pts[i] = [x, p.d]; drawShape(); });
  const end = ()=>{ if(!drag) return; const sh = hits()[scTab]; if(!drag.added && !drag.moved && performance.now() - drag.t0 < 350 && drag.i > 0 && drag.i < sh.pts.length - 1) sh.pts.splice(drag.i, 1); drag = null; drawShape(); markDirty(); commit(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}

/* ---------------- boot ---------------- */
function boot(){ build(); const b = $('stepsBtn'); if(b) b.addEventListener('click', open); $('transportBtn').addEventListener('click', ()=> setTimeout(paintPlay, 80)); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
STEPS.open = open; STEPS._pat = ()=>pat; STEPS._detect = detectHits; STEPS._applyPreset = applyPreset;
})();
