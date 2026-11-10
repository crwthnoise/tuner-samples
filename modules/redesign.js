/* TUNER REDESIGN — step 1 (TNR-4729.21, 10 Nov 2026). OPT-IN: open the app with ?r=1 (stays on) · ?r=0 = back to the classic layout.
   Everything here is a layer on top of v10.52: existing buttons are MOVED (not rebuilt) so every handler keeps working. */
(()=>{
  'use strict';
  const $ = id => document.getElementById(id);
  const RD_VER = 'REDESIGN v1';
  const LS = { get:k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set:(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} } };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- CSS ---------- */
  const css = `
  /* TOP: brand + six story boxes */
  body.rd .top{ height:64px; padding:0 8px 0 12px; gap:6px; }
  body.rd .top .brand{ flex:1 1 auto; min-width:0; }
  body.rd .top .logo{ font-size:15px; letter-spacing:2.5px; white-space:nowrap; }
  body.rd .top .season{ font-size:7px; white-space:nowrap; }
  body.rd .tbtns{ display:none !important; }
  #rdTop{ display:flex; gap:5px; flex:none; align-items:center; }
  .rdbox{ --g1:#d32f2f; --g2:#ff9600; position:relative; width:42px; height:50px; flex:none; border:0; padding:2px; border-radius:9px; cursor:pointer; background:linear-gradient(160deg,var(--g1),var(--g2)); box-shadow:0 0 9px color-mix(in srgb,var(--g1) 55%,transparent), 0 0 2px color-mix(in srgb,var(--g2) 70%,transparent); overflow:hidden; touch-action:manipulation; opacity:0; transform:translateY(-8px) scale(.92); animation:rdIn .42s cubic-bezier(.2,.8,.2,1) forwards; animation-delay:calc(var(--i)*70ms); }
  .rdbox::before{ content:''; position:absolute; inset:2px; border-radius:7px; background:#070605; }
  .rdbox > *{ position:relative; z-index:1; }
  .rdbox.lcd{ width:42px; height:50px; background:linear-gradient(160deg,var(--g1),var(--g2)); border:0; }
  .rdbox.lcd::after{ display:none; }
  .rdbox small, .rdbox.lcd small{ display:block; font:700 6.5px var(--ui); letter-spacing:.7px; color:#f2ede2; background:none; padding:0; margin:0 0 4px; }
  .rdbox .rdi{ display:block; width:22px; height:16px; margin:0 auto; fill:none; stroke:var(--g2); stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; filter:drop-shadow(0 0 3px var(--g2)); }
  .rdbox.lcd b{ font:700 15px var(--mono); color:#4fd1a5; text-shadow:0 0 6px #4fd1a5; }
  .rdbox .rdin{ position:absolute; inset:2px; border-radius:7px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#070605; }
  .rdbox.lcd{ display:block; }
  .rdbox.lcd .rdin{ z-index:1; }
  .rdbox.on{ box-shadow:0 0 14px var(--g1), 0 0 4px var(--g2); }
  .rdbox:active{ transform:scale(.94); }
  .rdbox.burst::after{ content:''; position:absolute; inset:-60%; background:conic-gradient(from 0deg,transparent 0 70%,#fff8 85%,transparent 100%); animation:rdSpin .7s ease-out 1; z-index:0; display:block !important; mix-blend-mode:screen; }
  @keyframes rdIn{ to{ opacity:1; transform:none; } }
  @keyframes rdSpin{ from{ transform:rotate(0); opacity:1; } to{ transform:rotate(300deg); opacity:0; } }
  .rdbox.b-beats{ --g1:#d32f2f; --g2:#ff9600; } .rdbox.b-sounds{ --g1:#4fd1a5; --g2:#2f8cff; } .rdbox.b-friends{ --g1:#4fd1a5; --g2:#b6f27a; }
  .rdbox.b-songs{ --g1:#ff9600; --g2:#f2ede2; } .rdbox.b-key{ --g1:#f2ede2; --g2:#9c9284; } .rdbox.b-bpm{ --g1:#9c9284; --g2:#f2ede2; }
  body.rd .key-pop, body.rd .bpm-pop{ top:66px; }
  /* NEWEST SOUNDS feed — takes over the playlist */
  #rdFeed{ position:absolute; inset:0; z-index:12; display:none; flex-direction:column; background:linear-gradient(#070605,#0b0a08); border-radius:6px; }
  #rdFeed.on{ display:flex; animation:rdFeedIn .26s ease-out; }
  @keyframes rdFeedIn{ from{ opacity:0; transform:translateY(14px); } to{ opacity:1; transform:none; } }
  #rdFeed .fh{ flex:none; display:flex; align-items:center; gap:6px; padding:8px 8px 6px; }
  #rdFeed .fh .ft{ font:700 10px var(--ui); letter-spacing:2px; color:#f2ede2; margin-right:auto; }
  #rdFeed .fh .ft em{ font-style:normal; color:var(--rdc,#4fd1a5); }
  #rdFeed .fch{ border:1px solid #3a3024; background:#0b0907; color:#f2ede2; font:700 8px var(--mono); letter-spacing:.08em; padding:6px 8px; border-radius:12px; cursor:pointer; }
  #rdFeed .fch.go{ border-color:var(--rdc,#4fd1a5); color:var(--rdc,#4fd1a5); }
  #rdFeed .fx{ border:1px solid #3a3024; background:#0b0907; color:#f2ede2; width:30px; height:28px; border-radius:6px; font:700 13px var(--mono); cursor:pointer; padding:0; }
  #rdFeedList{ flex:1; min-height:0; overflow-y:auto; scroll-snap-type:y proximity; padding:0 8px 8px; display:flex; flex-direction:column; gap:8px; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; touch-action:pan-y; }
  .rdcard{ position:relative; flex:none; scroll-snap-align:start; min-height:132px; border-radius:12px; padding:9px 10px; background:linear-gradient(#14110e,#0c0a08); border:1px solid #2a2724; display:flex; flex-direction:column; cursor:pointer; user-select:none; -webkit-user-select:none; }
  .rdcard.playing{ border-color:var(--rdc,#4fd1a5); box-shadow:0 0 12px color-mix(in srgb,var(--rdc,#4fd1a5) 40%,transparent); }
  .rdcard .ch{ display:flex; align-items:baseline; gap:8px; }
  .rdcard .cn{ font:700 11px var(--mono); color:#f2ede2; letter-spacing:.05em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
  .rdcard .cm{ font:500 8px var(--mono); color:#8a8176; letter-spacing:.08em; white-space:nowrap; }
  .rdcard .cp{ font:500 7.5px var(--mono); color:var(--rdc,#4fd1a5); letter-spacing:.12em; margin-bottom:3px; }
  .rdcard canvas{ flex:1; min-height:64px; width:100%; display:block; margin-top:6px; }
  .rdcard .cadd{ position:absolute; right:8px; bottom:8px; width:40px; height:40px; border-radius:50%; border:1.5px solid var(--rdc,#4fd1a5); background:#0b0907cc; color:var(--rdc,#4fd1a5); font:500 22px var(--mono); line-height:1; padding:0; cursor:pointer; box-shadow:0 0 9px color-mix(in srgb,var(--rdc,#4fd1a5) 40%,transparent); }
  .rdcard .cadd:active{ transform:scale(.92); }
  body.rd.rdfeed .tlctl, body.rd.rdfeed #tlPlus{ display:none !important; }
  /* timeline mini undo */
  #rdUndo{ font-size:13px; }
  /* BOTTOM: one row — settings · SAVE · REC · PACKS · PLAY */
  body.rd .dock{ height:92px; padding:0 12px 0 10px; gap:8px; justify-content:space-between; }
  body.rd .dgrid{ display:none; }
  #rdDock{ display:flex; flex:1; align-items:center; justify-content:space-between; gap:7px; min-width:0; }
  body.rd #rdDock .btn{ width:56px; height:52px; flex:none; }
  body.rd .dock .play{ width:84px; height:84px; flex:none; }
  body.rd .dock .play svg{ transform:scale(.8); }
  #rdHidden{ display:none !important; }
  /* settings quick row */
  #rdQuick{ display:flex; gap:6px; flex-wrap:wrap; margin:4px 0 10px; }
  #rdQuick button{ flex:1 1 30%; }
  #rdQuick .tg.on{ border-color:#4fd1a5; color:#4fd1a5; }
  /* RACK drawer */
  #rackZone{ overflow:hidden; transition:height .3s cubic-bezier(.3,.9,.3,1); }
  #rdHandle{ position:relative; display:flex; align-items:center; justify-content:center; gap:8px; height:22px; margin:-6px -5px 2px; cursor:pointer; touch-action:manipulation; font:700 7px var(--ui); letter-spacing:2px; color:#8a8176; border-bottom:1px solid #1a1816; }
  #rdHandle i{ display:block; width:34px; height:4px; border-radius:2px; background:#3a3024; }
  #rdHandle b{ font:700 9px var(--mono); color:#f2ede2; transition:transform .3s; }
  #rackZone.rdc #rdHandle b{ transform:rotate(180deg); }
  #rackZone.rdc{ padding-bottom:0; }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.body.classList.add('rd');

  /* ---------- TOP: story boxes ---------- */
  const top = $('topZone'), tb = top.querySelector('.tbtns');
  const row = document.createElement('div'); row.id = 'rdTop'; top.insertBefore(row, tb);
  const ICON = {
    beats:'<svg class="rdi" viewBox="0 0 22 16"><rect x="1" y="3" width="4" height="4"/><rect x="6.5" y="3" width="4" height="4"/><rect x="12" y="9" width="4" height="4"/><rect x="17" y="3" width="4" height="4"/><rect x="1" y="9" width="4" height="4"/></svg>',
    sounds:'<svg class="rdi" viewBox="0 0 22 16"><path d="M1 8h3l2-6 3 12 3-9 2 5 2-2h5"/></svg>',
    friends:'<svg class="rdi" viewBox="0 0 22 16"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/><circle cx="16.5" cy="6" r="2.2"/><path d="M15.5 10.2c3 0 5 1.6 5 4"/></svg>',
    songs:'<svg class="rdi" viewBox="0 0 22 16"><path d="M8 12V3l10-2v9"/><circle cx="5.5" cy="12.5" r="2.5"/><circle cx="15.5" cy="10.5" r="2.5"/></svg>'
  };
  const mk = (cls, label, inner, i) => { const b = document.createElement('button'); b.className = 'rdbox ' + cls; b.style.setProperty('--i', i); b.dataset.k = label; b.setAttribute('aria-label', label.toLowerCase()); b.innerHTML = '<span class="rdin"><small>' + label + '</small>' + inner + '</span>'; return b; };
  const bBeats = mk('b-beats', 'BEATS', ICON.beats, 0), bSounds = mk('b-sounds', 'SOUNDS', ICON.sounds, 1), bFriends = mk('b-friends', 'FRIENDS', ICON.friends, 2), bSongs = mk('b-songs', 'SONGS', ICON.songs, 3);
  row.append(bBeats, bSounds, bFriends, bSongs);
  /* KEY + BPM: move the REAL buttons (their popups + handlers stay) and dress them as boxes */
  [['keyBtn','b-key',4],['bpmBtn','b-bpm',5]].forEach(([id, cls, i])=>{
    const b = $(id); if(!b) return; const small = b.querySelector('small'), val = b.querySelector('b');
    b.classList.add('rdbox', cls); b.style.setProperty('--i', i);
    const inn = document.createElement('span'); inn.className = 'rdin'; inn.append(small, val); b.append(inn); row.appendChild(b);
  });

  /* ---------- NEWEST SOUNDS feed ---------- */
  const tlz = $('tlZone');
  const feed = document.createElement('div'); feed.id = 'rdFeed';
  feed.innerHTML = '<div class="fh"><span class="ft">NEWEST <em id="rdFeedKind">SOUNDS</em></span><span id="rdFeedBtns"></span><button class="fx" id="rdFeedX" data-k="FEED X" aria-label="close">✕</button></div><div id="rdFeedList"></div>';
  tlz.appendChild(feed);
  const list = $('rdFeedList'), fbtns = $('rdFeedBtns');
  let feedKind = null, feedRaf = 0;
  const isDrum = s => { try{ return typeOf(s) === 'DRUMS'; }catch(e){ return false; } };
  function ordered(kind){
    const season = (($('seasonLine')||{}).textContent || '').split(' ')[0].toUpperCase();
    const all = samples.filter(s=>!s.failed && !s.hidden);
    const base = all.slice().reverse();                       /* newest registered first */
    const rank = s => (s.folder === 'MADE' ? 0 : (season && String(s.folder).toUpperCase() === season ? 1 : 2));
    const sorted = base.map((s,i)=>({s,i})).sort((a,b)=> rank(a.s) - rank(b.s) || a.i - b.i).map(x=>x.s);
    return sorted.filter(s => kind === 'BEATS' ? isDrum(s) : !isDrum(s));
  }
  function fmt(s){ const p = []; if(s.bpm) p.push(s.bpm + ' BPM'); if(s.key) p.push(s.key); return p.join(' · '); }
  function cardEl(s){
    const c = document.createElement('div'); c.className = 'rdcard'; c.dataset.id = s.id; c.dataset.k = 'FEED CARD';
    const season = (($('seasonLine')||{}).textContent || '').split(' ')[0].toUpperCase();
    const tag = s.folder === 'MADE' ? 'MADE BY YOU' : (season && String(s.folder).toUpperCase() === season ? season + ' · NEW' : String(s.folder || '').toUpperCase());
    c.innerHTML = '<div class="cp">' + tag + '</div><div class="ch"><span class="cn"></span><span class="cm"></span></div><canvas></canvas><button class="cadd" data-k="FEED ADD" aria-label="add to song">+</button>';
    c.querySelector('.cn').textContent = s.displayName || s.name; c.querySelector('.cm').textContent = fmt(s);
    c.addEventListener('click', e=>{
      if(e.target.closest('.cadd')){ e.stopPropagation(); if(typeof addChannelFromSample === 'function'){ addChannelFromSample(s); setStatus((s.displayName||s.name) + ' added'); try{ navigator.vibrate && navigator.vibrate(10); }catch(_){} } return; }
      if(previewId === s.id){ stopPreview(); markPlaying(); } else { startPreview(s); markPlaying(s.id); }
    });
    return c;
  }
  function paint(){ list.querySelectorAll('.rdcard').forEach(c=>{ const s = samples.find(x=>x.id === c.dataset.id); if(s) drawRow(s, c.querySelector('canvas')); }); }
  function markPlaying(id){ list.querySelectorAll('.rdcard').forEach(c=> c.classList.toggle('playing', c.dataset.id === id)); }
  function loopPaint(){ if(!feed.classList.contains('on')) return; const pid = (typeof previewId !== 'undefined') ? previewId : null; const pc = pid && list.querySelector('.rdcard[data-id="' + pid + '"]'); if(pc){ const s = samples.find(x=>x.id === pid); if(s) drawRow(s, pc.querySelector('canvas')); } else markPlaying(null); feedRaf = requestAnimationFrame(loopPaint); }
  function openFeed(kind){
    feedKind = kind; const sounds = kind === 'SOUNDS';
    feed.style.setProperty('--rdc', sounds ? '#4fd1a5' : '#ff9600');
    $('rdFeedKind').textContent = kind; fbtns.innerHTML = '';
    const add = (t, fn, go) => { const b = document.createElement('button'); b.className = 'fch' + (go ? ' go' : ''); b.textContent = t; b.dataset.k = 'FEED ' + t; b.addEventListener('click', ()=>{ closeFeed(); fn(); }); fbtns.appendChild(b); };
    if(sounds){ add('SING', ()=>$('singBtn').click()); add('PAD', ()=>$('padBtn').click()); add('MAKE', ()=>$('makeBtn').click()); }
    else { add('STEPS', ()=>$('stepsBtn').click(), true); }
    list.innerHTML = ''; ordered(kind).slice(0, 60).forEach(s => list.appendChild(cardEl(s)));
    if(!list.children.length) list.innerHTML = '<div style="color:#8a8176;font:500 9px var(--mono);padding:20px;text-align:center">no ' + kind.toLowerCase() + ' yet — tap PACKS</div>';
    feed.classList.add('on'); document.body.classList.add('rdfeed'); list.scrollTop = 0;
    bBeats.classList.toggle('on', kind === 'BEATS'); bSounds.classList.toggle('on', sounds);
    requestAnimationFrame(()=>{ paint(); cancelAnimationFrame(feedRaf); loopPaint(); });
  }
  function closeFeed(){ if(!feed.classList.contains('on')) return; feed.classList.remove('on'); document.body.classList.remove('rdfeed'); cancelAnimationFrame(feedRaf); feedKind = null; bBeats.classList.remove('on'); bSounds.classList.remove('on'); try{ stopPreview(); }catch(e){} }
  $('rdFeedX').addEventListener('click', closeFeed);
  const burst = b => { if(reduce) return; b.classList.remove('burst'); void b.offsetWidth; b.classList.add('burst'); setTimeout(()=>b.classList.remove('burst'), 750); };
  const toggleFeed = (kind, b) => { burst(b); if(feedKind === kind) closeFeed(); else openFeed(kind); };
  bBeats.addEventListener('click', ()=> toggleFeed('BEATS', bBeats));
  bSounds.addEventListener('click', ()=> toggleFeed('SOUNDS', bSounds));
  bFriends.addEventListener('click', ()=>{ burst(bFriends); setStatus('FRIENDS · share songs, collab · coming soon'); });
  bSongs.addEventListener('click', ()=>{ burst(bSongs); setStatus('SONGS · your FL library lives here · coming soon'); });
  [$('keyBtn'), $('bpmBtn')].forEach(b => b && b.addEventListener('click', ()=> burst(b)));
  document.addEventListener('pointerdown', e=>{ if(e.target.closest('#rdFeed') || e.target.closest('#rdTop')) return; }, true);
  /* opening anything else (sheets, STEPS, PACKS) closes the feed — a way back is always there */
  ['packsBtn','setBtn'].forEach(id => $(id) && $(id).addEventListener('click', closeFeed, true));
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeFeed(); });

  /* ---------- BOTTOM: one row ---------- */
  const dock = $('dock'), dg = dock.querySelector('.dgrid'), play = $('transportBtn');
  const rowD = document.createElement('div'); rowD.id = 'rdDock'; dock.insertBefore(rowD, play);
  ['setBtn','saveBtn','recBtn','packsBtn'].forEach(id => rowD.appendChild($(id)));
  const hid = document.createElement('div'); hid.id = 'rdHidden'; while(dg.firstChild) hid.appendChild(dg.firstChild); dock.appendChild(hid);

  /* ---------- SETTINGS: EXPORT · PALETTE · +LOOP · UNDO · SLIDERS · CLASSIC ---------- */
  const set = $('setSheet'), head = set.querySelector('.sh-head');
  const q = document.createElement('div'); q.id = 'rdQuick';
  q.innerHTML = '<button class="btn-ghost" data-k="SET EXPORT" id="rdExp">EXPORT</button><button class="btn-ghost" data-k="SET PALETTE" id="rdPal">PALETTE</button><button class="btn-ghost" data-k="SET +LOOP" id="rdAddL">+ OWN LOOP</button><button class="btn-ghost tg" data-k="SET SLIDERS" id="rdSlTog">SLIDERS · HIDE ON OPEN</button><button class="btn-ghost" data-k="SET CLASSIC" id="rdClassic">BACK TO CLASSIC</button>';
  head.after(q);
  $('rdExp').addEventListener('click', ()=>{ const b = $('exportBtn'); if(b.disabled){ setStatus('add a loop first, then EXPORT'); return; } closeSheet('setSheet'); b.click(); });
  $('rdPal').addEventListener('click', ()=>{ closeSheet('setSheet'); $('custBtn').click(); });
  $('rdAddL').addEventListener('click', ()=>{ closeSheet('setSheet'); $('addLoopBtn').click(); });
  $('rdClassic').addEventListener('click', ()=>{ LS.set('tuner_rd','0'); location.href = location.pathname + '?r=0'; });
  const vb = $('verBadge'); if(vb){ new MutationObserver(()=>{ if(!/REDESIGN/.test(vb.textContent)) vb.textContent += ' · ' + RD_VER; }).observe(vb, { childList:true }); if(!/REDESIGN/.test(vb.textContent)) vb.textContent += ' · ' + RD_VER; }

  /* ---------- TIMELINE: small undo + double-tap undo ---------- */
  const tctl = tlz.querySelector('.tlctl'), ub = document.createElement('button'); ub.id = 'rdUndo'; ub.dataset.k = 'TL UNDO'; ub.title = 'undo'; ub.textContent = '↶'; ub.setAttribute('aria-label','undo');
  if(tctl){ const cls = $('tlStart').className; ub.className = cls; tctl.insertBefore(ub, $('tlStart')); }
  ub.addEventListener('click', ()=>{ try{ undo(); }catch(e){} });
  /* triple-tap clear is replaced by double-tap undo (clear stays reachable through the song's own options) */
  window.clearBoard = function(){};
  let dt = { t:0, x:0, y:0, moved:false, down:null };
  tl.addEventListener('pointerdown', e=>{ dt.down = { x:e.offsetX, y:e.offsetY }; }, true);
  tl.addEventListener('pointerup', e=>{
    const d = dt.down; dt.down = null; if(!d) return; if(Math.abs(e.offsetX - d.x) + Math.abs(e.offsetY - d.y) > 10) return;
    let ht; try{ ht = hitTest(e.offsetX, e.offsetY); }catch(_){ return; }
    if(!ht || (ht.kind !== 'empty' && ht.kind !== 'row')) { dt.t = 0; return; }       /* only EMPTY space — a waveform keeps its own taps */
    const now = performance.now();
    if(now - dt.t < 380 && Math.abs(e.offsetX - dt.x) < 40 && Math.abs(e.offsetY - dt.y) < 40){ dt.t = 0; try{ undo(); try{ navigator.vibrate && navigator.vibrate(12); }catch(_){} }catch(_){} }
    else { dt.t = now; dt.x = e.offsetX; dt.y = e.offsetY; }
  });

  /* ---------- RACK drawer: slides down/up · remembers · hide-on-open ---------- */
  const rz = $('rackZone'), h = document.createElement('div'); h.id = 'rdHandle'; h.dataset.k = 'RACK HANDLE'; h.innerHTML = '<i></i><span>SLIDERS</span><b>▾</b><i></i>'; rz.insertBefore(h, rz.firstChild);
  const HH = 22;
  const sliderPref = () => LS.get('tuner_rd_hide') === '1';
  const syncTog = () => $('rdSlTog').classList.toggle('on', sliderPref());
  function fullH(){ const prev = rz.style.height; rz.style.height = 'auto'; const v = rz.offsetHeight; rz.style.height = prev; return v; }
  function setRack(open, instant){
    const hOpen = fullH(), hClosed = HH + 8 + 4 /* borders */;
    if(instant){ rz.style.transition = 'none'; }
    rz.style.height = (open ? hOpen : hClosed) + 'px'; rz.classList.toggle('rdc', !open);
    if(open){ setTimeout(()=>{ rz.style.height = ''; }, 340); }
    if(instant){ void rz.offsetHeight; rz.style.transition = ''; }
    LS.set('tuner_rd_open', open ? '1' : '0');
    setTimeout(()=>{ try{ fitTL(); drawAll(); }catch(e){} }, 340);
  }
  h.addEventListener('click', ()=> setRack(rz.classList.contains('rdc')));
  let hy = null;                                                                           /* swipe on the handle too */
  h.addEventListener('pointerdown', e=>{ hy = e.clientY; });
  h.addEventListener('pointerup', e=>{ if(hy == null) return; const dy = e.clientY - hy; hy = null; if(Math.abs(dy) > 16){ e.stopPropagation(); setRack(dy < 0); } });
  $('rdSlTog').addEventListener('click', ()=>{ LS.set('tuner_rd_hide', sliderPref() ? '0' : '1'); syncTog(); setStatus(sliderPref() ? 'sliders start hidden' : 'sliders start open'); });
  syncTog();
  /* taller sliders: stretch the rack a bit more than the classic ratio (scaleY only) */
  const TALL = 1.22;
  const baseLayout = window.layoutRack;
  if(typeof baseLayout === 'function'){
    window.layoutRack = function(){ baseLayout.apply(this, arguments); const box = $('rack'); if(!box) return; const H = parseFloat(box.style.height); if(!H) return; const H2 = Math.round(H * TALL); box.style.height = H2 + 'px'; box.style.setProperty('--rsy', (parseFloat(box.style.getPropertyValue('--rs')) * TALL).toFixed(4)); box.querySelectorAll('.rk-m').forEach(w => { w.style.height = H2 + 'px'; }); };
    const st2 = document.createElement('style'); st2.textContent = '.rack .rk-m > .mod{ transform:scale(var(--rs), var(--rsy,var(--rs))) !important; }'; document.head.appendChild(st2);
    try{ window.layoutRack(); }catch(e){}
  }
  /* start state: remembered, or hidden if the user chose HIDE ON OPEN */
  requestAnimationFrame(()=> requestAnimationFrame(()=>{ const wantOpen = sliderPref() ? false : (LS.get('tuner_rd_open') !== '0'); if(!wantOpen) setRack(false, true); }));

  /* a ✕/way back always exists: Escape, ✕, tapping the same box again, or opening PACKS/SETTINGS */
  window.RD = { openFeed, closeFeed, setRack, version: RD_VER };
})();
