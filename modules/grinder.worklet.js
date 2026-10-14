/* GRINDER — machine-gun beat repeat (THREAT TUNER module, CHOP) — LAB lab-13, sound first, look later.
   On the grid it GRABS a tiny piece of what's playing and fires it again and again, like a machine gun.
   Fader = how fast it fires: 1/8 → 1/16 → 1/32 → 1/64 (faster = grinds into a buzz).
   Switch = DIVE: every burst drops in pitch as it goes (the "falling machine" sound).
   Everything is locked to the beat (t0 + beat length come from the transport), so it stays on grid. */
class GrinderProcessor extends AudioWorkletProcessor {
  constructor(opt){ super(); this.N = Math.ceil(sampleRate*8); this.b0 = new Float32Array(this.N); this.b1 = new Float32Array(this.N); this.w = 0;
    this.t0 = 0; this.bs = 0.5; this.run = true; this.v = 0; this.sw = false;
    this.P = { grabI:2, divLo:1, divHi:4, gate:.85, dive:12, grit:1, fade:2, full:.12 };
    this.grabKey = -1; this.gStart = 0; this.gLen = 1; this.k = 0; this.mix = 0; this.tick = 0;
    const po = (opt && opt.processorOptions) || {}; this.msg(po);
    this.port.onmessage = e=>this.msg(e.data || {}); }
  msg(d){ ['t0','bs','v'].forEach(k=>{ if(d[k] != null) this[k] = +d[k]; }); if(d.sw != null) this.sw = !!d.sw; if(d.P) Object.assign(this.P, d.P);
    if(d.run != null) this.run = !!d.run; if(d.reset){ this.grabKey = -1; } }
  /* which repeat size is on now: fader steps through the divisions (in beats: 1/8 note = .5 beat … 1/64 = .0625) */
  div(){ const D = [1, .5, .25, .125, .0625], lo = Math.round(this.P.divLo), hi = Math.round(this.P.divHi), a = Math.min(lo, hi), b = Math.max(lo, hi);
    const on = Math.max(0, (this.v - .04)/.96), steps = b - a + 1, i = Math.min(steps - 1, Math.floor(on*steps));
    return { beats: D[lo <= hi ? a + i : b - i], name: ['1/4','1/8','1/16','1/32','1/64'][lo <= hi ? a + i : b - i] }; }
  process(ins, outs){
    const out = outs[0], n = out[0].length, inp = ins[0] || [], i0 = inp[0], i1 = inp[1] || i0, sr = sampleRate, N = this.N, P = this.P;
    const active = this.run && this.v > .04, dv = this.div(), L = Math.max(16, Math.round(dv.beats*this.bs*sr));
    const mixT = active ? Math.min(1, this.v/Math.max(.01, P.full)) : 0, fadeN = Math.max(8, P.fade*.001*sr), grabBeats = [.25, .5, 1, 2, 4][Math.max(0, Math.min(4, Math.round(P.grabI)))];
    const g = P.grit, gn = g > 1.01 ? 1/Math.tanh(g) : 1;
    for(let k=0;k<n;k++){
      const x0 = i0 ? i0[k] : 0, x1 = i1 ? i1[k] : 0, w = this.w; this.b0[w] = x0; this.b1[w] = x1;
      this.mix += (mixT - this.mix)*0.002;
      let y0 = x0, y1 = x1;
      const beat = ((currentFrame + k)/sr - this.t0)/this.bs;
      if(this.mix > 1e-4 && beat >= 0){
        const key = Math.floor(beat/grabBeats);
        if(key !== this.grabKey){ this.grabKey = key; this.gStart = w; this.k = 0; this.gLen = L; }   /* new grab: the next L samples get recorded, then fired again and again */
        const len = this.gLen, kk = this.k, ph = ((beat/grabBeats) % 1 + 1) % 1;   /* ph = how far through this burst (0..1) for the DIVE */
        let r0 = x0, r1 = x1;
        if(kk >= len){
          const rate = this.sw ? Math.pow(2, -P.dive*ph/12) : 1, pos = (kk % len)*rate, ip = Math.floor(pos), fr = pos - ip;
          const a = (this.gStart + ip) % N, b = (a + 1) % N;
          r0 = this.b0[a] + (this.b0[b] - this.b0[a])*fr; r1 = this.b1[a] + (this.b1[b] - this.b1[a])*fr;
          const q = kk % len, open = len*P.gate, env = q < fadeN ? q/fadeN : (q > open ? 0 : (q > open - fadeN ? (open - q)/fadeN : 1));   /* tiny fades = no clicks; GATE = gap between hits */
          r0 *= env; r1 *= env;
          if(g > 1.01){ r0 = Math.tanh(r0*g)*gn; r1 = Math.tanh(r1*g)*gn; }
        }
        this.k++;
        y0 = x0*(1 - this.mix) + r0*this.mix; y1 = x1*(1 - this.mix) + r1*this.mix;
      } else if(this.mix <= 1e-4) this.grabKey = -1;
      out[0][k] = y0; if(out[1]) out[1][k] = y1;
      this.w = (w + 1) % N;
    }
    if(++this.tick % 24 === 0) this.port.postMessage({ div:dv.name, mix:this.mix });
    return true; }
}
registerProcessor('grinder', GrinderProcessor);
