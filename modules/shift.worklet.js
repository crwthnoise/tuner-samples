/* SHIFT — octave-up pitch shifter (two crossfading read heads on a delay line). Used by SKY's SHIMMER. */
class ShiftProcessor extends AudioWorkletProcessor {
  constructor(o){ super(); const po = (o && o.processorOptions) || {}; this.r = po.ratio || 2; this.N = 16384; this.b = [new Float32Array(this.N), new Float32Array(this.N)]; this.w = 0; this.W = Math.round(sampleRate*0.07); this.ph = 0; }
  process(ins, outs){ const inp = ins[0] || [], o = outs[0], n = o[0].length, N = this.N, W = this.W, step = this.r - 1;
    const i0 = inp[0], i1 = inp[1] || i0;
    for(let k=0;k<n;k++){ this.b[0][this.w] = i0 ? i0[k] : 0; this.b[1][this.w] = i1 ? i1[k] : 0;
      this.ph -= step; if(this.ph < 0) this.ph += W; const d1 = this.ph, d2 = (this.ph + W/2) % W;
      const g1 = Math.sin(Math.PI*d1/W), g2 = Math.sin(Math.PI*d2/W), a1 = g1*g1, a2 = g2*g2;
      for(let c=0;c<2;c++){ if(!o[c]) continue; const B = this.b[c];
        const rd = d=>{ const p = this.w - d; const ip = Math.floor(p), f = p - ip; const x = B[(ip + N) % N], y = B[(ip + 1 + N) % N]; return x + (y - x)*f; };
        o[c][k] = rd(d1)*a1 + rd(d2)*a2; }
      this.w = (this.w + 1) % N; }
    return true; }
}
registerProcessor('shift', ShiftProcessor);
