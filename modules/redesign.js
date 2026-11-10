/* TUNER REDESIGN — v2 (TNR-4729.21, 10 Nov 2026). OPT-IN: ?r=1 (stays on) · ?r=0 = classic.
   v2 = hardware look (top keys, PLAY, dock) · wider sliders + swipe pages · drawer hides fully · landing FEED (TikTok-style)
        · PACKS wears the feed look · tap a selected clip again = options. Existing buttons are MOVED, never rebuilt. */
(()=>{
  'use strict';
  const $ = id => document.getElementById(id);
  const RD_VER = 'REDESIGN v3';
  const LS = { get:k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set:(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} } };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__RD_TAP = true;                                   /* index.html: tap a selected clip again = options */

  /* ---------- CSS ---------- */
  const KEY = 'background:linear-gradient(#272320,#121010);border:1px solid #000;box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 3px 0 #050403,0 5px 9px #000;';
  const css = `
  /* TOP: brand + six hardware keys (same family as the dock) */
  body.rd .top{ height:62px; padding:0 22px 0 14px; gap:8px; }
  body.rd .top .brand{ flex:1 1 auto; min-width:0; cursor:pointer; }
  body.rd .top .logo{ font-size:13px; letter-spacing:2px; white-space:nowrap; }
  body.rd .top .season{ font-size:6.5px; white-space:nowrap; }
  body.rd .tbtns{ display:none !important; }
  #rdTop{ display:flex; gap:6px; flex:none; align-items:center; }
  body.rd .rdbox{ --g1:#d32f2f; --g2:#ff9600; position:relative; width:38px !important; height:42px !important; flex:none; padding:0 !important; border-radius:7px !important; cursor:pointer; ${KEY} overflow:hidden; touch-action:manipulation; animation:rdIn .4s cubic-bezier(.2,.8,.2,1) backwards; animation-delay:calc(var(--i)*60ms); display:block; transition:transform .06s, box-shadow .06s; }
  body.rd .rdbox::after{ display:none !important; }
  body.rd .rdbox::before{ content:''; position:absolute; left:9px; right:9px; bottom:4px; height:2px; border-radius:1px; background:var(--g1); box-shadow:0 0 5px var(--g1); opacity:.85; z-index:2; pointer-events:none; }
  body.rd .rdbox:active{ transform:translateY(2px); box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 1px 0 #050403,0 2px 4px #000; }
  body.rd .rdbox.on::before{ height:3px; box-shadow:0 0 9px var(--g1),0 0 3px var(--g2); opacity:1; }
  body.rd .rdbox .rdin{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding-bottom:3px; background:none; }
  body.rd .rdbox small{ display:block; font:700 6px var(--ui) !important; letter-spacing:.6px; color:#f2ede2 !important; background:none !important; padding:0 !important; margin:0 0 3px !important; }
  body.rd .rdbox .rdi{ display:block; width:19px; height:13px; fill:none; stroke:var(--g2); stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; filter:drop-shadow(0 0 2px var(--g2)); }
  body.rd .rdbox b{ font:700 14px var(--mono) !important; color:#4fd1a5 !important; text-shadow:0 0 6px #4fd1a5 !important; line-height:1; }
  body.rd .rdbox.burst{ box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 0 12px var(--g1),0 3px 0 #050403,0 5px 9px #000; }
  @keyframes rdIn{ from{ opacity:0; transform:translateY(-8px) scale(.92); } }
  body.rd .rdbox.b-beats{ --g1:#d32f2f; --g2:#ff9600; } body.rd .rdbox.b-sounds{ --g1:#4fd1a5; --g2:#4fd1a5; } body.rd .rdbox.b-friends{ --g1:#8ee06a; --g2:#8ee06a; }
  body.rd .rdbox.b-songs{ --g1:#ff9600; --g2:#f2ede2; } body.rd .rdbox.b-key{ --g1:#9c9284; --g2:#f2ede2; } body.rd .rdbox.b-bpm{ --g1:#9c9284; --g2:#f2ede2; }
  body.rd .key-pop, body.rd .bpm-pop{ top:64px; }
  /* SOUNDS mini menu (until the new SOUNDS space exists) */
  #rdSnd{ position:absolute; right:22px; top:60px; z-index:26; display:none; gap:6px; padding:7px; background:#110f0d; border:1px solid #2a2724; border-radius:10px; box-shadow:0 10px 24px #000; }
  #rdSnd.on{ display:flex; }
  #rdSnd button{ ${KEY} border-radius:7px; width:54px; height:40px; color:#f2ede2; font:700 9px var(--mono); letter-spacing:.06em; cursor:pointer; }
  #rdSnd button:active{ transform:translateY(2px); }
  /* FEED (landing + BEATS/SOUNDS lists) */
  #rdFeed{ position:absolute; inset:0; z-index:12; display:none; flex-direction:column; background:linear-gradient(#070605,#0b0a08); border-radius:6px; }
  #rdFeed.on{ display:flex; animation:rdFeedIn .26s ease-out; }
  @keyframes rdFeedIn{ from{ opacity:0; transform:translateY(14px); } to{ opacity:1; transform:none; } }
  #rdFeed .fh{ flex:none; display:flex; align-items:center; gap:6px; padding:8px 8px 6px; }
  #rdFeed .fh .ft{ font:700 10px var(--ui); letter-spacing:2px; color:#f2ede2; margin-right:auto; }
  #rdFeed .fh .ft em{ font-style:normal; color:var(--rdc,#4fd1a5); }
  #rdFeed .fch{ ${KEY} color:#f2ede2; font:700 8px var(--mono); letter-spacing:.08em; padding:0 10px; height:30px; border-radius:7px; cursor:pointer; }
  #rdFeed .fx{ ${KEY} color:#f2ede2; min-width:46px; height:30px; border-radius:7px; font:700 8px var(--mono); letter-spacing:.08em; cursor:pointer; padding:0 8px; }
  #rdFeedList{ flex:1; min-height:0; overflow-y:auto; scroll-snap-type:y mandatory; padding:0 8px 8px; display:flex; flex-direction:column; gap:8px; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; touch-action:pan-y; }
  .rdcard{ position:relative; flex:none; scroll-snap-align:start; scroll-snap-stop:always; min-height:132px; border-radius:12px; padding:9px 10px; background:linear-gradient(#14110e,#0c0a08); border:1px solid #2a2724; display:flex; flex-direction:column; cursor:pointer; user-select:none; -webkit-user-select:none; overflow:hidden; }
  #rdFeed.home .rdcard{ height:100%; min-height:0; padding:12px 12px 14px; }
  .rdcard .bg{ position:absolute; inset:-20px; width:calc(100% + 40px); height:calc(100% + 40px); object-fit:cover; filter:blur(22px) brightness(.45) saturate(1.2); opacity:.55; pointer-events:none; }
  .rdcard > *:not(.bg){ position:relative; }
  .rdcard.playing{ border-color:var(--rdc,#4fd1a5); box-shadow:0 0 12px color-mix(in srgb,var(--rdc,#4fd1a5) 40%,transparent); }
  .rdcard .top2{ display:flex; align-items:center; gap:10px; }
  .rdcard .art{ width:46px; height:46px; border-radius:9px; object-fit:cover; flex:none; background:#000; border:1px solid #000; }
  .rdcard .ttl{ min-width:0; flex:1; }
  .rdcard .cp{ font:500 7.5px var(--mono); color:var(--rdc,#4fd1a5); letter-spacing:.12em; margin-bottom:3px; }
  .rdcard .cn{ font:700 11px var(--mono); color:#f2ede2; letter-spacing:.05em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rdcard .cm{ font:500 8px var(--mono); color:#c9c1b4; letter-spacing:.08em; margin-top:2px; }
  .rdcard canvas{ flex:1; min-height:64px; width:100%; display:block; margin-top:8px; }
  .rdcard .cadd{ position:absolute; right:10px; bottom:10px; width:46px; height:46px; border-radius:50%; ${KEY} color:#f2ede2; font:500 24px var(--mono); line-height:1; padding:0; cursor:pointer; }
  .rdcard .cadd:active{ transform:translateY(2px); }
  .rdcard .hint{ position:absolute; left:12px; bottom:14px; font:500 7.5px var(--mono); color:#c9c1b4; letter-spacing:.14em; }
  body.rd.rdfeed .tlctl, body.rd.rdfeed #tlPlus{ display:none !important; }
  #rdUndo{ font-size:13px; }
  /* BOTTOM: one row, equal gaps, equal distance from the screws */
  body.rd .dock{ height:64px; padding:0 26px !important; gap:16px; justify-content:center; }
  body.rd .dgrid{ display:none; }
  #rdDock{ display:flex; flex:none; align-items:center; gap:16px; }
  body.rd #rdDock .btn{ flex:0 0 40px; width:40px; min-width:0; height:42px; border-radius:7px !important; }
  #rdHidden{ display:none !important; }
  /* PLAY: small dark hardware key, thin red-orange gradient ring */
  body.rd .dock .play{ width:46px; height:46px; flex:none; border-radius:50% !important; border:1.5px solid transparent !important; outline:0 !important; background:linear-gradient(#272320,#121010) padding-box, linear-gradient(135deg,#ff3d2e,#ff9600 60%,#ffd24a) border-box !important; box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 3px 0 #050403,0 5px 9px #000 !important; padding:0; position:relative; display:flex; align-items:center; justify-content:center; transition:transform .06s, box-shadow .06s; }
  body.rd .dock .play::before, body.rd .dock .play::after{ display:none !important; content:none !important; }
  body.rd .dock .play svg{ width:18px; height:18px; transform:none; filter:none; fill:#ff4a38; color:#ff4a38; }
  body.rd .dock .play svg *{ fill:#ff4a38; }
  body.rd .dock .play:active{ transform:translateY(2px) !important; box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 1px 0 #050403,0 2px 4px #000 !important; }
  body.rd .dock .play.playing{ box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 0 12px rgba(255,90,50,.55),0 3px 0 #050403,0 5px 9px #000 !important; }
  /* story-style thin gradient edges (top keys + dock keys) */
  body.rd .rdbox, body.rd #rdDock .btn{ border:1.5px solid transparent !important; background:linear-gradient(#272320,#121010) padding-box, linear-gradient(135deg,var(--e1,#9c9284),var(--e2,#d8d2c6),var(--e3,#9c9284)) border-box !important; }
  body.rd .rdbox::before{ display:none !important; }
  body.rd .rdbox.on{ box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 0 9px color-mix(in srgb,var(--e2) 45%,transparent),0 3px 0 #050403,0 5px 9px #000; }
  body.rd .rdbox.b-beats{ --e1:#ff3d2e; --e2:#ff9600; --e3:#ffd24a; } body.rd .rdbox.b-sounds{ --e1:#2fd6b0; --e2:#3b8cff; --e3:#9b6bff; }
  body.rd .rdbox.b-friends{ --e1:#8ee06a; --e2:#4fd1a5; --e3:#3bd0ff; } body.rd .rdbox.b-songs{ --e1:#ffb020; --e2:#ff5fa2; --e3:#a855f7; }
  body.rd .rdbox.b-key, body.rd .rdbox.b-bpm{ --e1:#8f877a; --e2:#f2ede2; --e3:#8fb4ff; }
  body.rd #setBtn{ --e1:#8f877a; --e2:#f2ede2; --e3:#8f877a; } body.rd #saveBtn{ --e1:#8ee06a; --e2:#4fd1a5; --e3:#3bd0ff; }
  body.rd #recBtn{ --e1:#ff3d2e; --e2:#ff5fa2; --e3:#a855f7; } body.rd #packsBtn{ --e1:#ffb020; --e2:#ff5fa2; --e3:#9b6bff; }
  /* middle-takeover: settings, packs, beats fill the space between top bar and dock */
  body.rd #stepsZone{ inset:auto !important; left:0 !important; right:0 !important; top:var(--rdT,62px) !important; bottom:var(--rdB,64px) !important; height:auto !important; padding:0 !important; }
  body.rd #setSheet, body.rd #packsSheet{ border-radius:10px !important; border-top-width:2px; border-bottom-width:2px; }
  body.rd #setSheet:not(.open), body.rd #packsSheet:not(.open){ transform:translateY(calc(100% + var(--rdB,64px) + 30px)) !important; pointer-events:none; }
  body.rd .lrow{ isolation:isolate; position:relative; }
  body.rd .lib-head{ z-index:20 !important; }
  body.rd #usbStrip{ max-height:34vh !important; position:relative; z-index:1; }
  /* settings quick row */
  #rdQuick{ display:flex; gap:6px; flex-wrap:wrap; margin:4px 0 10px; }
  #rdQuick button{ flex:1 1 30%; }
  #rdQuick .tg.on{ border-color:#4fd1a5; color:#4fd1a5; }
  /* RACK: wider modules, swipe pages, drawer hides fully */
  #rackZone{ overflow:hidden; transition:height .3s cubic-bezier(.3,.9,.3,1); }
  #rdHandle{ position:relative; display:flex; align-items:center; justify-content:center; gap:8px; height:22px; margin:-6px -5px 2px; cursor:pointer; touch-action:none; font:700 7px var(--ui); letter-spacing:2px; color:#8a8176; border-bottom:1px solid #1a1816; }
  #rdHandle i{ display:block; width:34px; height:4px; border-radius:2px; background:#3a3024; }
  #rdHandle b{ font:700 9px var(--mono); color:#f2ede2; transition:transform .3s; }
  #rackZone.rdc #rdHandle b{ transform:rotate(180deg); }
  #rackZone.rdc{ padding-bottom:0; }
  #rackZone.rdc #rdScroll, #rackZone.rdc .rfoot{ visibility:hidden; }
  #rdScroll{ overflow-x:auto; overflow-y:hidden; scrollbar-width:none; -webkit-overflow-scrolling:touch; touch-action:pan-x; }
  #rdScroll::-webkit-scrollbar{ display:none; }
  .rack .rk-m > .mod{ transform:scale(var(--rsx,var(--rs)), var(--rsy,var(--rs))) !important; }
  /* PACKS wears the feed look: bigger rows, every pack visible with its art */
  body.rd .lrow{ height:88px; border-radius:12px; margin-bottom:8px; }
  body.rd .lrow .txt{ position:absolute; left:0; top:0; right:56px; padding:9px 11px; z-index:2; }
  body.rd .lrow .nm{ font-size:10px; }
  body.rd .lrow .meta{ font-size:8px; color:#c9c1b4; }
  body.rd .lrow canvas{ width:100%; top:20px; height:calc(100% - 20px); opacity:.95; }
  body.rd .lrow .add{ position:absolute; right:8px; bottom:8px; width:44px; height:44px; border-radius:50%; border:1px solid #000; z-index:3; box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 3px 0 #050403,0 5px 9px #000; }
  body.rd #usbStrip{ flex-wrap:wrap !important; overflow-x:hidden !important; overflow-y:auto; max-height:196px; gap:10px 8px; padding:6px 2px 10px; }
  body.rd .usb{ height:auto; }
  body.rd .usb.art .body img{ height:58px; }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.body.classList.add('rd');

  /* ---------- TOP: keys ---------- */
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
  [['keyBtn','b-key',4],['bpmBtn','b-bpm',5]].forEach(([id, cls, i])=>{
    const b = $(id); if(!b) return; const small = b.querySelector('small'), val = b.querySelector('b');
    b.classList.add('rdbox', cls); b.style.setProperty('--i', i);
    const inn = document.createElement('span'); inn.className = 'rdin'; inn.append(small, val); b.append(inn); row.appendChild(b);
  });
  const burst = b => { if(reduce) return; b.classList.add('burst'); setTimeout(()=>b.classList.remove('burst'), 380); };

  /* ---------- FEED ---------- */
  const tlz = $('tlZone');
  const feed = document.createElement('div'); feed.id = 'rdFeed';
  feed.innerHTML = '<div class="fh"><span class="ft">NEWEST <em id="rdFeedKind">SOUNDS</em></span><span id="rdFeedBtns" style="display:flex;gap:6px"></span><button class="fx" id="rdFeedX" data-k="FEED X" aria-label="close">SONG ▸</button></div><div id="rdFeedList"></div>';
  tlz.appendChild(feed);
  const list = $('rdFeedList'), fbtns = $('rdFeedBtns');
  let feedKind = null, feedRaf = 0, gesture = false, io = null, playT = 0;
  const isDrum = s => { try{ return typeOf(s) === 'DRUMS'; }catch(e){ return false; } };
  const seasonName = () => (($('seasonLine')||{}).textContent || '').split(' ')[0].toUpperCase();
  function ordered(kind){
    const season = seasonName();
    const all = samples.filter(s=>!s.failed && !s.hidden);
    const rank = s => (s.folder === 'MADE' ? 0 : (season && String(s.folder).toUpperCase() === season ? 1 : 2));
    const sorted = all.slice().reverse().map((s,i)=>({s,i})).sort((a,b)=> rank(a.s) - rank(b.s) || a.i - b.i).map(x=>x.s);
    if(kind === 'BEATS') return sorted.filter(isDrum);
    if(kind === 'SOUNDS') return sorted.filter(s=>!isDrum(s));
    const a = sorted.filter(s=>!isDrum(s)), d = sorted.filter(isDrum), out = [];       /* HOME: alternate sounds + beats */
    for(let i=0; i<Math.max(a.length, d.length) && out.length < 80; i++){ if(a[i]) out.push(a[i]); if(d[i]) out.push(d[i]); }
    return out;
  }
  const fmt = s => [s.bpm ? s.bpm + ' BPM' : '', s.key || ''].filter(Boolean).join(' · ');
  const artOf = s => { try{ return packArt(packOf(s)); }catch(e){ return null; } };
  function cardEl(s){
    const c = document.createElement('div'); c.className = 'rdcard'; c.dataset.id = s.id; c.dataset.k = 'FEED CARD';
    const season = seasonName(), pk = (()=>{ try{ return packOf(s); }catch(e){ return String(s.folder||''); } })();
    const tag = s.folder === 'MADE' ? 'MADE BY YOU' : (season && String(s.folder).toUpperCase() === season ? season + ' · NEW' : String(pk).toUpperCase());
    const art = artOf(s);
    c.innerHTML = (art ? '<img class="bg" alt="" src="' + art + '">' : '') + '<div class="top2">' + (art ? '<img class="art" alt="" src="' + art + '">' : '') + '<div class="ttl"><div class="cp"></div><div class="cn"></div><div class="cm"></div></div></div><canvas></canvas><span class="hint">TAP = PLAY</span><button class="cadd" data-k="FEED ADD" aria-label="add to song">+</button>';
    c.querySelector('.cp').textContent = tag; c.querySelector('.cn').textContent = s.displayName || s.name; c.querySelector('.cm').textContent = fmt(s);
    c.addEventListener('click', e=>{
      gesture = true;
      if(e.target.closest('.cadd')){ e.stopPropagation(); if(typeof addChannelFromSample === 'function'){ addChannelFromSample(s); setStatus((s.displayName||s.name) + ' added'); try{ navigator.vibrate && navigator.vibrate(10); }catch(_){} } return; }
      if(previewId === s.id){ stopPreview(); markPlaying(); } else { startPreview(s); markPlaying(s.id); }
    });
    return c;
  }
  function paint(){ list.querySelectorAll('.rdcard').forEach(c=>{ const s = samples.find(x=>x.id === c.dataset.id); if(s) drawRow(s, c.querySelector('canvas')); }); }
  function markPlaying(id){ list.querySelectorAll('.rdcard').forEach(c=> c.classList.toggle('playing', c.dataset.id === id)); }
  function loopPaint(){ if(!feed.classList.contains('on')) return; const pid = (typeof previewId !== 'undefined') ? previewId : null; const pc = pid && list.querySelector('.rdcard[data-id="' + pid + '"]'); if(pc){ const s = samples.find(x=>x.id === pid); if(s) drawRow(s, pc.querySelector('canvas')); } else markPlaying(null); feedRaf = requestAnimationFrame(loopPaint); }
  function watchAutoplay(){                                  /* HOME: the card under your thumb plays (after your first tap unlocks audio) */
    if(io) io.disconnect(); io = null; if(feedKind !== 'HOME' || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(es=>{ es.forEach(en=>{ if(en.isIntersecting && en.intersectionRatio >= .7 && gesture){ const id = en.target.dataset.id; clearTimeout(playT); playT = setTimeout(()=>{ const s = samples.find(x=>x.id === id); if(s && previewId !== id){ startPreview(s); markPlaying(id); } }, 220); } }); }, { root:list, threshold:[.7] });
    list.querySelectorAll('.rdcard').forEach(c=>io.observe(c));
  }
  function openFeed(kind){
    feedKind = kind; const home = kind === 'HOME', sounds = kind === 'SOUNDS';
    feed.classList.toggle('home', home); feed.style.setProperty('--rdc', kind === 'BEATS' ? '#ff9600' : '#4fd1a5');
    $('rdFeedKind').textContent = home ? '' : kind; feed.querySelector('.ft').firstChild.textContent = home ? 'FEED' : 'NEWEST '; fbtns.innerHTML = '';
    list.innerHTML = ''; ordered(kind).slice(0, 80).forEach(s => list.appendChild(cardEl(s)));
    if(!list.children.length) list.innerHTML = '<div style="color:#8a8176;font:500 9px var(--mono);padding:20px;text-align:center">sounds loading… tap PACKS</div>';
    feed.classList.add('on'); document.body.classList.add('rdfeed'); list.scrollTop = 0;
    requestAnimationFrame(()=>{ paint(); cancelAnimationFrame(feedRaf); loopPaint(); watchAutoplay(); });
  }
  function closeFeed(){ if(!feed.classList.contains('on')) return; feed.classList.remove('on'); document.body.classList.remove('rdfeed'); cancelAnimationFrame(feedRaf); feedKind = null; if(io) io.disconnect(); clearTimeout(playT); try{ stopPreview(); }catch(e){} }
  $('rdFeedX').addEventListener('click', closeFeed);
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeFeed(); });
  /* tap the logo = back to the feed */
  top.querySelector('.brand').addEventListener('click', ()=>{ $('rdSnd').classList.remove('on'); if(feedKind === 'HOME') closeFeed(); else openFeed('HOME'); });

  /* ---------- BEATS / SOUNDS / FRIENDS / SONGS ---------- */
  const snd = document.createElement('div'); snd.id = 'rdSnd'; snd.innerHTML = '<button data-k="SND MAKE" id="rdsMake">MAKE</button><button data-k="SND PAD" id="rdsPad">PAD</button><button data-k="SND SING" id="rdsSing">SING</button>'; top.appendChild(snd);
  const toggleSnd = on => { snd.classList.toggle('on', on); bSounds.classList.toggle('on', on); };
  bBeats.addEventListener('click', ()=>{ burst(bBeats); toggleSnd(false); closeFeed(); $('stepsBtn').click(); });            /* BEATS = the step sequencer (redesign coming) */
  bSounds.addEventListener('click', ()=>{ burst(bSounds); toggleSnd(!snd.classList.contains('on')); });                       /* SOUNDS = MAKE · PAD · SING (new space coming) */
  [['rdsMake','makeBtn'],['rdsPad','padBtn'],['rdsSing','singBtn']].forEach(([a,b])=> $(a).addEventListener('click', ()=>{ toggleSnd(false); closeFeed(); $(b).click(); }));
  document.addEventListener('pointerdown', e=>{ if(!e.target.closest('#rdSnd') && !e.target.closest('.b-sounds')) toggleSnd(false); }, true);
  bFriends.addEventListener('click', ()=>{ burst(bFriends); setStatus('FRIENDS · share songs, collab · coming soon'); });
  bSongs.addEventListener('click', ()=>{ burst(bSongs); setStatus('SONGS · your FL library lives here · coming soon'); });
  [$('keyBtn'), $('bpmBtn')].forEach(b => b && b.addEventListener('click', ()=> burst(b)));
  ['packsBtn','setBtn'].forEach(id => $(id) && $(id).addEventListener('click', ()=>{ toggleSnd(false); closeFeed(); }, true));

  /* ---------- BOTTOM: one row ---------- */
  const dock = $('dock'), dg = dock.querySelector('.dgrid'), play = $('transportBtn');
  const rowD = document.createElement('div'); rowD.id = 'rdDock'; dock.insertBefore(rowD, play);
  ['setBtn','saveBtn','recBtn','packsBtn'].forEach(id => rowD.appendChild($(id)));
  const hid = document.createElement('div'); hid.id = 'rdHidden'; while(dg.firstChild) hid.appendChild(dg.firstChild); dock.appendChild(hid);

  /* ---------- SETTINGS quick row ---------- */
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
  if(tctl){ ub.className = $('tlStart').className; tctl.insertBefore(ub, $('tlStart')); }
  ub.addEventListener('click', ()=>{ try{ undo(); }catch(e){} });
  window.clearBoard = function(){};
  let dt = { t:0, x:0, y:0, down:null };
  tl.addEventListener('pointerdown', e=>{ dt.down = { x:e.offsetX, y:e.offsetY }; }, true);
  tl.addEventListener('pointerup', e=>{
    const d = dt.down; dt.down = null; if(!d) return; if(Math.abs(e.offsetX - d.x) + Math.abs(e.offsetY - d.y) > 10) return;
    let ht; try{ ht = hitTest(e.offsetX, e.offsetY); }catch(_){ return; }
    if(!ht || (ht.kind !== 'empty' && ht.kind !== 'row')) { dt.t = 0; return; }
    const now = performance.now();
    if(now - dt.t < 380 && Math.abs(e.offsetX - dt.x) < 40 && Math.abs(e.offsetY - dt.y) < 40){ dt.t = 0; try{ undo(); try{ navigator.vibrate && navigator.vibrate(12); }catch(_){} }catch(_){} }
    else { dt.t = now; dt.x = e.offsetX; dt.y = e.offsetY; }
  });

  /* ---------- RACK: wider modules, same height, swipe pages, drawer hides fully ---------- */
  const rz = $('rackZone'), rack = $('rack');
  const scroller = document.createElement('div'); scroller.id = 'rdScroll'; rack.parentNode.insertBefore(scroller, rack); scroller.appendChild(rack);
  const h = document.createElement('div'); h.id = 'rdHandle'; h.dataset.k = 'RACK HANDLE'; h.innerHTML = '<i></i><span>SLIDERS</span><b>▾</b><i></i>'; rz.insertBefore(h, rz.firstChild);
  const HFIX = 196, WIDE = 1, GAP = 3;
  window.layoutRack = function(){
    const Wv = scroller.clientWidth; if(!Wv) return;
    const sy = HFIX/330, sx = sy*WIDE, mw = 66*sx, n = RACK.length + 1, total = Math.max(Wv, n*mw + (n-1)*GAP);
    rack.style.width = total + 'px'; rack.style.height = HFIX + 'px'; rack.style.setProperty('--rsx', sx.toFixed(4)); rack.style.setProperty('--rsy', sy.toFixed(4)); rack.style.setProperty('--rs', sx.toFixed(4));
    rack.classList.toggle('thicko', thickIdx >= 0);
    rackEls.forEach((w,i)=>{ let L = i*(mw + GAP), Wd = mw; if(i === thickIdx){ Wd = 206*sx; L = Math.max(0, Math.min(L + mw/2 - Wd/2, total - Wd)); } w.style.left = L.toFixed(2) + 'px'; w.style.width = Wd.toFixed(2) + 'px'; w.style.height = HFIX + 'px'; w.classList.toggle('thick', i === thickIdx); });
    const ad = rack.querySelector('.rk-add'); if(ad){ ad.style.left = (RACK.length*(mw + GAP)).toFixed(2) + 'px'; ad.style.width = mw.toFixed(2) + 'px'; ad.style.height = HFIX + 'px'; }
    drawDots();
  };
  function drawDots(){ const dots = $('dots'); if(!dots) return; const pages = Math.max(1, Math.ceil(scroller.scrollWidth / Math.max(1, scroller.clientWidth) - 0.05)); const cur = Math.round(scroller.scrollLeft / Math.max(1, scroller.clientWidth)); if(dots.children.length !== pages){ dots.innerHTML = ''; for(let i=0;i<pages;i++) dots.appendChild(document.createElement('i')); } [...dots.children].forEach((d,i)=> d.classList.toggle('on', i === Math.min(cur, pages-1))); }
  scroller.addEventListener('scroll', drawDots, { passive:true });
  $('dots').addEventListener('click', e=>{ const i = [...$('dots').children].indexOf(e.target); if(i >= 0) scroller.scrollTo({ left:i*scroller.clientWidth, behavior:'smooth' }); }, true);
  /* swipe sideways on the handle or the foot strip to page through the sliders (modules keep their own drag) */
  const dragScroll = el => { let x0 = null, s0 = 0; el.addEventListener('pointerdown', e=>{ x0 = e.clientX; s0 = scroller.scrollLeft; }); el.addEventListener('pointermove', e=>{ if(x0 == null) return; scroller.scrollLeft = s0 - (e.clientX - x0); }); ['pointerup','pointercancel'].forEach(ev=> el.addEventListener(ev, ()=>{ x0 = null; })); };
  dragScroll(h); const foot = rz.querySelector('.rfoot'); if(foot) dragScroll(foot);
  const sliderPref = () => LS.get('tuner_rd_hide') === '1';
  const syncTog = () => $('rdSlTog').classList.toggle('on', sliderPref());
  function fullH(){ const prev = rz.style.height; rz.style.height = 'auto'; const v = rz.offsetHeight; rz.style.height = prev; return v; }
  function setRack(open, instant){
    const hOpen = fullH(), hClosed = h.offsetHeight + 2 + 8;
    if(instant) rz.style.transition = 'none';
    rz.style.height = (open ? hOpen : hClosed) + 'px'; rz.classList.toggle('rdc', !open);
    if(open) setTimeout(()=>{ rz.style.height = ''; }, 340);
    if(instant){ void rz.offsetHeight; rz.style.transition = ''; }
    LS.set('tuner_rd_open', open ? '1' : '0');
    setTimeout(()=>{ try{ fitTL(); drawAll(); }catch(e){} }, 340);
  }
  let hx = null, hy = null, hmoved = false;
  h.addEventListener('pointerdown', e=>{ hx = e.clientX; hy = e.clientY; hmoved = false; });
  h.addEventListener('pointermove', e=>{ if(hy == null) return; if(Math.abs(e.clientX - hx) > 6 || Math.abs(e.clientY - hy) > 8) hmoved = true; });
  h.addEventListener('pointerup', e=>{ if(hy == null) return; const dy = e.clientY - hy, dx = e.clientX - hx; hy = null; if(Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) setRack(dy < 0); });
  h.addEventListener('click', ()=>{ if(hmoved){ hmoved = false; return; } setRack(rz.classList.contains('rdc')); });
  $('rdSlTog').addEventListener('click', ()=>{ LS.set('tuner_rd_hide', sliderPref() ? '0' : '1'); syncTog(); setStatus(sliderPref() ? 'sliders start hidden' : 'sliders start open'); });
  syncTog(); try{ window.layoutRack(); }catch(e){}
  new ResizeObserver(()=>{ try{ window.layoutRack(); }catch(e){} }).observe(scroller);

  /* ---------- BOOT: land on the FEED ---------- */
  requestAnimationFrame(()=> requestAnimationFrame(()=>{ const wantOpen = sliderPref() ? false : (LS.get('tuner_rd_open') !== '0'); if(!wantOpen) setRack(false, true); }));
  let tries = 0; const boot = ()=>{ if(samples.length || tries++ > 40){ if(!feedKind && !document.querySelector('.sheet.open') ) openFeed('HOME'); } else setTimeout(boot, 150); };
  setTimeout(boot, 200);
  let lastN = 0; setInterval(()=>{ if(feedKind === 'HOME' && !gesture && samples.length !== lastN){ lastN = samples.length; openFeed('HOME'); } }, 1200);
  function fit(){ try{ const t = $('topZone').getBoundingClientRect(), d = $('dock').getBoundingClientRect(), T = Math.round(t.bottom), B = Math.round(innerHeight - d.top); const r = document.documentElement.style; r.setProperty('--rdT', T + 'px'); r.setProperty('--rdB', B + 'px'); ['setSheet','packsSheet'].forEach(id=>{ const e = $(id); if(!e) return; e.style.setProperty('top', T + 'px', 'important'); e.style.setProperty('bottom', B + 'px', 'important'); }); r.setProperty('--packsBot', B + 'px'); }catch(e){} }
  fit(); window.addEventListener('resize', fit); setInterval(fit, 1500); ['setBtn','packsBtn','stepsBtn'].forEach(id => $(id) && $(id).addEventListener('click', fit, true));
  window.RD = { openFeed, closeFeed, setRack, version: RD_VER };
})();
