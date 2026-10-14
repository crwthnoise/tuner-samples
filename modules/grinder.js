/* GRINDER — machine-gun beat repeat (THREAT TUNER module, CHOP). LAB lab-13: SOUND FIRST — the look comes from listening (Alex, 13 Oct).
   Fader = fire rate 1/8 → 1/64 · Switch = DIVE (each burst drops in pitch). Knobs + 🎲 in the LAB CHAIN panel. */
(function(){
  const GRINDER = {
    name:'GRINDER', acc:'#c8c2b8', screws:true, cat:'CHOP',
    desc:'machine-gun repeats that grind into a buzz', sw:'DIVE', swd:'every burst drops in pitch',
    face:'linear-gradient(#26231f,#12110f)',
    params:[
      { k:'grabI', u:'GRAB',   l:'grab every', min:0,   max:4,  def:2,   step:1, names:['1/16','1/8','1/4','1/2','1 bar'] },
      { k:'divLo', u:'REPEAT', l:'slowest',    min:0,   max:4,  def:1,   step:1, names:['1/4','1/8','1/16','1/32','1/64'] },
      { k:'divHi', u:'REPEAT', l:'fastest',    min:0,   max:4,  def:4,   step:1, names:['1/4','1/8','1/16','1/32','1/64'] },
      { k:'gate',  u:'GATE',   l:'hit length', min:.15, max:1,  def:.85, unit:'%' },
      { k:'fade',  u:'GATE',   l:'edge fade',  min:.5,  max:12, def:2,   unit:'ms', log:1 },
      { k:'dive',  u:'DIVE',   l:'drop',       min:1,   max:36, def:12,  unit:'st' },
      { k:'grit',  u:'GRIT',   l:'drive',      min:1,   max:12, def:1,   unit:'x', log:1 },
      { k:'full',  u:'MIX',    l:'full wet at', min:.05, max:.6, def:.12, unit:'%' },
    ],
    /* placeholder face (look parked): a bare grid of hits that fills faster as the fader goes up */
    g(v, st){ const D = ['1/4','1/8','1/16','1/32','1/64'], on = v > .04, hits = on ? [2, 4, 8, 16, 32][Math.min(4, 1 + Math.floor(Math.max(0, (v - .04)/.96)*4))] : 0;
      let s = ''; for(let i=0;i<10;i++){ const yy = 292 - 278*i/10; s += `<line x1="3" x2="${i%5 ? 12 : 20}" y1="${yy}" y2="${yy}" stroke="#6a625a" stroke-width="1.6"/>`; }
      for(let i=0;i<hits;i++){ const y = 20 + i*(260/hits); s += `<rect x="30" y="${y.toFixed(1)}" width="50" height="${Math.max(1.5, 260/hits*.6).toFixed(1)}" fill="${st && st.sw && st.sw.GRINDER ? '#ffb347' : '#e8e2d8'}" opacity="${(.35 + v*.6).toFixed(2)}"/>`; }
      return `<div class="scr" style="background:#080706"><svg class="f" viewBox="0 0 100 300" preserveAspectRatio="none">${s}</svg></div>`; },
    worklets:['modules/grinder.worklet.js'],
    build(ac, P0){ const n = {}; n.P = {}; GRINDER.params.forEach(p=>n.P[p.k] = p.def); Object.assign(n.P, P0 || {});
      n.node = new AudioWorkletNode(ac, 'grinder', { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2], processorOptions:{ P:n.P } });
      n.in = n.node; n.out = n.node; n._div = '—';
      n.node.port.onmessage = e=>{ if(e.data.div) n._div = e.data.div; n._mix = e.data.mix; };
      n.apply = ()=>n.node.port.postMessage({ P:n.P });
      n.set = (v, sw)=>{ n._v = v; n._sw = !!sw; n.node.port.postMessage({ v, sw:!!sw }); };
      n.transport = o=>n.node.port.postMessage(o);
      n.taps = { OUT:n.node };
      n.info = ()=>{ const P = n.P, v = n._v || 0, on = v > .04, N = ['1/4','1/8','1/16','1/32','1/64'];
        return [
          { u:'GRAB',   s:'grabs fresh audio every ' + ['1/16','1/8','1/4 (1 beat)','1/2','1 bar'][Math.round(P.grabI)], note:'how often it takes a new piece of the loop' },
          { u:'REPEAT', s:on ? 'firing ' + n._div + '  (range ' + N[Math.round(P.divLo)] + ' → ' + N[Math.round(P.divHi)] + ')' : 'off (fader under 4%)', note:'fader steps through the range' },
          { u:'GATE',   s:Math.round(P.gate*100) + '% hit · ' + P.fade.toFixed(1) + ' ms fades', note:'shorter = choppier gaps between hits' },
          { u:'DIVE',   s:n._sw ? '−' + Math.round(P.dive) + ' semitones per burst' : 'off', off:!n._sw, note:'the switch' },
          { u:'GRIT',   s:P.grit > 1.01 ? 'tanh drive ' + P.grit.toFixed(1) + 'x on the repeats' : 'clean', note:'dirt on the repeats only' },
          { u:'MIX',    s:Math.round((n._mix || 0)*100) + '% repeats', note:'full wet from ' + Math.round(P.full*100) + '% fader' },
        ]; };
      return n; },
  };
  (window.TUNER_MODS = window.TUNER_MODS || {}).GRINDER = GRINDER;
})();
