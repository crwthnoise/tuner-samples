/* GRINDER — slice shuffler (THREAT TUNER module, CHOP). LAB lab-15: SOUND FIRST — the look comes from listening.
   Alex 14 Oct: cut the whole loop up BEFORE it plays; the more you turn it up, the more slices move around — on beat.
   Fader = how many slices move · Switch = FLIP (moved slices play backwards). Knobs + 🎲 in the LAB CHAIN panel. */
(function(){
  const SL = ['1/32','1/16','1/8','1/4'];
  const GRINDER = {
    name:'GRINDER', acc:'#c8c2b8', screws:true, cat:'CHOP',
    desc:'cuts the loop up and moves the pieces around, on beat', sw:'FLIP', swd:'moved pieces play backwards',
    face:'linear-gradient(#26231f,#12110f)',
    params:[
      { k:'sliceI', u:'SLICE', l:'slice size',   min:0, max:3, def:1, step:1, names:SL },
      { k:'reach',  u:'MOVE',  l:'moves within', min:0, max:2, def:0, step:1, names:['whole loop','same bar','same beat'] },
      { k:'hold',   u:'MOVE',  l:'new pattern',  min:0, max:4, def:1, step:1, names:['every bar','every 2 bars','every 4','every 8','never'] },
      { k:'rep',    u:'STUTTER', l:'repeat chance', min:0, max:.8, def:0, unit:'%' },
      { k:'fade',   u:'EDGES', l:'edge fade',    min:.5, max:12, def:3, unit:'ms', log:1 },
    ],
    /* placeholder face (look parked): the loop as a column of slices — moved ones light up */
    g(v, st, n){ const map = (n && n._map) || '', N = map.length || 16, flip = st && st.sw && st.sw.GRINDER;
      let s = ''; for(let i=0;i<N;i++){ const on = map[i] === '1', h = 260/N, y = 20 + i*h;
        s += `<rect x="${on ? 38 : 30}" y="${y.toFixed(1)}" width="${on ? 50 : 40}" height="${Math.max(1, h - 1.2).toFixed(1)}" fill="${on ? (flip ? '#ffb347' : '#e8e2d8') : '#3a3530'}" opacity="${on ? .95 : .6}"/>`; }
      return `<div class="scr" style="background:#080706"><svg class="f" viewBox="0 0 100 300" preserveAspectRatio="none">${s}</svg></div>`; },
    worklets:['modules/grinder.worklet.js'],
    build(ac, P0){ const n = {}; n.P = {}; GRINDER.params.forEach(p=>n.P[p.k] = p.def); Object.assign(n.P, P0 || {});
      n.node = new AudioWorkletNode(ac, 'grinder', { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2], processorOptions:{ P:n.P } });
      n.in = n.node; n.out = n.node; n._moved = 0; n._of = 0; n._map = '';
      n.node.port.onmessage = e=>{ const d = e.data; n._moved = d.moved; n._of = d.of; n._map = d.map; n._mix = d.mix; };
      n.apply = ()=>n.node.port.postMessage({ P:n.P });
      n.set = (v, sw)=>{ n._v = v; n._sw = !!sw; n.node.port.postMessage({ v, sw:!!sw }); };
      /* the transport hands over the whole loop up front: that's what gets cut */
      n.transport = (o, buf)=>{ const m = Object.assign({}, o); if(buf){ m.ch0 = buf.getChannelData(0).slice(); m.ch1 = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice(); }
        n.node.port.postMessage(m); };
      n.taps = { OUT:n.node };
      n.info = ()=>{ const P = n.P, v = n._v || 0, on = v > .04;
        return [
          { u:'SLICE',   s:'loop cut into ' + SL[Math.round(P.sliceI)] + ' pieces' + (n._of ? ' (' + n._of + ')' : ''), note:'smaller = more glitchy' },
          { u:'MOVE',    s:on ? n._moved + ' of ' + n._of + ' pieces moved · ' + ['anywhere','within the bar','within the beat'][Math.round(P.reach)] : 'off (fader under 4%)', note:'fader = how many move · new pattern ' + ['every bar','every 2 bars','every 4 bars','every 8 bars','never'][Math.round(P.hold)] },
          { u:'STUTTER', s:P.rep > .01 ? Math.round(P.rep*100) + '% of moved pieces repeat the one before' : 'off', off:P.rep <= .01, note:'double-hits' },
          { u:'FLIP',    s:n._sw ? 'moved pieces play backwards' : 'off', off:!n._sw, note:'the switch' },
          { u:'EDGES',   s:P.fade.toFixed(1) + ' ms fades', note:'shorter = punchier, longer = smoother' },
        ]; };
      return n; },
  };
  (window.TUNER_MODS = window.TUNER_MODS || {}).GRINDER = GRINDER;
})();
