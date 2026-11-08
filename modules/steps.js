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

function newPat(){ return { v:1, preset:null, k:Array(16).fill(0), s:Array(16).fill(0), h:Array(16).fill(0), speed:'16', snd:{ k:{src:'synth'}, s:{src:'synth'}, h:{src:'synth'} }, vol:{ k:1, s:0.85, h:0.5 }, bpm:null, bars:1, env:{} }; }
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

/* ---------------- render a pattern into a loop (1 · 2 · 4 bars) ---------------- */
function norm(p){ if(!p) return p; p.bars = p.bars || Math.max(1, Math.round((p.k||[]).length/16)) || 1; const N = 16*p.bars;
  ['k','s','h'].forEach(r=>{ const a = p[r] || []; while(a.length < N) a.push(a[a.length % 16] || 0); a.length = N; p[r] = a; });
  p.env = p.env || {}; p.vol = p.vol || { k:1, s:0.85, h:0.5 }; p.snd = p.snd || { k:{src:'synth'}, s:{src:'synth'}, h:{src:'synth'} }; return p; }
const NS = p => 16*(p.bars||1);
function patHits(p){ const H = []; for(let i=0;i<NS(p);i++){ if(p.k[i]) H.push({ b:i*0.25, y:'k' }); if(p.s[i]) H.push({ b:i*0.25, y:'s' }); } return H; }
function hatTimes(p){ const sp = SPEEDS.find(x=>x[0]===p.speed) || SPEEDS[1], iv = sp[1], T = [], L = 4*(p.bars||1); for(let k=0; k*iv < L - 1e-6; k++){ const t = k*iv, slot = Math.floor(t/0.25 + 1e-6); if(p.h[slot]) T.push(t); } return T; }
/* FADE per sound: env = { fin, fo, end } in seconds (fade-in end · fade-out start · cut). none = the whole sound, as before */
function envOf(p, row, buf){ const e = p.env && p.env[row]; const d = buf ? buf.duration : 2; if(!e) return null; const end = clamp(e.end ?? d, 0.01, d), fo = clamp(e.fo ?? end, 0, end), fin = clamp(e.fin ?? 0, 0, fo); return { fin, fo, end }; }
async function renderPat(p){
  norm(p); const bs = 60/bpm, len = 4*p.bars*bs, sr = ctx.sampleRate, tail = 2, N = Math.ceil(len*sr);
  const oc = new OfflineAudioContext(2, Math.ceil((len + tail)*sr), sr);
  const add = (buf, t, g, e)=>{ const s = oc.createBufferSource(); s.buffer = buf; const gn = oc.createGain(); s.connect(gn); gn.connect(oc.destination);
    if(e){ if(e.fin > 0.0005){ gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + e.fin); } else gn.gain.setValueAtTime(g, t); gn.gain.setValueAtTime(g, t + Math.max(e.fin, e.fo)); gn.gain.linearRampToValueAtTime(0, t + Math.max(e.fo + 0.002, e.end)); s.start(t); s.stop(t + e.end + 0.005); }
    else { gn.gain.value = g; s.start(t); } };
  const bk = await soundBuf(p.snd.k, 'k'), bsn = await soundBuf(p.snd.s, 's'), bh = await soundBuf(p.snd.h, 'h');
  rowBuf.k = bk; rowBuf.s = bsn; rowBuf.h = bh;
  const ek = envOf(p, 'k', bk), es = envOf(p, 's', bsn), eh = envOf(p, 'h', bh);
  for(let i=0;i<NS(p);i++){ if(p.k[i]) add(bk, i*0.25*bs, p.vol.k, ek); if(p.s[i]) add(bsn, i*0.25*bs, p.vol.s, es); }
  hatTimes(p).forEach((t, j)=> add(bh, t*bs, p.vol.h * (p.speed === '32' || p.speed === '16T' ? (j % 2 ? 0.7 : 1) : (Math.abs(t % 0.5) < 1e-6 ? 1 : 0.8)), eh));
  const r = await oc.startRendering(), out = ctx.createBuffer(2, N, sr);
  for(let c=0;c<2;c++){ const src = r.getChannelData(c), dst = out.getChannelData(c); for(let i=0;i<N;i++) dst[i] = src[i]; for(let i=N, j=0; i<src.length; i++, j++) dst[j % N] += src[i]; }   /* tails fold back to the top = seamless loop */
  p.bpm = bpm; return out;
}
const rowBuf = {};   /* the decoded sound of each row (for the pictures) */
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
      const oldBeats = patSample.buffer ? loopBeats(patSample) : 4;
      applyBuffer(patSample, buf); setSampleHits(patSample, pat); patSample.pat = pat;
      const nb = 4*pat.bars;
      channels.forEach(ch=>{ if(ch.sample !== patSample) return; rebuildBuffer(ch);
        if(nb !== oldBeats){ const cl = ch.clips.slice().sort((x,y)=>x.start-y.start);   /* longer/shorter pattern: clips stay on the song grid, a lone clip grows to fit */
          cl.forEach((c, i)=>{ c.off = ((c.start % nb) + nb) % nb; const nx = cl[i+1]; if(c.len === oldBeats && (!nx || nx.start >= c.start + nb)) c.len = nb; });
          refreshTimeline(); } });
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
    if(p){ s.pat = norm(p); setSampleHits(s, s.pat); }
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
let zone = null, scTab = 'k', panel = 'sc', selRow = 'k', page = 0, prevSrc = null;
function stepsChOf(){ const ch = selCh(); return ch && ch.sample.folder === 'STEPS' ? ch : null; }
/* STEPS button = always opens your pattern: the selected STEPS loop, else the one that's the TRIGGER, else the last one on the timeline */
function findStepsCh(){ return stepsChOf() || channels.find(c=>c.sample.folder === 'STEPS' && c === sidechainTrigger) || channels.slice().reverse().find(c=>c.sample.folder === 'STEPS') || null; }
async function loadPatFor(s){ let p = s.pat || pending[s.id] || null; if(!p){ try{ p = await Store.get('steps:' + s.id); }catch(e){} } return norm(p || newPat()); }
async function open(fresh){
  const ch = fresh ? null : findStepsCh();
  if(ch){ patSample = ch.sample; pat = await loadPatFor(patSample); patSample.pat = pat; try{ selectChannel(ch.id); }catch(e){} }
  else { patSample = null; pat = norm(newPat()); }
  page = 0; hits(); zone.classList.add('on'); paint(); warmBufs(); drawAll2(); liveLoop();
  loadCloudIdx().then(()=>paint());
}
function close(){ zone.classList.remove('on'); stopPrev(); if(!patSample){ try{ addAtBeat = null; hidePlus(); }catch(e){} } }
function stopPrev(){ if(prevSrc){ try{ prevSrc.stop(); }catch(e){} prevSrc = null; } }
async function warmBufs(){ for(const r of ['k','s','h']) rowBuf[r] = await soundBuf(pat.snd[r], r); drawAll2(); }
async function hear(row){ stopPrev(); try{ await ctx.resume(); }catch(e){} const b = rowBuf[row] = await soundBuf(pat.snd[row], row); const e = envOf(pat, row, b); const s = ctx.createBufferSource(); s.buffer = b; const g = ctx.createGain(); const v = pat.vol[row]*0.9, t = ctx.currentTime + 0.01; s.connect(g); g.connect(masterGain);
  if(e){ if(e.fin > 0.0005){ g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + e.fin); } else g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + e.fo); g.gain.linearRampToValueAtTime(0, t + Math.max(e.fo + 0.002, e.end)); s.start(t); s.stop(t + e.end + 0.01); } else { g.gain.value = v; s.start(t); } prevSrc = s; }
async function pickSound(row, dir){ const L = cands(row); let i = L.findIndex(r=>sameRef(r, pat.snd[row]));
  if(dir === 0){ i = Math.floor(Math.random()*L.length); } else { i = (i < 0 ? 0 : i) + dir; i = (i + L.length) % L.length; }
  pat.snd[row] = L[i]; if(pat.env) delete pat.env[row];   /* new sound = its own full length */
  rowBuf[row] = await soundBuf(pat.snd[row], row); changed(); hear(row); drawAll2(); }
function applyPreset(k){
  const P = PRESETS[k]; const keep = pat.snd, vol = pat.vol, env = pat.env, bars = pat.bars || 1;
  pat = norm(Object.assign(newPat(), { preset:k, speed:P.speed, snd:keep, vol, env })); P.k.forEach(i=>pat.k[i]=1); P.s.forEach(i=>pat.s[i]=1); P.h.forEach(i=>pat.h[i]=1);
  if(bars > 1) setBars(bars, true);
  const H = hits(); H.k = Object.assign({}, H.k, JSON.parse(JSON.stringify(P.sc.k))); H.s.on = !!P.sc.s.on;
  if(patSample){ patSample.displayName = 'STEPS · ' + P.label; try{ saveSampleMeta(patSample); }catch(e){} }
  changed(); drawAll2();
  setTimeout(()=>{ const ch = channels.find(c=>c.sample === patSample); if(ch && sidechainTrigger !== ch) setTrigger(ch); const n = duckAll(); setStatus(P.label + (n ? ' · ' + n + ' loop' + (n>1?'s':'') + ' ducked' : '')); }, 400);
}
function setBars(n, quiet){ const old = pat.bars || 1; pat.bars = n; ['k','s','h'].forEach(r=>{ const a = pat[r].slice(0, 16*old), b = []; for(let i=0;i<16*n;i++) b.push(a[i % a.length] || 0); pat[r] = b; }); if(page >= n) page = n - 1; if(!quiet) changed(); }   /* new bars start as copies — then change them */
function setSpeed(k){ const N = NS(pat); pat.speed = k; if(k === '8'){ for(let i=0;i<N;i++) pat.h[i] = i % 2 ? 0 : 1; } else if(!pat.h.some(Boolean)) pat.h.fill(1); else if(pat.h.every((v,i)=> v === (i % 2 ? 0 : 1))) pat.h.fill(1); changed(); }

function build(){
  zone = mk('div', '', ''); zone.id = 'stepsZone';
  zone.innerHTML = `
  <div class="stp-top"><div class="stp-title">STEPS</div><div class="stp-pre" id="stpPre"></div></div>
  <div class="stp-len" id="stpLen"></div>
  <div class="stp-grid" id="stpGrid"></div>
  <div class="stp-sc">
    <div class="stp-sch"><div class="stp-tabs l" id="stpPanels"></div><div class="stp-tabs" id="stpTabs"></div><button class="stp-tg" id="stpOn">ON</button></div>
    <div class="stp-pane" id="stpSnd">
      <div class="stp-pick"><button id="stpPrev" data-k="STEPS PREV">◂</button><div class="stp-nm" id="stpNm"></div><button id="stpRnd" data-k="STEPS RANDOM">RANDOM</button><button id="stpNext" data-k="STEPS NEXT">▸</button></div>
      <canvas id="stpWave"></canvas>
      <div class="stp-row2"><span id="stpFadeTxt"></span><button class="stp-chip sm ghost" id="stpFadeReset">FULL</button></div>
      <div class="stp-hint">drag the dots: fade in · fade out · cut</div>
    </div>
    <div class="stp-pane" id="stpScp">
      <div class="stp-src" id="stpSrc"></div>
      <canvas id="stpShape"></canvas>
      <div class="stp-row2"><button class="stp-chip sm" id="stpAuto" data-k="STEPS AUTO">AUTO</button><div class="stp-lens" id="stpLens"></div><label>DEPTH</label><input type="range" id="stpDepth" min="0" max="100"><b id="stpDepthV"></b></div>
      <canvas id="stpLive"></canvas>
      <div class="stp-hint">dots: tap = add · drag = move · tap a dot = remove · bottom = live, kick vs your ducked loop</div>
    </div>
  </div>
  <div class="stp-bar"><button id="stpBack" data-k="STEPS BACK">◂ TUNER</button><div class="stp-info" id="stpInfo"></div><button id="stpDuck" data-k="STEPS DUCK">DUCK LOOPS</button><button id="stpPlay" data-k="STEPS PLAY" aria-label="play"></button></div>`;
  document.body.appendChild(zone);
  $('stpBack').addEventListener('click', close);
  $('stpPlay').addEventListener('click', ()=>{ if(!channels.length && isEmpty(pat)){ setStatus('tap some steps first'); return; } $('transportBtn').click(); setTimeout(()=>{ paintPlay(); liveLoop(); }, 60); });
  $('stpDuck').addEventListener('click', ()=>{ if(!sidechainTrigger){ setStatus('no TRIGGER yet — tap some steps'); return; } const n = duckAll(); setStatus(n ? n + ' loop' + (n>1?'s':'') + ' now DUCKED' : 'nothing new to duck'); });
  $('stpOn').addEventListener('click', ()=>{ const H = hits(); H[scTab].on = !H[scTab].on; markDirty(); commit(); paint(); drawShape(); });
  $('stpDepth').addEventListener('input', e=>{ const H = hits(); H[scTab].depth = +e.target.value/100; $('stpDepthV').textContent = e.target.value + '%'; markDirty(); drawShape(); });
  $('stpDepth').addEventListener('change', ()=> commit());
  $('stpPrev').addEventListener('click', ()=> pickSound(selRow, -1));
  $('stpNext').addEventListener('click', ()=> pickSound(selRow, 1));
  $('stpRnd').addEventListener('click', ()=> pickSound(selRow, 0));
  $('stpNm').addEventListener('click', ()=> hear(selRow));
  $('stpFadeReset').addEventListener('click', ()=>{ if(pat.env) delete pat.env[selRow]; changed(); drawWave(); hear(selRow); });
  $('stpAuto').addEventListener('click', autoShape);
  shapeEvents($('stpShape')); waveEvents($('stpWave'));
  window.addEventListener('resize', ()=>{ if(zone.classList.contains('on')) drawAll2(); });
}
function drawAll2(){ drawWave(); drawShape(); }
function paintPlay(){ const b = $('stpPlay'); if(!b) return; b.classList.toggle('playing', isRunning); b.innerHTML = isRunning ? '<svg viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1"/></svg>' : '<svg viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z"/></svg>'; }
function paint(){
  if(!zone || !pat) return; const H = hits(); norm(pat);
  const pre = $('stpPre'); pre.innerHTML = '';
  Object.entries(PRESETS).forEach(([k, P])=>{ const b = mk('button', 'stp-chip' + (pat.preset === k ? ' on' : ''), P.label); b.dataset.k = 'STEPS ' + P.label; b.addEventListener('click', ()=> applyPreset(k)); pre.appendChild(b); });
  const clr = mk('button', 'stp-chip ghost', 'CLEAR'); clr.addEventListener('click', ()=>{ pat.k.fill(0); pat.s.fill(0); pat.h.fill(0); pat.preset = null; changed(); }); pre.appendChild(clr);
  const nw = mk('button', 'stp-chip ghost', '+ NEW'); nw.dataset.k = 'STEPS NEW'; nw.addEventListener('click', ()=> open(true)); pre.appendChild(nw);
  const ln = $('stpLen'); ln.innerHTML = '<span>LENGTH</span>';
  [1,2,4].forEach(n=>{ const b = mk('button', 'stp-chip sm' + (pat.bars === n ? ' on' : ''), n + (n === 1 ? ' BAR' : ' BARS')); b.addEventListener('click', ()=> setBars(n)); ln.appendChild(b); });
  if(pat.bars > 1){ const sp = mk('span', 'gap', 'BAR'); ln.appendChild(sp); for(let i=0;i<pat.bars;i++){ const b = mk('button', 'stp-chip sm' + (page === i ? ' on' : ''), String(i+1)); b.addEventListener('click', ()=>{ page = i; paint(); }); ln.appendChild(b); } }
  const g = $('stpGrid'); g.innerHTML = ''; const o = page*16;
  ROWS.forEach(R=>{
    const row = mk('div', 'stp-r' + (selRow === R.k ? ' sel' : ''));
    const lab = mk('button', 'stp-lab', `<b>${R.n}</b><i>${refName(pat.snd[R.k], R.k)}</i>`); lab.addEventListener('click', ()=>{ selRow = R.k; panel = 'snd'; hear(R.k); paint(); drawWave(); }); row.appendChild(lab);
    const cells = mk('div', 'stp-cells');
    const live = R.k === 'h' ? new Set(hatTimes(Object.assign({}, pat, { h:Array(NS(pat)).fill(1) })).map(t=>Math.floor(t/0.25 + 1e-6))) : null;
    for(let i=0;i<16;i++){ const j = o + i; const c = mk('button', 'stp-c' + (pat[R.k][j] ? ' on' : '') + (i % 4 === 0 ? ' bt' : '') + (live && !live.has(j) ? ' dead' : '')); c.addEventListener('pointerdown', e=>{ e.preventDefault(); pat[R.k][j] = pat[R.k][j] ? 0 : 1; changed(); }); cells.appendChild(c); }
    row.appendChild(cells); g.appendChild(row);
    if(R.k === 'h'){ const sp = mk('div', 'stp-sp'); sp.appendChild(mk('span', '', 'HAT SPEED')); SPEEDS.forEach(([k,,lb])=>{ const b = mk('button', 'stp-chip sm' + (pat.speed === k ? ' on' : ''), lb); b.addEventListener('click', ()=> setSpeed(k)); sp.appendChild(b); });
      const v = mk('div', 'stp-vols'); ROWS.forEach(Q=>{ const w = mk('label', '', Q.n[0]); const r = mk('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = Math.round(pat.vol[Q.k]*100); r.addEventListener('input', ()=>{ pat.vol[Q.k] = +r.value/100; clearTimeout(rT); rT = setTimeout(rerender, 150); }); w.appendChild(r); v.appendChild(w); }); sp.appendChild(v);
      g.appendChild(sp); }
  });
  const pn = $('stpPanels'); pn.innerHTML = '';
  [['snd', ROWS.find(r=>r.k===selRow).n + ' SOUND'], ['sc', 'SIDECHAIN']].forEach(([k, n])=>{ const b = mk('button', 'stp-chip sm' + (panel === k ? ' on' : ''), n); b.addEventListener('click', ()=>{ panel = k; paint(); drawAll2(); }); pn.appendChild(b); });
  $('stpSnd').style.display = panel === 'snd' ? '' : 'none'; $('stpScp').style.display = panel === 'sc' ? '' : 'none';
  $('stpNm').innerHTML = '<b>' + refName(pat.snd[selRow], selRow) + '</b><i>tap = hear</i>';
  const tabs = $('stpTabs'); tabs.innerHTML = ''; tabs.style.display = panel === 'sc' ? '' : 'none'; $('stpOn').style.display = panel === 'sc' ? '' : 'none';
  [['k','KICK'],['s','SNARE']].forEach(([k, n])=>{ const b = mk('button', 'stp-chip sm' + (scTab === k ? ' on' : '') + (H[k].on ? ' live' : ''), n); b.addEventListener('click', ()=>{ scTab = k; paint(); drawShape(); }); tabs.appendChild(b); });
  $('stpOn').textContent = H[scTab].on ? 'ON' : 'OFF'; $('stpOn').classList.toggle('on', !!H[scTab].on);
  $('stpDepth').value = Math.round(H[scTab].depth*100); $('stpDepthV').textContent = Math.round(H[scTab].depth*100) + '%';
  const lens = $('stpLens'); lens.innerHTML = '';
  [[0.25,'1/16'],[0.5,'1/8'],[1,'1/4'],[2,'1/2']].forEach(([v, lb])=>{ const b = mk('button', 'stp-chip sm' + (Math.abs(H[scTab].len - v) < 1e-6 ? ' on' : ''), lb); b.addEventListener('click', ()=>{ H[scTab].len = v; markDirty(); commit(); paint(); drawShape(); }); lens.appendChild(b); });
  const tr = sidechainTrigger, src = $('stpSrc');
  if(!tr) src.innerHTML = '<span>TRIGGER: none yet — tap some steps</span>';
  else if(tr.sample.folder === 'STEPS') src.innerHTML = '<span>TRIGGER: <b>' + (tr.sample.displayName||'STEPS') + '</b> · its kicks + snares</span>';
  else { src.innerHTML = '<span>TRIGGER: <b>' + (tr.sample.displayName||'loop') + '</b></span>'; const t = mk('button', 'stp-chip sm' + (H.loopOn ? ' on' : ''), H.loopOn ? 'KICK/SNARE HITS ON' : 'USE KICK/SNARE HITS'); t.addEventListener('click', async ()=>{ H.loopOn = !H.loopOn; if(H.loopOn && !tr.sample.hits && tr.sample.buffer){ setStatus('finding kicks + snares…'); tr.sample.hits = await detectHits(tr.sample.buffer); tr.sample._hk = null; const nk = tr.sample.hits.filter(h=>h.y==='k').length, ns = tr.sample.hits.length - nk; setStatus(nk + ' kicks · ' + ns + ' snares found'); } markDirty(); commit(); paint(); drawShape(); }); src.appendChild(t); }
  $('stpInfo').textContent = (patSample ? 'editing ' + (patSample.displayName || 'STEPS') : (isEmpty(pat) ? 'tap steps or a preset' : 'adding…')) + ' · ' + bpm + ' BPM';
  paintPlay();
}

/* ---------------- shared canvas helpers ---------------- */
function css(){ const cs = getComputedStyle(document.documentElement); return { green:cs.getPropertyValue('--green').trim() || '#4fd1a5', mono:cs.getPropertyValue('--mono').trim() || 'monospace' }; }
function wavePath(cx, buf, x0, w, y0, h, t0, t1, col){   /* mirrored waveform of buf from t0..t1 seconds */
  if(!buf) return; const d = buf.getChannelData(0), sr = buf.sampleRate, n = Math.max(1, Math.floor(w)); cx.fillStyle = col;
  for(let i=0;i<n;i++){ const a = Math.floor((t0 + (t1-t0)*i/n)*sr), b = Math.floor((t0 + (t1-t0)*(i+1)/n)*sr); if(a >= d.length) break; let m = 0; for(let j=a;j<Math.min(b, d.length);j++){ const v = d[j] < 0 ? -d[j] : d[j]; if(v > m) m = v; } const hh = Math.max(0.5, m*h/2); cx.fillRect(x0 + i, y0 + h/2 - hh, 1, hh*2); } }

/* ---------------- FADE editor (the picture of the sound + 3 dots) ---------------- */
let wdrag = null;
function waveView(){ const b = rowBuf[selRow]; const d = b ? Math.min(b.duration, 2.5) : 0.5; return { b, d }; }
function drawWave(){
  const cv = $('stpWave'); if(!cv || !zone.classList.contains('on') || panel !== 'snd') return; const cx = cv.getContext('2d'); const s = fitCanvas(cv, cx); if(!s) return;
  const { w, h } = s, pad = 10, gw = w - pad*2, gh = h - pad*2, { green, mono } = css(), { b, d } = waveView(); cx.clearRect(0, 0, w, h);
  if(!b){ cx.fillStyle = '#5a554e'; cx.font = '9px ' + mono; cx.fillText('loading…', pad, h/2); return; }
  const e = envOf(pat, selRow, b) || { fin:0, fo:Math.min(b.duration, d), end:Math.min(b.duration, d) }, X = t => pad + gw*t/d;
  wavePath(cx, b, pad, gw, pad, gh, 0, d, 'rgba(242,237,226,.55)');
  cx.fillStyle = 'rgba(6,5,4,.72)'; cx.fillRect(X(e.end), pad, w - pad - X(e.end), gh);   /* cut part */
  cx.beginPath(); cx.moveTo(X(0), pad + gh); cx.lineTo(X(e.fin), pad); cx.lineTo(X(e.fo), pad); cx.lineTo(X(e.end), pad + gh); cx.strokeStyle = green; cx.lineWidth = 1.5; cx.stroke();
  [[e.fin, pad], [e.fo, pad], [e.end, pad + gh]].forEach(([t, y])=>{ cx.beginPath(); cx.arc(X(t), y, 5, 0, Math.PI*2); cx.fillStyle = '#060504'; cx.fill(); cx.strokeStyle = green; cx.lineWidth = 1.5; cx.stroke(); });
  cx.fillStyle = '#8a8276'; cx.font = '8px ' + mono; cx.fillText('IN', X(e.fin) + 7, pad + 10); cx.fillText('OUT', X(e.fo) + 7, pad + 22); cx.textAlign = 'right'; cx.fillText('CUT', X(e.end) - 7, pad + gh - 3); cx.textAlign = 'left';
  const ms = v => Math.round(v*1000) + 'ms'; $('stpFadeTxt').textContent = 'IN ' + ms(e.fin) + ' · OUT ' + ms(Math.max(0, e.end - e.fo)) + ' · LENGTH ' + ms(e.end);
}
function waveEvents(cv){
  const tOf = ev => { const r = cv.getBoundingClientRect(), { d } = waveView(); return clamp((ev.clientX - r.left - 10)/(r.width - 20), 0, 1)*d; };
  cv.addEventListener('pointerdown', ev=>{ ev.preventDefault(); const { b, d } = waveView(); if(!b) return; cv.setPointerCapture(ev.pointerId);
    const e = envOf(pat, selRow, b) || { fin:0, fo:Math.min(b.duration, d), end:Math.min(b.duration, d) }; pat.env[selRow] = e;
    const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, X = t => 10 + (r.width - 20)*t/d;
    const cand = [['fin', e.fin, 10], ['fo', e.fo, 10], ['end', e.end, r.height - 10]]; let best = null, bd = 1e9;
    cand.forEach(([k, t, y])=>{ const dd = Math.abs(px - X(t)) + Math.abs(py - y)*0.35; if(dd < bd){ bd = dd; best = k; } });
    wdrag = best; move(ev); });
  const move = ev => { if(!wdrag) return; const { b } = waveView(); const e = pat.env[selRow]; let t = tOf(ev);
    if(wdrag === 'fin') e.fin = clamp(t, 0, e.fo); else if(wdrag === 'fo') e.fo = clamp(t, e.fin, e.end); else { e.end = clamp(t, 0.01, b.duration); if(e.fo > e.end) e.fo = e.end; if(e.fin > e.fo) e.fin = e.fo; }
    drawWave(); };
  cv.addEventListener('pointermove', move);
  const end = ()=>{ if(!wdrag) return; wdrag = null; changed(); hear(selRow); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}

/* ---------------- drawn sidechain (dots, FL-style) over the picture of the kick/snare that triggers it ---------------- */
let drag = null;
function shapeGeom(cv){ const r = cv.getBoundingClientRect(); return { w:r.width, h:r.height, pad:10, r }; }
function trigPicture(){   /* what sound starts this shape: { buf, t0, secPerBeat } */
  const tr = sidechainTrigger, bs = 60/bpm;
  if(!tr || tr.sample.folder === 'STEPS' || !tr.sample.buffer){ const b = rowBuf[scTab]; return b ? { buf:b, t0:0, spb:bs, env:envOf(pat, scTab, b) } : null; }
  const s = tr.sample, H = (s.hits||[]).find(x=>x.y === scTab); if(!H) return null; return { buf:s.buffer, t0:H.t, spb:s.buffer.duration/loopBeats(s) };
}
function duckedPic(){   /* the loudest DUCKED loop (your bass), from a bar start, so you see what the shape does to it */
  const tr = sidechainTrigger; let best = null, bl = -1; channels.forEach(ch=>{ if(!ch.scDuck || ch === tr || !ch.sample.buffer) return; const e = ch.sample.env; let m = 0; if(e) for(let i=0;i<e.data.length;i+=7) m += e.data[i]; if(m > bl){ bl = m; best = ch; } });
  if(!best) return null; const s = best.sample; return { buf:s.buffer, t0:0, spb:s.buffer.duration/loopBeats(s), name:s.displayName || s.name }; }
function autoShape(){   /* AUTO = the duck follows the kick: as long as it rings, as deep as it's loud */
  const pic = trigPicture(), H = hits(), sh = H[scTab]; if(!pic){ setStatus('no ' + (scTab === 'k' ? 'kick' : 'snare') + ' to follow yet'); return; }
  const b = pic.buf, sr = b.sampleRate, d = b.getChannelData(0), t0 = pic.t0, cut = pic.env ? pic.env.end : b.duration - t0, win = Math.floor(sr*0.01);
  const env = t => { const a = Math.floor((t0 + t)*sr); let m = 0; for(let j=a; j<Math.min(d.length, a + win); j++){ const v = d[j] < 0 ? -d[j] : d[j]; if(v > m) m = v; } return m; };
  let pk = 0; for(let t=0; t<0.05; t+=0.005) pk = Math.max(pk, env(t)); if(pk <= 0){ setStatus('that sound is silent'); return; }
  let ring = Math.min(cut, 2*pic.spb*2); for(let t=0.02; t<ring; t+=0.005){ if(env(t) < pk*0.08){ ring = t; break; } }
  const beats = ring/pic.spb, LENS = [0.25, 0.5, 1, 2]; sh.len = LENS.find(v=>v >= beats*1.1) || 2;
  const span = sh.len*pic.spb, pts = [[0, 1]]; let last = 1;
  for(let i=1;i<8;i++){ const x = i/8, t = x*span; let v = t >= ring ? 0 : Math.min(1, Math.pow(env(t)/pk, 0.6)*1.05); if(v > last) v = last; last = v; pts.push([x, +v.toFixed(3)]); }
  pts.push([1, 0]); sh.pts = pts.filter((q, i, a)=> i === 0 || i === a.length - 1 || Math.abs(q[1] - a[i-1][1]) > 0.02); sh.on = true; if(!(sh.depth > 0.05)) sh.depth = 1;
  markDirty(); commit(); paint(); drawShape(); setStatus('AUTO: the duck follows the ' + (scTab === 'k' ? 'kick' : 'snare')); }
function drawShape(){
  const cv = $('stpShape'); if(!cv || !zone.classList.contains('on') || panel !== 'sc') return; const cx = cv.getContext('2d'); const s = fitCanvas(cv, cx); if(!s) return;
  const { w, h } = s, pad = 10, gw = w - pad*2, gh = h - pad*2, sh = hits()[scTab], { green, mono } = css();
  cx.clearRect(0, 0, w, h);
  const pic = trigPicture(); if(pic){ const t1 = pic.t0 + sh.len*pic.spb; wavePath(cx, pic.buf, pad, gw, pad, gh, pic.t0, Math.min(t1, pic.buf.duration), 'rgba(242,237,226,.16)'); if(pic.env && pic.env.end < sh.len*pic.spb){ const xc = pad + gw*pic.env.end/(sh.len*pic.spb); cx.fillStyle = 'rgba(6,5,4,.6)'; cx.fillRect(xc, pad, pad + gw - xc, gh); } }
  const dk = duckedPic(); if(dk){ const n = Math.max(1, Math.floor(gw)), d = dk.buf.getChannelData(0), sr = dk.buf.sampleRate, span = sh.len*dk.spb, mid = pad + gh/2;
    for(let i=0;i<n;i++){ const t0 = dk.t0 + span*i/n, t1 = dk.t0 + span*(i+1)/n; let m = 0; for(let j=Math.floor(t0*sr); j<Math.floor(t1*sr); j++){ const v = d[j % d.length]; const a = v < 0 ? -v : v; if(a > m) m = a; }
      const x = i/n, gain = 1 - (sh.on ? shapeVal(sh.pts, x)*sh.depth : 0), hh = Math.max(0.5, m*gh*0.42);
      cx.fillStyle = 'rgba(79,209,165,.10)'; cx.fillRect(pad + i, mid - hh, 1, hh*2); cx.fillStyle = 'rgba(79,209,165,.55)'; cx.fillRect(pad + i, mid - hh*gain, 1, Math.max(0.5, hh*gain*2)); } }
  cx.strokeStyle = 'rgba(255,255,255,.07)'; cx.lineWidth = 1; const div = Math.round(sh.len/0.0625);
  for(let i=0;i<=div;i++){ const x = pad + gw*i/div; cx.globalAlpha = (i % 4 === 0) ? 1 : 0.4; cx.beginPath(); cx.moveTo(x, pad); cx.lineTo(x, pad+gh); cx.stroke(); } cx.globalAlpha = 1;
  [0, 0.5, 1].forEach(v=>{ cx.beginPath(); cx.moveTo(pad, pad + gh*v); cx.lineTo(pad+gw, pad + gh*v); cx.stroke(); });
  const X = x => pad + x*gw, Y = d => pad + d*sh.depth*gh;   /* y down = more duck */
  cx.beginPath(); cx.moveTo(X(0), pad); sh.pts.forEach(([x, d])=> cx.lineTo(X(x), Y(d))); cx.lineTo(X(1), pad); cx.closePath(); cx.fillStyle = sh.on ? 'rgba(79,209,165,.10)' : 'rgba(255,255,255,.04)'; cx.fill();
  cx.beginPath(); sh.pts.forEach(([x, d], i)=> i ? cx.lineTo(X(x), Y(d)) : cx.moveTo(X(x), Y(d))); cx.strokeStyle = sh.on ? green : '#5a554e'; cx.lineWidth = 1.6; cx.stroke();
  sh.pts.forEach(([x, d])=>{ cx.beginPath(); cx.arc(X(x), Y(d), 4.5, 0, Math.PI*2); cx.fillStyle = '#060504'; cx.fill(); cx.strokeStyle = sh.on ? green : '#8a8276'; cx.lineWidth = 1.5; cx.stroke(); });
  cx.fillStyle = '#8a8276'; cx.font = '8px ' + mono; cx.fillText((scTab === 'k' ? 'KICK' : 'SNARE') + (dk ? ' → ' + (dk.name||'').toUpperCase().slice(0, 26) + ' (green = after the duck)' : ' · DUCK a loop to see it here'), pad + 3, h - 3); cx.textAlign = 'right'; cx.fillText('VOLUME ↑', w - pad - 3, pad + 9); cx.textAlign = 'left';
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

/* ---------------- LIVE: the kick vs your ducked loop (bass), scrolling, while it plays ---------------- */
const LIVE_N = 180, liveK = new Float32Array(LIVE_N), liveB = new Float32Array(LIVE_N); let liveI = 0, liveRaf = null, liveName = '';
const tdBuf = new Float32Array(1024);
function lvl(ch){ if(!ch.analyser) return 0; ch.analyser.getFloatTimeDomainData(tdBuf); let m = 0; for(let i=0;i<tdBuf.length;i++){ const v = tdBuf[i] < 0 ? -tdBuf[i] : tdBuf[i]; if(v > m) m = v; } return Math.min(1, m); }   /* real waveform level (after the duck) */
function liveLoop(){ if(liveRaf) return; const step = ()=>{ liveRaf = null; if(!zone.classList.contains('on')) return;
    if(isRunning){ const tr = sidechainTrigger; let k = tr ? lvl(tr) : 0, bv = 0, bn = ''; channels.forEach(ch=>{ if(ch.scDuck && ch !== tr){ const v = lvl(ch); if(v >= bv){ bv = v; bn = ch.sample.displayName || ''; } } });
      liveK[liveI] = k; liveB[liveI] = bv; liveI = (liveI + 1) % LIVE_N; liveName = bn; }
    drawLive(); if(isRunning) liveRaf = requestAnimationFrame(step); else paintPlay(); };
  liveRaf = requestAnimationFrame(step); }
function drawLive(){
  const cv = $('stpLive'); if(!cv || panel !== 'sc') return; const cx = cv.getContext('2d'); const s = fitCanvas(cv, cx); if(!s) return; const { w, h } = s, { green, mono } = css(); cx.clearRect(0, 0, w, h);
  const dx = w/LIVE_N, y = v => h - 2 - v*(h - 12);
  cx.fillStyle = 'rgba(242,237,226,.22)'; for(let i=0;i<LIVE_N;i++){ const v = liveK[(liveI + i) % LIVE_N]; cx.fillRect(i*dx, y(v), Math.ceil(dx), h - 2 - y(v)); }
  cx.beginPath(); for(let i=0;i<LIVE_N;i++){ const v = liveB[(liveI + i) % LIVE_N]; i ? cx.lineTo(i*dx, y(v)) : cx.moveTo(0, y(v)); } cx.strokeStyle = green; cx.lineWidth = 1.5; cx.stroke();
  cx.font = '7.5px ' + mono; cx.fillStyle = '#c9c1b4'; cx.fillText('KICK', 4, 9); cx.fillStyle = green; cx.fillText(liveName ? liveName.toUpperCase().slice(0, 28) : (isRunning ? 'no DUCKED loop' : 'press play'), 34, 9);
}

/* ---------------- boot ---------------- */
function boot(){ build(); const b = $('stepsBtn'); if(b) b.addEventListener('click', ()=> open(false)); $('transportBtn').addEventListener('click', ()=> setTimeout(()=>{ paintPlay(); liveLoop(); }, 80)); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
STEPS.open = open; STEPS._pat = ()=>pat; STEPS._detect = detectHits; STEPS._applyPreset = applyPreset; STEPS._rowBuf = rowBuf;
})();
