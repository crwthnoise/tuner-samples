/* GRINDER — pattern chopper + grit (THREAT TUNER module, CHOP). LAB lab-16: SOUND FIRST — the look comes from listening.
   Alex 14 Oct, option C: hand-made chop patterns (no dice) on 1/4 or 1/8 pieces; moved pieces get dirty.
   Fader = pattern 1 (light) → 8 (wild) + more grit · Switch = FLIP (moved pieces backwards). Knobs + 🎲 in the LAB CHAIN panel. */
(function(){
  const GRINDER = {
    name:'GRINDER', acc:'#c8c2b8', screws:true, cat:'CHOP',
    desc:'chops the beat in set patterns and dirties the moved pieces', sw:'FLIP', swd:'moved pieces play backwards',
    face:'linear-gradient(#26231f,#12110f)',
    params:[
      { k:'sliceI', u:'CHOP', l:'piece size', min:0, max:1, def:0, step:1, names:['1/4','1/8'] },
      { k:'when',   u:'CHOP', l:'chops on',   min:0, max:2, def:0, step:1, names:['every bar','every 2nd bar','last of 4'] },
      { k:'drv',    u:'GRIT', l:'drive at top', min:1, max:30, def:6, unit:'x', log:1 },
      { k:'clip',   u:'GRIT', l:'clip',       min:0, max:1, def:1, step:1, names:['SOFT','HARD'] },
      { k:'asym',   u:'GRIT', l:'asym',       min:0, max:1, def:.31 },
      { k:'trim',   u:'GRIT', l:'level',      min:.3, max:2, def:1, unit:'x' },
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
      n.in = n.node; n.out = n.node; n._pat = -1; n._map = ''; n._steps = 4; n._drive = 1;
      n.node.port.onmessage = e=>{ const d = e.data; n._pat = d.pat; n._map = d.map; n._steps = d.steps; n._drive = d.drive; n._mix = d.mix; };
      n.apply = ()=>n.node.port.postMessage({ P:n.P });
      n.set = (v, sw)=>{ n._v = v; n._sw = !!sw; n.node.port.postMessage({ v, sw:!!sw }); };
      /* the transport hands over the whole loop up front: that's what gets chopped */
      n.transport = (o, buf)=>{ const m = Object.assign({}, o); if(buf){ m.ch0 = buf.getChannelData(0).slice(); m.ch1 = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice(); }
        n.node.port.postMessage(m); };
      n.taps = { OUT:n.node };
      n.info = ()=>{ const P = n.P, on = n._pat >= 0;
        return [
          { u:'CHOP',  s:on ? 'pattern ' + (n._pat + 1) + ' of 8 · ' + (n._map ? n._map.split('').map(c=>+c + 1).join(' ') : '') + ' · ' + ['every bar','every 2nd bar','last bar of 4'][Math.round(P.when)] : 'off (fader under 4%)', note:(Math.round(P.sliceI) ? '1/8' : '1/4') + ' pieces · fader = lightest → wildest' },
          { u:'GRIT',  s:on ? (Math.round(P.clip) ? 'HARD' : 'SOFT') + ' clip · drive ' + n._drive.toFixed(1) + 'x on moved pieces' : '—', note:'gets dirtier as the fader goes up (top = ' + P.drv.toFixed(1) + 'x)' },
          { u:'FLIP',  s:n._sw ? 'moved pieces play backwards' : 'off', off:!n._sw, note:'the switch' },
          { u:'EDGES', s:P.fade.toFixed(1) + ' ms fades', note:'shorter = punchier, longer = smoother' },
        ]; };
      return n; },
  };
  (window.TUNER_MODS = window.TUNER_MODS || {}).GRINDER = GRINDER;
})();
