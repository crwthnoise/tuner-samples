/* SKY — huge reverb that opens up the sky (THREAT TUNER module, SPACE).
   Fader = how much sky (wet up, dry tucks back a little at the top). Switch = SHIMMER: the tail gets fed back an octave up = sparkle that climbs.
   One file, used by the MODULE LAB and the app, so what you tune in the LAB is what ships. */
(function(){
  const irCache = new Map();
  function rng(seed){ let s = seed >>> 0; return ()=>{ s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s/4294967296; }; }
  function skyIR(ac){ const key = ac.sampleRate; if(irCache.has(key)) return irCache.get(key);
    const sr = ac.sampleRate, len = Math.round(sr*5.2), b = ac.createBuffer(2, len, sr);
    for(let c=0;c<2;c++){ const d = b.getChannelData(c), r = rng(1234 + c*777); let lp = 0;
      for(let i=0;i<len;i++){ const t = i/sr; const env = Math.exp(-t*1.25) * (t < 0.08 ? t/0.08 : 1);   /* slow bloom in, long tail */
        const x = r()*2 - 1; const k = 0.55 + 0.4*Math.exp(-t*0.6); lp += (x - lp)*k;                 /* gets darker as it fades */
        d[i] = lp*env; } }
    irCache.set(key, b); return b; }
  const SKY = {
    name:'SKY', acc:'#9ad0ff', face:'#070a12', screws:false, cat:'SPACE',
    desc:'huge reverb — opens up the sky', sw:'SHIMMER', swd:'the tail sparkles an octave up',
    worklets:['modules/shift.worklet.js'],
    g(v){ return `<div class="scr" style="background:linear-gradient(0deg,#ff9a5a 0%,#6a5a9a ${30+v*20}%,#0a1430 100%)"><div style="position:absolute;left:50%;bottom:${v*70-10}%;width:40%;aspect-ratio:1;transform:translateX(-50%);border-radius:50%;background:radial-gradient(#fff6d8,#ffd27a 60%,transparent 72%);box-shadow:0 0 30px #ffd27a"></div>${[0,1,2,3].map(k=>`<div style="position:absolute;top:${10+k*20}%;${k%2?'right':'left'}:${-10-v*40}%;width:70%;height:12%;border-radius:50%;background:#dfe6f2;filter:blur(3px);opacity:.75"></div>`).join('')}</div>`; },
    build(ac){ const G = v=>{ const g = ac.createGain(); g.gain.value = v; return g; }; const n = {};
      n.in = G(1); n.out = G(1); n.dry = G(1); n.wet = G(0);
      n.hp = ac.createBiquadFilter(); n.hp.type = 'highpass'; n.hp.frequency.value = 220; n.hp.Q.value = 0.6;   /* lows stay clean, no mud */
      n.pre = ac.createDelay(0.5); n.pre.delayTime.value = 0.03;
      n.conv = ac.createConvolver(); n.conv.normalize = true; n.conv.buffer = skyIR(ac);
      n.in.connect(n.dry); n.dry.connect(n.out);
      n.in.connect(n.hp); n.hp.connect(n.pre); n.pre.connect(n.conv); n.conv.connect(n.wet); n.wet.connect(n.out);
      n.fb = G(0); n.fbDel = ac.createDelay(0.5); n.fbDel.delayTime.value = 0.04;
      try{ n.shift = new AudioWorkletNode(ac, 'shift', { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2], processorOptions:{ ratio:2 } }); }catch(e){ n.shift = null; }
      if(n.shift){ n.conv.connect(n.fb); n.fb.connect(n.fbDel); n.fbDel.connect(n.shift); n.shift.connect(n.pre); }
      n.set = (v, sw, now)=>{ const s = (p, x)=>{ if(now == null) p.value = x; else p.setTargetAtTime(x, now, 0.05); };
        s(n.wet.gain, Math.min(1.4, v*1.6)); s(n.dry.gain, 1 - v*0.35); s(n.fb.gain, sw ? 0.5*Math.min(1, v*1.6) : 0); };
      return n; },
    skyIR,
  };
  (window.TUNER_MODS = window.TUNER_MODS || {}).SKY = SKY;
})();
