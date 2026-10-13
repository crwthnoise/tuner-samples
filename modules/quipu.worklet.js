/* QUIPU — slice scrambler (THREAT TUNER module, CHOP)
   Each bar is cut into SLICES (8 or 16). Fader = how many slices get swapped for another slice of the same bar.
   New scramble every RE-ROLL bars. HOLD = keep the scramble you're hearing.
   How it plays a slice that hasn't happened yet: loops repeat, so that slice already played one loop ago —
   QUIPU keeps the last loop in memory and reads it from there. Until a full loop has been heard, it plays straight.
   The same code runs live and in EXPORT (pattern comes from bar number + seed, so export = what you heard). */
function quipuHash(a, b, seed){ let h = Math.imul(a|0, 374761393) ^ Math.imul(b|0, 668265263) ^ Math.imul(seed|0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
class QuipuProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(){ return [
    { name:'amount', defaultValue:0, minValue:0, maxValue:1, automationRate:'k-rate' },
    { name:'hold',   defaultValue:0, minValue:0, maxValue:1, automationRate:'k-rate' },
    { name:'slices', defaultValue:8, minValue:2, maxValue:32, automationRate:'k-rate' },
    { name:'reroll', defaultValue:1, minValue:1, maxValue:8, automationRate:'k-rate' } ]; }
  constructor(opt){ super(); this.N = Math.ceil(sampleRate*32); this.b0 = new Float32Array(this.N); this.b1 = new Float32Array(this.N); this.w = 0; this.filled = 0;
    this.t0 = 0; this.bs = 0.5; this.loopBeats = 4; this.seed = 1; this.heldKey = -1; this.cur = 0; this.prev = 0; this.xf = 0; this.xfStep = 1/(0.004*sampleRate); this.lastRep = '';
    const po = (opt && opt.processorOptions) || {}; ['t0','bs','loopBeats','seed'].forEach(k=>{ if(po[k] != null) this[k] = +po[k]; });   /* export: settings arrive with the node, before the first sample */
    this.port.onmessage = e=>{ const d = e.data || {}; ['t0','bs','loopBeats','seed'].forEach(k=>{ if(d[k] != null) this[k] = +d[k]; }); if(d.reset){ this.filled = 0; this.heldKey = -1; } }; }
  process(ins, outs, p){
    const out = outs[0], n = out[0].length, inp = ins[0] || [], i0 = inp[0], i1 = inp[1] || i0;
    const amt = p.amount[0], hold = p.hold[0] > 0.5, S = Math.max(2, Math.round(p.slices[0])), RR = Math.max(1, Math.round(p.reroll[0]));
    const slen = 4/S, N = this.N, sr = sampleRate;
    let rep = '';
    for(let k=0;k<n;k++){
      const x0 = i0 ? i0[k] : 0, x1 = i1 ? i1[k] : 0; const w = this.w; this.b0[w] = x0; this.b1[w] = x1;
      let D = 0; const beat = ((currentFrame + k)/sr - this.t0)/this.bs;
      if(amt > 0 && beat >= 0){
        const bar = Math.floor(beat/4), i = Math.min(S-1, Math.floor((beat - bar*4)/slen));
        let key = Math.floor(bar/RR); if(hold){ if(this.heldKey < 0) this.heldKey = key; key = this.heldKey; } else this.heldKey = -1;
        if(quipuHash(key*64 + i, 1, this.seed) < amt){ const m = Math.floor(quipuHash(key*64 + i, 2, this.seed)*S);
          let db = (i - m)*slen; const L = Math.max(1, this.loopBeats); while(db < 0) db += L; D = Math.round(db*this.bs*sr); if(D > this.filled || D >= N) D = 0; }
        if(k === 0) rep = bar + ':' + i;
      }
      if(D !== this.cur){ this.prev = this.cur; this.cur = D; this.xf = 1; }
      const r = (w - this.cur + N) % N; let y0 = this.b0[r], y1 = this.b1[r];
      if(this.xf > 0){ const q = (w - this.prev + N) % N, g = this.xf; y0 = y0*(1-g) + this.b0[q]*g; y1 = y1*(1-g) + this.b1[q]*g; this.xf -= this.xfStep; }
      out[0][k] = y0; if(out[1]) out[1][k] = y1;
      this.w = (w + 1) % N; if(this.filled < N) this.filled++;
    }
    if(rep && rep !== this.lastRep){ this.lastRep = rep; this.port.postMessage({ pos:rep, held:this.heldKey }); }
    return true; }
}
registerProcessor('quipu', QuipuProcessor);
