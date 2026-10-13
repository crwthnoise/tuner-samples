/* RAGE — the distortion that loses it (THREAT TUNER module, DRIVE).
   Fader = how much rage: drive climbs, the tone opens up, lows stay tight underneath.
   Switch = SCREAM: an octave-up fuzz layer (rectified) on top — the cores of the cracks go molten.
   Look (13 Oct, lab-6): THREAT glow rises, its top edge = a cracked line (v2 B); cracks = v2 A (burst from one point, grows from the start) + v2 C (stems down from the line, appears past halfway).
   Face pulses with the sound (react) — only a CSS opacity change per frame, so it never slows anything.
   One file, used by the MODULE LAB and the app. */
(function(){
  const curves = new Map(); let uid = 0;
  function curve(kind){ if(curves.has(kind)) return curves.get(kind); const n = 4096, c = new Float32Array(n);
    for(let i=0;i<n;i++){ const x = i/(n-1)*2 - 1;
      if(kind === 'rage'){ const y = Math.tanh(x*1.25 + 0.12*x*x); c[i] = y - Math.tanh(0.12)*0.0; }   /* warm, slightly asymmetric = more harmonics */
      else { c[i] = Math.tanh(Math.abs(x)*2.2)*1.0 - 0.45; } }                                         /* SCREAM: full-wave rectify = octave up */
    curves.set(kind, c); return c; }

  /* ---- the face: 3D cracks (deterministic, grows with v) ---- */
  function rng(seed){ let s = seed >>> 0; return ()=>{ s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s/4294967296; }; }
  function segs(cx, cy, arms, grow, seed, dir){ const R = rng(seed), out = [], maxD = 1 + grow*5;
    const br = (x, y, a, len, d)=>{ if(d > maxD) return; const L = (d + 1 > maxD) ? len*(maxD - d) : len; const x2 = x + Math.cos(a)*L, y2 = y + Math.sin(a)*L; out.push([x, y, x2, y2, d]);
      const r1 = R(), r2 = R(), r3 = R(); br(x2, y2, a + (r1 - .5)*.8, len*.76, d + 1); if(r2 < .6) br(x2, y2, a + (r3 - .5)*1.7, len*.6, d + 1); };
    for(let i=0;i<arms;i++){ const a = dir == null ? (i/arms)*Math.PI*2 + R()*.4 : dir + (i - (arms - 1)/2)*.55; br(cx, cy, a, 26 + R()*16, 0); }
    return out; }

  /* fixed crack trees (built once): each segment knows how far it is from the impact point, so growing = revealing */
  const A_X = 46, A_Y = 252, C_X = 58, C_Y = 70, VA = (292 - A_Y)/278, VC = (292 - C_Y)/278;
  function tree(cx, cy, dirs, seed, len0){ const R = rng(seed), out = [];
    const br = (x, y, a, len, d, dist)=>{ if(d > 5 || len < 4) return; const x2 = x + Math.cos(a)*len, y2 = y + Math.sin(a)*len; out.push([x, y, x2, y2, d, dist, len]);
      const r1 = R(), r2 = R(), r3 = R(); br(x2, y2, a + (r1 - .5)*.7, len*.78, d + 1, dist + len); if(r2 < .55) br(x2, y2, a + (r3 - .5)*1.6, len*.6, d + 1, dist + len); };
    dirs.forEach((a, i)=>br(cx, cy, a, len0*(.8 + R()*.4), 0, 0)); return out; }
  /* A (lab-8): the bottom crack breaks PIECE BY PIECE — one main crack runs up first, then the next one, then the branches split off one at a time.
     Each piece gets a place in line (start..end on a 0..1 timeline) so it never all bursts out at once. */
  function seqTree(cx, cy, seed){ const R = rng(seed), trunks = [], twigs = [];
    const run = (x, y, a, len, n, arr, d)=>{ const pts = []; for(let i=0;i<n;i++){ const x2 = x + Math.cos(a)*len, y2 = y + Math.sin(a)*len; pts.push([x, y, x2, y2, d]); x = x2; y = y2; a += (R() - .5)*.55; len *= .9; } arr.push(pts); return pts; };
    const t1 = run(cx, cy, -1.45, 17, 7, trunks, 0), t2 = run(cx, cy, -.35, 14, 5, trunks, 0), t3 = run(cx, cy, -2.6, 12, 4, trunks, 1);
    [[t1,1],[t1,3],[t2,1],[t1,5],[t3,1],[t2,3],[t1,2],[t2,2],[t3,2],[t1,4]].forEach(([t, k], i)=>{ const [, , x, y] = t[k]; const side = i % 2 ? 1 : -1; const tw = run(x, y, Math.atan2(t[k][3] - t[k][1], t[k][2] - t[k][0]) + side*(.7 + R()*.4), Math.max(4.5, 9 - i*.5), 2 + (i < 3 ? 1 : 0), twigs, 2);
      if(i < 6){ const [, , xx, yy] = tw[0], aa = Math.atan2(tw[0][3] - tw[0][1], tw[0][2] - tw[0][0]); run(xx, yy, aa - side*(.8 + R()*.3), 5, 2, twigs, 3); } });   /* lab-9: a few tiny sub-cracks, like the top one */
    const pieces = []; trunks.concat(twigs).forEach(path=>path.forEach(sg=>pieces.push(sg)));
    const total = pieces.reduce((a, [x, y, x2, y2])=>a + Math.hypot(x2 - x, y2 - y), 0); let acc = 0;
    return pieces.map(([x, y, x2, y2, d])=>{ const L = Math.hypot(x2 - x, y2 - y), t0 = acc/total; acc += L; return [x, y, x2, y2, d, t0, acc/total]; }); }
  const TREE_A = seqTree(A_X, A_Y, 11);
  function seqCracks(T, g){ if(g <= 0) return []; const out = []; T.forEach(([x, y, x2, y2, d, t0, t1])=>{ if(g <= t0) return; const k = Math.min(1, (g - t0)/(t1 - t0)); out.push([x, y, x + (x2 - x)*k, y + (y2 - y)*k, d]); }); return out; }
  const TREE_C = tree(C_X, C_Y, [.55,1.25,1.75,2.5,-.2,3.3], 17, 22);
  function grownCracks(T, g){ if(g <= 0) return []; const r = g*150, out = [];
    T.forEach(([x, y, x2, y2, d, dist, len])=>{ if(dist >= r) return; const k = Math.min(1, (r - dist)/len); out.push([x, y, x + (x2 - x)*k, y + (y2 - y)*k, d]); }); return out; }
  function cracks3d(S, hot){ const w = d=>Math.max(1, 4.6 - d*.75); let o = '';
    S.forEach(([a,b,c,d,k])=>o += `<line x1="${a+1.6}" y1="${b+1.8}" x2="${c+1.6}" y2="${d+1.8}" stroke="#000" stroke-width="${w(k)+2}" stroke-linecap="round" opacity=".85"/>`);
    S.forEach(([a,b,c,d,k])=>o += `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#5a0b08" stroke-width="${w(k)+1.4}" stroke-linecap="round"/>`);
    S.forEach(([a,b,c,d,k])=>o += `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${hot}" stroke-width="${w(k)*.5}" stroke-linecap="round"/>`);
    S.forEach(([a,b,c,d,k])=>o += `<line x1="${a-.9}" y1="${b-.9}" x2="${c-.9}" y2="${d-.9}" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity="${(.55 - k*.07).toFixed(2)}"/>`);
    return o; }

  const RAGE = {
    name:'RAGE', acc:'#ff3b30', screws:true, cat:'DRIVE',
    desc:'distortion that loses it — cracks the sound open', sw:'SCREAM', swd:'octave-up fuzz screams on top',
    face:'linear-gradient(#1c1a17,#0e0d0b)',
    g(v, st){ const u = 'rg' + (++uid), on = !!(st && st.sw && st.sw.RAGE), hot = on ? '#ffb347' : '#ffe0d0', y = 292 - v*278;
      let s = `<defs><linearGradient id="${u}G" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3030" stop-opacity="${(.35 + v*.45).toFixed(2)}"/><stop offset=".8" stop-color="#d32f2f" stop-opacity="${(v*.25).toFixed(2)}"/><stop offset="1" stop-color="#d32f2f" stop-opacity="0"/></linearGradient>
        <radialGradient id="${u}O"><stop offset="0" stop-color="#fff" stop-opacity="${(.3 + .6*v).toFixed(2)}"/><stop offset="1" stop-color="#ff3b30" stop-opacity="0"/></radialGradient>
        <clipPath id="${u}C"><rect x="0" y="${y}" width="100" height="300"/></clipPath><filter id="${u}B"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
        <rect x="0" y="${y}" width="100" height="${300 - y}" fill="url(#${u}G)"/>`;
      for(let i=0;i<=10;i++){ const yy = 292 - 278*i/10; s += `<line x1="3" x2="${i%5 ? 12 : 20}" y1="${yy}" y2="${yy}" stroke="${i >= 8 ? '#ff3b30' : '#6a625a'}" stroke-width="1.6"/>`; }
      /* ONE fixed crack each — same shape every time, only revealed. A = impact point low (y 252, lab-8): when the edge passes it,
         it breaks piece by piece (one crack line, then the next, then branches). C = impact near the top (y 70): when the edge passes it, it slowly spreads from there. */
      const S = seqCracks(TREE_A, Math.min(1, Math.max(0, v - VA)/(.92 - VA))).concat(grownCracks(TREE_C, Math.max(0, v - VC)/(1 - VC)*.7)), w = d=>Math.max(.9, 3 - d*.5);
      let lines = ''; S.forEach(([a,b,c,d,k])=>lines += `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}" stroke-width="${w(k)}" stroke-linecap="round"/>`);
      s += `<g clip-path="url(#${u}C)"><g stroke="#000" opacity=".7" transform="translate(1.4 1.6)">${lines}</g><g stroke="#ff3b30" opacity=".8" filter="url(#${u}B)">${lines}</g><g stroke="${hot}">${lines}</g></g>`;
      if(v > VA) s += `<circle cx="${A_X}" cy="${A_Y}" r="${3 + 9*Math.min(1,(v - VA)*1.5)}" fill="url(#${u}O)"/>`;
      if(v > VC) s += `<circle cx="${C_X}" cy="${C_Y}" r="${3 + 10*(v - VC)/(1 - VC)}" fill="url(#${u}O)"/>`;
      if(v > .8) s += `<rect x="0" y="0" width="100" height="70" fill="#ff3b30" opacity=".12"/>`;
      /* B: the glow's top edge = a cracked line (the fader cap) */
      const R = rng(31); let e = `M0 ${y}`; for(let x=0;x<=100;x+=7) e += ` L${x} ${(y + (R() - .5)*(6 + v*8)).toFixed(1)}`;
      let spikes = ''; const R2 = rng(41); for(let i=0;i<4 + Math.round(v*6);i++){ const x = 4 + R2()*92, len = 4 + R2()*10*(.5 + v); spikes += `<line x1="${x}" y1="${y}" x2="${x + (R2() - .5)*8}" y2="${y - len}" stroke="#ff3b30" stroke-width="1"/>`; }
      s += spikes + `<path d="${e}" stroke="#ff3b30" stroke-width="5" fill="none" opacity=".6" filter="url(#${u}B)"/><path d="${e}" stroke="#fff" stroke-width="1.8" fill="none"/>`;
      return `<div class="scr" style="background:#070505"><svg class="f" viewBox="0 0 100 300" preserveAspectRatio="none">${s}</svg><div class="rgPulse" style="position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 80%,rgba(255,80,60,.55),transparent 70%);mix-blend-mode:screen"></div></div>`; },
    /* audio react: lvl 0..1 from the module's output — just an opacity, cheap */
    react(el, lvl){ const p = el && el.querySelector('.rgPulse'); if(p) p.style.opacity = Math.min(1, lvl*1.6).toFixed(3); },
    worklets:['modules/rage.worklet.js'],
    build(ac){ const G = v=>{ const g = ac.createGain(); g.gain.value = v; return g; }; /* note: Web Audio lowpass/highpass Q is in dB → -3.01 dB = Butterworth (LR4 split sums flat) */ const F = (type, f, q)=>{ const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }; const n = {};
      n.in = G(1); n.out = G(1); n.dry = G(1); n.wet = G(0);
      /* split at 120 Hz (LR4): lows stay clean + tight under the rage, highs get destroyed */
      n.lp1 = F('lowpass', 120, -3.0103); n.lp2 = F('lowpass', 120, -3.0103); n.hp1 = F('highpass', 120, -3.0103); n.hp2 = F('highpass', 120, -3.0103);
      n.push = F('peaking', 1400, .8); n.push.gain.value = 4;                     /* bite before the clip */
      n.drive = G(1);
      n.shape = ac.createWaveShaper(); n.shape.curve = curve('rage'); n.shape.oversample = '4x';
      n.sDrive = G(0); n.sShape = ac.createWaveShaper(); n.sShape.curve = curve('scream'); n.sShape.oversample = '4x'; n.sHp = F('highpass', 300, .7); n.sG = G(0);   /* SCREAM */
      n.tone = F('lowpass', 5000, .5); n.dc = F('highpass', 25, .7); n.sum = G(1);
      n.in.connect(n.lp1); n.lp1.connect(n.lp2); n.lp2.connect(n.out);                         /* lows: always clean */
      n.in.connect(n.hp1); n.hp1.connect(n.hp2); n.hp2.connect(n.dry); n.dry.connect(n.out);     /* clean highs (fade out) */
      n.hp2.connect(n.push); n.push.connect(n.drive); n.drive.connect(n.shape); n.shape.connect(n.tone);
      n.push.connect(n.sDrive); n.sDrive.connect(n.sShape); n.sShape.connect(n.sHp); n.sHp.connect(n.sG); n.sG.connect(n.tone);
      n.tone.connect(n.dc); n.dc.connect(n.sum);
      try{ n.match = new AudioWorkletNode(ac, 'ragematch', { numberOfInputs:2, numberOfOutputs:1, outputChannelCount:[2] }); n.sum.connect(n.match, 0, 0); n.hp2.connect(n.match, 0, 1); n.match.connect(n.wet); }
      catch(e){ n.match = null; n.sum.connect(n.wet); }                        /* no worklet = still works, just not level-matched */
      n.wet.connect(n.out);
      n.set = (v, sw, now)=>{ const s = (p, x)=>{ if(now == null) p.value = x; else p.setTargetAtTime(x, now, 0.03); };
        const d = Math.pow(v, 1.4), x = Math.min(1, v*2.5);                   /* full rage from ~40% up */
        s(n.drive.gain, 1 + d*38);                                            /* 1x → ~39x drive */
        s(n.tone.frequency, 3200 + v*6800);                                   /* opens up as it rages */
        s(n.dry.gain, Math.cos(x*Math.PI/2)); s(n.wet.gain, Math.sin(x*Math.PI/2));   /* equal-power blend = no dip */
        if(n.match) s(n.match.parameters.get('boost'), 1 + v*0.3);            /* a touch louder as you push it (~+2 dB at top) */
        s(n.sDrive.gain, sw ? 4 + d*20 : 0); s(n.sG.gain, sw ? 1.3 + v*1.1 : 0);    /* lab-9: SCREAM louder (was 2+14d / .6+.5v) */
        n._v = v; n._sw = !!sw; };
      /* LAB only — what each unit is doing right now (the CHAIN panel). Not shown in the app. */
      n.taps = { LOWS:n.lp2, 'CLEAN HI':n.dry, RAGED:n.wet, SCREAM:n.sG, OUT:n.out };
      if(n.match && n.match.port) n.match.port.onmessage = e=>{ n._mg = e.data.g; };
      n.info = ()=>{ const v = n._v || 0, sw = n._sw, d = Math.pow(v, 1.4), x = Math.min(1, v*2.5), dr = 1 + d*38, db = g=>(20*Math.log10(Math.max(1e-6, g))).toFixed(1);
        const hz = f=>f >= 1000 ? (f/1000).toFixed(1) + 'k' : Math.round(f) + '';
        return [
          { u:'SPLIT', s:'crossover 120 Hz · LR4 24 dB/oct', note:'lows ↓ go straight out clean · highs → the chain' },
          { u:'BELL EQ', s:'+4 dB @ 1.4k · Q 0.8', note:'bite before the clip' },
          { u:'DRIVE', s:dr.toFixed(1) + 'x  (+' + db(dr) + ' dB)', note:'1x → 39x, curve v^1.4' },
          { u:'CLIPPER', s:'tanh soft clip · asym 0.12 · 4x OS', note:'warm, even + odd harmonics' },
          { u:'TONE', s:'lowpass ' + hz(3200 + v*6800) + ' · 12 dB/oct', note:'opens 3.2k → 10k' },
          { u:'DC BLOCK', s:'highpass 25 Hz' },
          { u:'LEVEL MATCH', s:n._mg ? db(n._mg) + ' dB  (target +' + db(1 + v*.3) + ')' : 'target +' + db(1 + v*.3) + ' dB', note:'auto-gain: raged highs ≈ clean highs. No compressor.' },
          { u:'BLEND', s:'clean ' + Math.round(Math.cos(x*Math.PI/2)**2*100) + '% · raged ' + Math.round(Math.sin(x*Math.PI/2)**2*100) + '%', note:'equal power, full rage from 40%' },
          { u:'SCREAM', s:sw ? 'drive ' + (4 + d*20).toFixed(1) + 'x → full-wave rectify (octave up) → HP 300 → mix ' + db(1.3 + v*1.1) + ' dB' : 'off', off:!sw, note:'parallel, into TONE' },
        ]; };
      return n; },
  };
  (window.TUNER_MODS = window.TUNER_MODS || {}).RAGE = RAGE;
})();
