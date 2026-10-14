/* GRINDER — chop patterns → RAGE → rhythm GATE (THREAT TUNER module, CHOP). LAB lab-17: grit = a real RAGE inside (his ⭐4 as the start), then a 16-step gate makes a new rhythm.
   older: LAB lab-16: SOUND FIRST — the look comes from listening.
   Alex 14 Oct, option C: hand-made chop patterns (no dice) on 1/4 or 1/8 pieces; moved pieces get dirty.
   Fader = pattern 1 (light) → 8 (wild) + more grit · Switch = FLIP (moved pieces backwards). Knobs + 🎲 in the LAB CHAIN panel. */
(function(){
  const GRINDER = {
    name:'GRINDER', acc:'#c8c2b8', screws:true, cat:'CHOP',
    desc:'chops the beat, rages it, gates it into a new rhythm', sw:'FLIP', swd:'moved pieces play backwards',
    face:'linear-gradient(#26231f,#12110f)',
    params:[
      { k:'sliceI', u:'CHOP', l:'piece size', min:0, max:1, def:0, step:1, names:['1/4','1/8'] },
      { k:'when',   u:'CHOP', l:'chops on',   min:0, max:2, def:0, step:1, names:['every bar','every 2nd bar','last of 4'] },
      { k:'rAmt',   u:'RAGE', l:'rage at top', min:0, max:1, def:.9, unit:'%' },
      { k:'rDrv',   u:'RAGE', l:'max drive',  min:2, max:60, def:20, unit:'x', log:1 },
      { k:'rClip',  u:'RAGE', l:'clip',       min:0, max:3, def:1, step:1, names:['SOFT','HARD','FOLD','FUZZ'] },
      { k:'rAsym',  u:'RAGE', l:'asym',       min:0, max:.6, def:.31 },
      { k:'rBellG', u:'RAGE', l:'bite @374',  min:-6, max:15, def:12.7, unit:'dB' },
      { k:'gDepth', u:'GATE', l:'depth',      min:0, max:1, def:1, unit:'%' },
      { k:'gRel',   u:'GATE', l:'fade out',   min:2, max:200, def:40, unit:'ms', log:1 },
      { k:'gAtt',   u:'GATE', l:'fade in',    min:.5, max:30, def:3, unit:'ms', log:1 },
      { k:'fade',   u:'EDGES', l:'edge fade', min:.5, max:12, def:4, unit:'ms', log:1 },
    ],
    /* placeholder face (look parked): one column per piece of the bar — moved pieces drop to the slot they play */
    g(v, st, n){ const map = (n && n._map) || '', N = (n && n._steps) || 4, flip = st && st.sw && st.sw.GRINDER;
      let s = ''; for(let i=0;i<N;i++){ const j = map ? +map[i] : i, mv = map && j !== i, w = 80/N, x = 10 + i*w;
        s += `<rect x="${(x + 1).toFixed(1)}" y="${(20 + j*260/N).toFixed(1)}" width="${(w - 2).toFixed(1)}" height="${(260/N - 3).toFixed(1)}" fill="${mv ? (flip ? '#ffb347' : '#ff5a1f') : '#3a3530'}"/>`; }
      return `<div class="scr" style="background:#080706"><svg class="f" viewBox="0 0 100 300" preserveAspectRatio="none">${s}</svg></div>`; },
    worklets:['modules/grinder.worklet.js'],
    build(ac, P0){ const n = {}; n.P = {}; GRINDER.params.forEach(p=>n.P[p.k] = p.def); Object.assign(n.P, P0 || {});
      n.node = new AudioWorkletNode(ac, 'grinder', { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2], processorOptions:{ P:n.P } });
      /* RAGE inside: starts from his ⭐4 (split 78, big bite @374, HARD, asym .31, top 9.8k) */
      const R = window.TUNER_MODS.RAGE, rP = ()=>({ split:78, bellF:374, bellG:n.P.rBellG, bellQ:1.77, drvMax:n.P.rDrv, clip:Math.round(n.P.rClip), asym:n.P.rAsym, toneHi:9800, boost:.5, full:.4 });
      n.rage = R.build(ac, rP());
      n.gate = new AudioWorkletNode(ac, 'grinder', { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2], processorOptions:{ mode:'gate', G:{ depth:n.P.gDepth, att:n.P.gAtt, rel:n.P.gRel } } });
      n.node.connect(n.rage.in); n.rage.out.connect(n.gate);
      n.gate.port.onmessage = e=>{ n._gmap = e.data.gmap; };
      n.in = n.node; n.out = n.gate; n._pat = -1; n._map = ''; n._steps = 4; n._drive = 1;
      n.node.port.onmessage = e=>{ const d = e.data; n._pat = d.pat; n._map = d.map; n._steps = d.steps; n._drive = d.drive; n._mix = d.mix; };
      const rv = v=>v > .04 ? n.P.rAmt*Math.min(1, .35 + (v - .04)/.96*.65) : 0;   /* rage kicks in hard right away, more as you push */
      n.apply = ()=>{ n.node.port.postMessage({ P:n.P }); Object.assign(n.rage.P, rP()); n.rage.apply(); n.rage.set(rv(n._v || 0), false);
        n.gate.port.postMessage({ G:{ depth:n.P.gDepth, att:n.P.gAtt, rel:n.P.gRel } }); };
      n.set = (v, sw, now)=>{ n._v = v; n._sw = !!sw; n.node.port.postMessage({ v, sw:!!sw }); n.gate.port.postMessage({ v }); n.rage.set(rv(v), false, now); };
      /* the transport hands over the whole loop up front: that's what gets chopped */
      n.transport = (o, buf)=>{ const m = Object.assign({}, o); if(buf){ m.ch0 = buf.getChannelData(0).slice(); m.ch1 = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice(); }
        n.node.port.postMessage(m); n.gate.port.postMessage({ t0:o.t0, bs:o.bs, loopBeats:o.loopBeats, len:buf ? buf.length : undefined }); };
      n.taps = { CHOP:n.node, RAGED:n.rage.out, OUT:n.gate };
      n.info = ()=>{ const P = n.P, on = n._pat >= 0;
        return [
          { u:'CHOP',  s:on ? 'pattern ' + (n._pat + 1) + ' of 8 · ' + (n._map ? n._map.split('').map(c=>+c + 1).join(' ') : '') + ' · ' + ['every bar','every 2nd bar','last bar of 4'][Math.round(P.when)] : 'off (fader under 4%)', note:(Math.round(P.sliceI) ? '1/8' : '1/4') + ' pieces · fader = lightest → wildest' },
          { u:'RAGE',  s:on ? 'rage ' + Math.round(rv(n._v || 0)*100) + '% · ' + ['SOFT','HARD','FOLD','FUZZ'][Math.round(P.rClip)] + ' · max ' + Math.round(P.rDrv) + 'x' : 'off', note:'a real RAGE inside, from your ⭐4' },
          { u:'GATE',  s:on && n._gmap ? n._gmap.replace(/1/g, '▮').replace(/0/g, '·') : 'open', note:'16 steps · fade in ' + P.gAtt.toFixed(1) + ' / out ' + Math.round(P.gRel) + ' ms · depth ' + Math.round(P.gDepth*100) + '%' },
          { u:'FLIP',  s:n._sw ? 'moved pieces play backwards' : 'off', off:!n._sw, note:'the switch' },
          { u:'EDGES', s:P.fade.toFixed(1) + ' ms fades', note:'shorter = punchier, longer = smoother' },
        ]; };
      return n; },
  };
  (window.TUNER_MODS = window.TUNER_MODS || {}).GRINDER = GRINDER;
})();
