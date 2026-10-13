/* RAGE level-match — keeps the raged sound about as loud as what went in (a touch louder as you push it),
   so the fader changes the CHARACTER, not just the volume. Input 0 = processed sound, input 1 = the clean reference. */
class RageMatch extends AudioWorkletProcessor {
  static get parameterDescriptors(){ return [{ name:'boost', defaultValue:1, minValue:0, maxValue:4, automationRate:'k-rate' }]; }
  constructor(){ super(); this.eIn = 1e-6; this.eRef = 1e-6; this.g = 1; const tc = 0.25*sampleRate/128; this.k = 1/tc; this.gk = 1/(0.06*sampleRate/128); }
  process(inputs, outputs, params){
    const sig = inputs[0], ref = inputs[1], out = outputs[0]; if(!out || !out.length) return true;
    let es = 0, er = 0, n = 0;
    if(sig && sig.length){ for(const ch of sig){ for(let i=0;i<ch.length;i++) es += ch[i]*ch[i]; n += ch.length; } }
    if(ref && ref.length){ let m = 0; for(const ch of ref){ for(let i=0;i<ch.length;i++) er += ch[i]*ch[i]; m += ch.length; } er = m ? er/m : 0; }
    es = n ? es/n : 0;
    this.eIn += (es - this.eIn)*this.k; this.eRef += (er - this.eRef)*this.k;
    let target = this.eIn > 1e-7 ? Math.sqrt(this.eRef/this.eIn)*params.boost[0] : this.g;
    if(this.eRef < 1e-8) target = this.g;                   /* silence in = hold the gain, no pumping up the noise */
    target = Math.min(4, Math.max(0.05, target));
    const g0 = this.g, g1 = g0 + (target - g0)*this.gk; this.g = g1;
    for(let c=0;c<out.length;c++){ const o = out[c], s = sig && sig.length ? sig[Math.min(c, sig.length-1)] : null;
      if(!s){ o.fill(0); continue; }
      for(let i=0;i<o.length;i++){ const g = g0 + (g1 - g0)*(i/o.length); o[i] = s[i]*g; } }
    return true; }
}
registerProcessor('ragematch', RageMatch);
