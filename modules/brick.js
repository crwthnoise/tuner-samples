/* BRICK — CRUDE (THREAT TUNER module, DRIVE). LAB lab-19: SOUND FIRST — look gets redone after.
   Alex 14 Oct: "crude = brick" → one brutal hard clip. No level match, no polish: louder + flatter, like slamming a channel into the red.
   Fader = how hard you slam it. Hero knobs (PLUGIN MODE): CLIP · TONE · MIX. Switch = TWICE: a second clipper right after the first = even flatter, more crunch.
   Chain: TONE tilt (pre, 0 = untouched) → DRIVE 1→30x → HARD CLIP (flat top, tiny knee) → [TWICE: +6 dB → clip again] → CEILING → MIX */
(function(){
  const curves = new Map();
  /* hard clip: straight line up to the ceiling, then flat. knee 0 = pure brick wall, a bit = the corner rounded off */
  function clipCurve(knee){ const key = knee.toFixed(3); if(curves.has(key)) return curves.get(key); const n = 8192, c = new Float32Array(n), t = 1 - knee;
    for(let i=0;i<n;i++){ const x = (i*2/(n - 1) - 1)*4, a = Math.abs(x);   /* curve covers ±4 so driven signal still lands on it */
      let y; if(a <= t) y = a; else if(knee > 0) y = t + knee*Math.tanh((a - t)/knee); else y = 1;
      c[i] = Math.sign(x)*Math.min(1, y); } curves.set(key, c); return c; }
  const BRICK = {
    name:'BRICK', acc:'#d63a2a', screws:true, cat:'DRIVE',
    desc:'slam it into the red', sw:'TWICE', swd:'clips it a second time — flatter, harder',
    face:'linear-gradient(#2a0d0a,#120504)',
    hero:['drvMax','tone','mix'],   /* PLUGIN MODE: the 3 knobs users see (CLIP · TONE · MIX) */
    params:[
      { k:'drvMax', u:'CLIP',  l:'max slam',     min:2,   max:60,  def:30,  unit:'x', log:1 },
      { k:'knee',   u:'CLIP',  l:'corner',       min:0,   max:.4,  def:.03 },
      { k:'tone',   u:'TONE',  l:'dark ← → bright', min:-9, max:9, def:0,   unit:'dB' },
      { k:'ceil',   u:'CEILING', l:'output',     min:-6,  max:0,   def:-.5, unit:'dB' },
      { k:'full',   u:'MIX',   l:'full brick at', min:.05, max:1,  def:.2,  unit:'%' },
      { k:'mix',    u:'MIX',   l:'wet',          min:0,   max:1,   def:1,   unit:'%' },
    ],
    /* placeholder face: a red wall that gets flatter-topped as you slam it */
    g(v, st){ const w = st && st.sw && st.sw.BRICK, top = 150 - v*120, rows = [];
      for(let r=0;r<6;r++){ const y = 300 - (r + 1)*((300 - top)/6); for(let c=0;c<3;c++){ const x = (r % 2 ? -14 : 4) + c*36;
        rows.push(`<rect x="${x}" y="${y.toFixed(1)}" width="32" height="${((300 - top)/6 - 3).toFixed(1)}" fill="${w ? '#ff4a30' : '#d63a2a'}" opacity="${(.35 + v*.6).toFixed(2)}"/>`); } }
      return `<div class="scr" style="background:#0a0303"><svg class="f" viewBox="0 0 100 300" preserveAspectRatio="none">${rows.join('')}</svg></div>`; },
    build(ac, P0){ const G = v=>{ const g = ac.createGain(); g.gain.value = v; return g; }, F = (type, f, gn)=>{ const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = .7; if(gn != null) x.gain.value = gn; return x; }; const n = {};
      n.P = {}; BRICK.params.forEach(p=>n.P[p.k] = p.def); Object.assign(n.P, P0 || {});
      n.in = G(1); n.out = G(1); n.dry = G(1); n.wet = G(0);
      n.lo = F('lowshelf', 900, 0); n.hi = F('highshelf', 900, 0);   /* TONE tilt around 900 Hz, before the clip */
      n.drive = G(1); n.clip = ac.createWaveShaper(); n.clip.oversample = '2x';   /* 2x: keeps some grit, kills the worst fizz */
      n.twiceG = G(2); n.clip2 = ac.createWaveShaper(); n.clip2.oversample = 'none';   /* 2nd clip raw = stays under the ceiling, extra crunch */
      n.one = G(1); n.two = G(0); n.ceil = G(1);   /* no DC filter: the curve is symmetric, and a highpass after a square-ish wave overshoots way past the ceiling */
      n.in.connect(n.dry); n.dry.connect(n.out);
      n.in.connect(n.lo); n.lo.connect(n.hi); n.hi.connect(n.drive); n.drive.connect(n.clip);
      n.clip.connect(n.one); n.one.connect(n.ceil);
      n.clip.connect(n.twiceG); n.twiceG.connect(n.clip2); n.clip2.connect(n.two); n.two.connect(n.ceil);
      n.ceil.connect(n.wet); n.wet.connect(n.out);
      n.apply = ()=>{ const P = n.P, c = clipCurve(P.knee); n.clip.curve = c; n.clip2.curve = c; n._toneSet = null; if(n._v != null) n.set(n._v, n._sw); };
      n.apply();
      n.set = (v, sw, now)=>{ const P = n.P, s = (p, x)=>{ if(now == null) p.value = x; else p.setTargetAtTime(x, now, 0.02); };
        const d = 1 + Math.pow(v, 1.2)*(P.drvMax - 1), x = Math.min(1, v/P.full)*P.mix;
        s(n.lo.gain, -P.tone/2); s(n.hi.gain, P.tone/2);
        s(n.drive.gain, d/4);   /* curve spans ±4 → /4 maps ±1 in to ±1 on the curve's input */
        s(n.one.gain, sw ? 0 : 1); s(n.two.gain, sw ? 1 : 0);
        s(n.ceil.gain, Math.pow(10, P.ceil/20));
        s(n.dry.gain, Math.cos(x*Math.PI/2)); s(n.wet.gain, Math.sin(x*Math.PI/2));
        n._v = v; n._sw = !!sw; };
      n.taps = { CLIPPED:n.one, TWICE:n.two, BRICK:n.wet, OUT:n.out };
      n.info = ()=>{ const P = n.P, v = n._v || 0, d = 1 + Math.pow(v, 1.2)*(P.drvMax - 1), x = Math.min(1, v/P.full)*P.mix;
        return [
          { u:'TONE',    s:P.tone === 0 ? 'flat' : (P.tone > 0 ? '+' : '') + P.tone.toFixed(1) + ' dB tilt', off:P.tone === 0, note:'before the clip' },
          { u:'CLIP',    s:d.toFixed(1) + 'x into a brick wall · corner ' + P.knee.toFixed(2), note:'the fader = how hard' },
          { u:'TWICE',   s:n._sw ? '+6 dB → clipped again' : 'off', off:!n._sw, note:'the switch' },
          { u:'CEILING', s:P.ceil.toFixed(1) + ' dB', note:'no level match — it gets LOUD' },
          { u:'MIX',     s:Math.round(x*100) + '% brick', note:'full from ' + Math.round(P.full*100) + '% fader' },
        ]; };
      return n; },
  };
  (window.TUNER_MODS = window.TUNER_MODS || {}).BRICK = BRICK;
})();
