/* FLAME — the warmest saturator (THREAT TUNER module, DRIVE). LAB lab-18: SOUND FIRST — look gets redone after.
   Alex 14 Oct: "good for everything — drums, everything. Warm it up, thicken it up, so much warmth and heat, a little sizzle,
   it can't sound bad." Switch = WIDE: spreads only the saturated TOP end (no lows = no phasing).
   Chain: WARM shelf → tape tilt → DRIVE → soft asymmetric tape curve (even harmonics = warmth) → GLUE (gentle comp = thick)
          + SIZZLE (parallel: highs only, driven harder, small) → DC → LEVEL MATCH (louder ≠ better) → BLEND (parallel, never all-wet harsh)
          + WIDE (switch): saturated highs only, added as a side signal (+L / −R) = wide, mono-safe, lows untouched. */
(function(){
  const curves = new Map();
  /* tape-ish: tanh with a small offset → even harmonics (warm), DC removed, normalised to ±1 */
  function tapeCurve(asym){ const key = asym.toFixed(3); if(curves.has(key)) return curves.get(key); const n = 4096, c = new Float32Array(n), b = asym, z = Math.tanh(b), m = Math.max(Math.abs(Math.tanh(1 + b) - z), Math.abs(Math.tanh(-1 + b) - z));
    for(let i=0;i<n;i++){ const x = i*2/(n - 1) - 1; c[i] = (Math.tanh(x*1.0 + b) - z)/m; } curves.set(key, c); return c; }
  function sizCurve(){ if(curves.has('siz')) return curves.get('siz'); const n = 2048, c = new Float32Array(n);
    for(let i=0;i<n;i++){ const x = i*2/(n - 1) - 1; c[i] = Math.tanh(x*2.2)/Math.tanh(2.2); } curves.set('siz', c); return c; }
  const FLAME = {
    name:'FLAME', acc:'#ff7a1a', screws:false, cat:'DRIVE',
    desc:'warmth and heat on anything', sw:'WIDE', swd:'spreads the hot top end (lows stay centred)',
    face:'linear-gradient(#2a1608,#120804)',
    hero:[ { k:'warmG', l:'WARM' }, { k:'drvMax', l:'DRIVE' }, { k:'sizMix', l:'SIZZLE' }, { k:'gRat', l:'GLUE' } ],   /* the pop-up's big knobs; the rest sit under ▾ ALL */
    look:'flame',
    worklets:['modules/rage.worklet.js'],   /* uses RAGE's level matcher */
    params:[
      { k:'warmF',  u:'WARM',   l:'low shelf',   min:60,  max:300,   def:140,  unit:'Hz', log:1 },
      { k:'warmG',  u:'WARM',   l:'gain at top', min:0,   max:6,     def:2.5,  unit:'dB' },
      { k:'tapeF',  u:'TAPE',   l:'top roll-off', min:3000, max:16000, def:7000, unit:'Hz', log:1 },
      { k:'tapeG',  u:'TAPE',   l:'roll-off',    min:-8,  max:0,     def:-2.5, unit:'dB' },
      { k:'drvMax', u:'DRIVE',  l:'max drive',   min:1.5, max:20,    def:5,    unit:'x', log:1 },
      { k:'asym',   u:'DRIVE',  l:'warmth (even)', min:0, max:.6,    def:.18 },
      { k:'gThr',   u:'GLUE',   l:'threshold',   min:-36, max:0,     def:-18,  unit:'dB' },
      { k:'gRat',   u:'GLUE',   l:'ratio',       min:1,   max:6,     def:2 },
      { k:'sizF',   u:'SIZZLE', l:'from',        min:2500, max:12000, def:6000, unit:'Hz', log:1 },
      { k:'sizMix', u:'SIZZLE', l:'amount',      min:0,   max:1,     def:.22 },
      { k:'wideF',  u:'WIDE',   l:'from',        min:800, max:8000,  def:2500, unit:'Hz', log:1 },
      { k:'wide',   u:'WIDE',   l:'amount',      min:0,   max:1.5,   def:.45 },
      { k:'boost',  u:'LEVEL MATCH', l:'top boost', min:0, max:4,    def:1,    unit:'dB' },
      { k:'full',   u:'BLEND',  l:'full flame at', min:.2, max:1,    def:.55,  unit:'%' },
    ],
    /* placeholder face (look gets redone): heat rising from the bottom with the fader */
    g(v, st){ const h = 20 + v*260, w = st && st.sw && st.sw.FLAME;
      return `<div class="scr" style="background:#0a0503"><svg class="f" viewBox="0 0 100 300" preserveAspectRatio="none"><defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3a0a"/><stop offset=".55" stop-color="#ff9a2a"/><stop offset="1" stop-color="#ffe0a0" stop-opacity="0"/></linearGradient></defs>
        <rect x="${w ? 6 : 22}" y="${(300 - h).toFixed(1)}" width="${w ? 88 : 56}" height="${h.toFixed(1)}" fill="url(#fl)" opacity="${(.35 + v*.6).toFixed(2)}"/></svg></div>`; },
    build(ac, P0){ const G = v=>{ const g = ac.createGain(); g.gain.value = v; return g; }, F = (type, f, q, gn)=>{ const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; if(gn != null) x.gain.value = gn; return x; }; const n = {};
      n.P = {}; FLAME.params.forEach(p=>n.P[p.k] = p.def); Object.assign(n.P, P0 || {});
      n.in = G(1); n.out = G(1); n.dry = G(1); n.wet = G(0);
      n.warm = F('lowshelf', 140, .7, 0); n.tape = F('highshelf', 7000, .7, 0); n.drive = G(1);
      n.shape = ac.createWaveShaper(); n.shape.oversample = '4x'; n.trim = G(1);
      n.glue = ac.createDynamicsCompressor(); n.glue.attack.value = .012; n.glue.release.value = .18; n.glue.knee.value = 12;
      n.sHp = F('highpass', 6000, .7); n.sDrv = G(3); n.sShape = ac.createWaveShaper(); n.sShape.curve = sizCurve(); n.sShape.oversample = '2x'; n.sG = G(0);
      n.dc = F('highpass', 20, .7); n.sum = G(1);
      /* main path */
      n.in.connect(n.dry); n.dry.connect(n.out);
      n.in.connect(n.warm); n.warm.connect(n.tape); n.tape.connect(n.drive); n.drive.connect(n.shape); n.shape.connect(n.trim); n.trim.connect(n.glue); n.glue.connect(n.sum);
      n.in.connect(n.sHp); n.sHp.connect(n.sDrv); n.sDrv.connect(n.sShape); n.sShape.connect(n.sG); n.sG.connect(n.sum);   /* SIZZLE */
      n.sum.connect(n.dc);
      try{ n.match = new AudioWorkletNode(ac, 'ragematch', { numberOfInputs:2, numberOfOutputs:1, outputChannelCount:[2] }); n.dc.connect(n.match, 0, 0); n.in.connect(n.match, 0, 1); n.match.connect(n.wet); }
      catch(e){ n.match = null; n.dc.connect(n.wet); }
      n.wet.connect(n.out);
      /* WIDE (switch): only the hot top end, L and R through different all-passes = spread, lows untouched */
      n.wHp = F('highpass', 2500, .7); n.wHp2 = F('highpass', 2500, .7); n.wSplit = ac.createChannelSplitter(2); n.wMerge = ac.createChannelMerger(2);
      n.apL = [F('allpass', 3100, .6), F('allpass', 7400, .6)]; n.wG = G(0);
      n.wet.connect(n.wHp); n.wHp.connect(n.wHp2); n.wHp2.connect(n.wSplit);
      n.wSplit.connect(n.apL[0], 0); n.apL[0].connect(n.apL[1]); n.apL[1].connect(n.wMerge, 0, 0);
      n.wInv = G(-1); n.apL[1].connect(n.wInv); n.wInv.connect(n.wMerge, 0, 1);   /* same signal, opposite sign on R = pure side → in mono it cancels, nothing phases */
      n.wMerge.connect(n.wG); n.wG.connect(n.out);
      n.apply = ()=>{ const P = n.P; n.warm.frequency.value = P.warmF; n.tape.frequency.value = P.tapeF; n.shape.curve = tapeCurve(P.asym);
        n.glue.threshold.value = P.gThr; n.glue.ratio.value = P.gRat; n.sHp.frequency.value = P.sizF; [n.wHp, n.wHp2].forEach(f=>f.frequency.value = P.wideF); };
      n.apply();
      /* PLUGIN MODE: n._mode 'RISE' (default = fader brings everything up to the knobs) or 'MIX' (knobs at full, fader fades dry → wet) */
      n.set = (v, sw, now)=>{ const P = n.P, s = (p, x)=>{ if(now == null) p.value = x; else p.setTargetAtTime(x, now, 0.03); };
        const mix = n._mode === 'MIX', u = mix ? 1 : v;   /* u = how hard the sound params go; v still sets the blend */
        const x = mix ? v : Math.min(1, v/P.full), d = 1 + Math.pow(u, 1.3)*(P.drvMax - 1);
        s(n.warm.gain, P.warmG*Math.min(1, u*1.5)); s(n.tape.gain, P.tapeG*u);
        s(n.drive.gain, d); s(n.trim.gain, 1/Math.sqrt(d));
        s(n.sG.gain, P.sizMix*u); s(n.sDrv.gain, 2 + u*4);
        s(n.dry.gain, Math.cos(x*Math.PI/2)); s(n.wet.gain, Math.sin(x*Math.PI/2));
        if(n.match) s(n.match.parameters.get('boost'), Math.pow(10, P.boost*u/20));
        s(n.wG.gain, sw ? P.wide*(.4 + .6*u) : 0);
        n._v = v; n._sw = !!sw; };
      n.taps = { WARMED:n.glue, SIZZLE:n.sG, FLAME:n.wet, WIDE:n.wG, OUT:n.out };
      n.info = ()=>{ const P = n.P, v = n._v || 0, x = Math.min(1, v/P.full), d = 1 + Math.pow(v, 1.3)*(P.drvMax - 1), hz = f=>f >= 1000 ? (f/1000).toFixed(1) + 'k' : Math.round(f) + '';
        return [
          { u:'WARM',   s:'+' + (P.warmG*Math.min(1, v*1.5)).toFixed(1) + ' dB under ' + hz(P.warmF) + ' Hz', note:'body before the heat' },
          { u:'TAPE',   s:(P.tapeG*v).toFixed(1) + ' dB above ' + hz(P.tapeF), note:'rounds the top like tape' },
          { u:'DRIVE',  s:d.toFixed(1) + 'x into a soft tape curve · even ' + P.asym.toFixed(2), note:'more even = warmer' },
          { u:'GLUE',   s:P.gRat.toFixed(1) + ':1 from ' + Math.round(P.gThr) + ' dB', note:'thickens, holds it together' },
          { u:'SIZZLE', s:Math.round(P.sizMix*v*100) + '% from ' + hz(P.sizF), note:'a little shine on top' },
          { u:'WIDE',   s:n._sw ? 'hot top spread from ' + hz(P.wideF) + ' · lows centred' : 'off', off:!n._sw, note:'the switch' },
          { u:'BLEND',  s:Math.round(x*100) + '% flame', note:'full from ' + Math.round(P.full*100) + '% fader' },
        ]; };
      return n; },
  };
  (window.TUNER_MODS = window.TUNER_MODS || {}).FLAME = FLAME;
})();
