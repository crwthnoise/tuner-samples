/* GRINDER — slice shuffler (THREAT TUNER module, CHOP) — LAB lab-15, sound first, look later.
   Alex 14 Oct: "cut up the whole sample before you even play it, and the more you turn it up, the more it moves things around — on beat."
   The whole loop is cut into grid slices up front (1/16 by default). Fader = how many slices get moved to another spot.
   Every slice has a fixed "turn" (when it starts moving) and a fixed new spot, so turning up adds MORE moves, it never jitters.
   A new pattern is rolled every HOLD bars. Switch = FLIP: moved slices play backwards. Everything stays on the beat grid. */
class GrinderProcessor extends AudioWorkletProcessor {
  constructor(opt){ super(); this.b0 = null; this.b1 = null; this.len = 0; this.loopBeats = 4;
    this.t0 = 0; this.bs = 0.5; this.run = true; this.v = 0; this.sw = false; this.seed = 1;
    this.P = { sliceI:1, reach:0, hold:1, rep:0, fade:3 };
    this.pat = -1; this.rank = []; this.dst = []; this.repF = []; this.nS = 0; this.mix = 0; this.tick = 0; this.lastMap = '';
    const po = (opt && opt.processorOptions) || {}; this.msg(po);
    this.port.onmessage = e=>this.msg(e.data || {}); }
  msg(d){ ['t0','bs','v','loopBeats','seed'].forEach(k=>{ if(d[k] != null) this[k] = +d[k]; }); if(d.sw != null) this.sw = !!d.sw;
    if(d.P){ Object.assign(this.P, d.P); this.pat = -1; }
    if(d.run != null) this.run = !!d.run; if(d.reset) this.pat = -1;
    if(d.ch0){ this.b0 = d.ch0; this.b1 = d.ch1 || d.ch0; this.len = this.b0.length; this.pat = -1; } }
  rnd(){ this.s = (this.s*1664525 + 1013904223) >>> 0; return this.s/4294967296; }
  sliceBeats(){ return [.125, .25, .5, 1][Math.max(0, Math.min(3, Math.round(this.P.sliceI)))]; }
  /* roll a pattern: each slice gets a rank (0..1 = how far up the fader before it moves), a new spot, and a stutter flag */
  roll(key){ const sb = this.sliceBeats(), nS = Math.max(1, Math.round(this.loopBeats/sb)); this.nS = nS; this.s = (this.seed*7919 + key*104729 + 12345) >>> 0;
    const reachS = [nS, Math.round(4/sb), Math.round(1/sb)][Math.max(0, Math.min(2, Math.round(this.P.reach)))];   /* ANY spot · same bar · same beat */
    this.rank = []; this.dst = []; this.repF = [];
    for(let i=0;i<nS;i++){
      this.rank.push(this.rnd());
      let j = i; for(let t=0;t<6 && j === i;t++){ const lo = reachS >= nS ? 0 : Math.floor(i/reachS)*reachS; j = Math.min(nS - 1, lo + Math.floor(this.rnd()*Math.min(reachS, nS))); }
      this.dst.push(j); this.repF.push(this.rnd()); } }
  process(ins, outs){
    const out = outs[0], n = out[0].length, inp = ins[0] || [], i0 = inp[0], i1 = inp[1] || i0, sr = sampleRate, P = this.P;
    const amt = this.run && this.b0 && this.v > .04 ? (this.v - .04)/.96 : 0;
    const sb = this.sliceBeats(), spb = this.len/Math.max(1, this.loopBeats), sliceN = sb*spb, fadeN = Math.max(16, P.fade*.001*sr);
    const holdBeats = [1, 2, 4, 8, 1e9][Math.max(0, Math.min(4, Math.round(P.hold)))]*4;
    for(let k=0;k<n;k++){
      const x0 = i0 ? i0[k] : 0, x1 = i1 ? i1[k] : 0;
      this.mix += ((amt > 0 ? 1 : 0) - this.mix)*0.004;
      let y0 = x0, y1 = x1;
      const beat = ((currentFrame + k)/sr - this.t0)/this.bs;
      if(this.mix > 1e-4 && beat >= 0 && this.len){
        const key = Math.floor(beat/holdBeats); if(key !== this.pat){ this.pat = key; this.roll(key); }
        const lb = beat % this.loopBeats, si = Math.min(this.nS - 1, Math.floor(lb/sb)), inS = (lb - si*sb)*spb;   /* inS = samples into this slice */
        if(this.rank[si] < amt){
          let j = this.dst[si];
          if(P.rep > 0 && this.repF[si] < P.rep && si > 0) j = si - 1 >= 0 && this.rank[si - 1] < amt ? this.dst[si - 1] : si - 1;   /* STUTTER: play the slice before again */
          const pos = this.sw ? j*sliceN + (sliceN - 1 - inS) : j*sliceN + inS, ip = Math.floor(pos), fr = pos - ip;
          const a = ((ip % this.len) + this.len) % this.len, b = (a + 1) % this.len;
          const r0 = this.b0[a] + (this.b0[b] - this.b0[a])*fr, r1 = this.b1[a] + (this.b1[b] - this.b1[a])*fr;
          const env = Math.min(1, inS/fadeN, (sliceN - inS)/fadeN)*this.mix;   /* tiny fades at both edges = no clicks */
          y0 = x0*(1 - env) + r0*env; y1 = x1*(1 - env) + r1*env;
        }
      }
      out[0][k] = y0; if(out[1]) out[1][k] = y1;
    }
    if(++this.tick % 24 === 0){ const map = this.rank.map(r=>r < amt ? 1 : 0).join(''); this.port.postMessage({ moved:map.split('1').length - 1, of:this.nS, map, mix:this.mix }); }
    return true; }
}
registerProcessor('grinder', GrinderProcessor);
