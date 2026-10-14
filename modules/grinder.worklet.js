/* GRINDER — pattern chopper + grit (THREAT TUNER module, CHOP) — LAB lab-16, sound first, look later.
   Alex 14 Oct (option C): no dice. Hand-made chop patterns on 1/4 (or 1/8) pieces, like chopping on an MPC.
   Fader steps from the lightest pattern to the wildest — same every time. Every piece that MOVES also gets grit,
   and the grit gets dirtier as the fader goes up (starts from his RAGE taste: light drive, HARD clip, asym).
   Switch = FLIP: moved pieces play backwards.
   Timing comes from the loop itself (loop length in samples), so the chops can never drift off the audio. */
const PAT4 = [ [0,1,2,2], [0,1,0,1], [0,0,2,3], [0,1,3,3], [0,0,2,2], [0,1,0,0], [0,0,0,3], [3,2,1,0] ];
const PAT8 = [ [0,1,2,3,4,5,6,6], [0,1,2,3,4,5,4,5], [0,1,2,3,0,1,6,7], [0,0,2,3,4,4,6,7],
               [0,1,0,1,4,5,4,5], [0,0,2,2,4,4,6,6], [0,0,0,0,4,5,6,6], [6,7,6,7,0,0,0,0] ];
class GrinderProcessor extends AudioWorkletProcessor {
  constructor(opt){ super(); this.b0 = null; this.b1 = null; this.len = 0; this.loopBeats = 4;
    this.t0 = 0; this.bs = 0.5; this.run = true; this.v = 0; this.sw = false;
    this.P = { sliceI:0, when:0, drv:6, clip:1, asym:.31, trim:1, fade:4 };
    this.mix = 0; this.tick = 0;
    const po = (opt && opt.processorOptions) || {}; this.msg(po);
    this.port.onmessage = e=>this.msg(e.data || {}); }
  msg(d){ ['t0','bs','v','loopBeats'].forEach(k=>{ if(d[k] != null) this[k] = +d[k]; }); if(d.sw != null) this.sw = !!d.sw;
    if(d.P) Object.assign(this.P, d.P); if(d.run != null) this.run = !!d.run;
    if(d.ch0){ this.b0 = d.ch0; this.b1 = d.ch1 || d.ch0; this.len = this.b0.length; } }
  pats(){ return Math.round(this.P.sliceI) ? PAT8 : PAT4; }
  patIdx(){ return this.v > .04 ? Math.min(7, Math.floor((this.v - .04)/.96*8)) : -1; }
  /* grit: drive → clip (SOFT tanh / HARD) with a little asymmetry, DC removed, level pulled back so louder ≠ better */
  grit(x, d){ const P = this.P, b = P.asym*.5, c = Math.round(P.clip);
    const f = c ? (z=>z > 1 ? 1 : (z < -1 ? -1 : z)) : Math.tanh;
    return (f(x*d + b) - f(b))/Math.pow(d, .4)*P.trim; }
  process(ins, outs){
    const out = outs[0], n = out[0].length, inp = ins[0] || [], i0 = inp[0], i1 = inp[1] || i0, sr = sampleRate, P = this.P;
    const pi = this.run && this.b0 ? this.patIdx() : -1, pats = this.pats(), pat = pi >= 0 ? pats[pi] : null, steps = pats[0].length;
    const beatsPerBar = 4, barLen = this.len*beatsPerBar/Math.max(1, this.loopBeats), sliceN = barLen/steps;
    const fadeN = Math.max(16, P.fade*.001*sr), on01 = pi >= 0 ? (this.v - .04)/.96 : 0, d = 1 + (P.drv - 1)*on01;   /* grit grows with the fader */
    const whenM = [1, 2, 4][Math.max(0, Math.min(2, Math.round(P.when)))];
    for(let k=0;k<n;k++){
      const x0 = i0 ? i0[k] : 0, x1 = i1 ? i1[k] : 0;
      this.mix += ((pat ? 1 : 0) - this.mix)*0.004;
      let y0 = x0, y1 = x1;
      const tt = (currentFrame + k) - this.t0*sr;
      if(this.mix > 1e-4 && tt >= 0 && this.len){
        const pos = tt % this.len, bar = Math.floor(pos/barLen), absBar = Math.floor(tt/barLen);
        const chopBar = (absBar % whenM) === whenM - 1;   /* every bar · every 2nd bar · last of 4 */
        const inBar = pos - bar*barLen, si = Math.min(steps - 1, Math.floor(inBar/sliceN)), inS = inBar - si*sliceN;
        const p = pat || pats[0], j = p[si];
        if(chopBar && j !== si){
          const src = bar*barLen + j*sliceN + (this.sw ? sliceN - 1 - inS : inS), ip = Math.floor(src), fr = src - ip;
          const a = ((ip % this.len) + this.len) % this.len, b = (a + 1) % this.len;
          let r0 = this.b0[a] + (this.b0[b] - this.b0[a])*fr, r1 = this.b1[a] + (this.b1[b] - this.b1[a])*fr;
          r0 = this.grit(r0, d); r1 = this.grit(r1, d);
          const env = Math.min(1, inS/fadeN, (sliceN - inS)/fadeN)*this.mix;   /* fades at both edges = no clicks */
          y0 = x0*(1 - env) + r0*env; y1 = x1*(1 - env) + r1*env;
        }
      }
      out[0][k] = y0; if(out[1]) out[1][k] = y1;
    }
    if(++this.tick % 24 === 0) this.port.postMessage({ pat:pi, map:pat ? pat.join('') : '', steps, drive:d, mix:this.mix });
    return true; }
}
registerProcessor('grinder', GrinderProcessor);
