/* TUNER stretch worker (v10.16): pro time-stretch with Signalsmith Stretch (MIT), off the main thread.
   in:  {id, chans:[Float32Array…], sr, outLen}   (the loop, and how long it must become)
   out: {id, chans:[Float32Array…]}               (a seamless loop exactly outLen long, same pitch) */
importScripts('signalsmith-core.js');
let modP = null;
function getMod(){ return modP || (modP = self.SSCore()); }
self.onmessage = async e => {
  const { id, chans, sr, outLen, shift } = e.data;
  try{
    const M = await getMod(); const nch = chans.length, L = chans[0].length, rate = L/outLen;
    M._main && !M._mainRan && (M._main(), M._mainRan = true);
    M._presetDefault(nch, sr);
    const inLat = M._inputLatency(), outLat = M._outputLatency(), BL = inLat + outLat, bytes = BL*4;
    const ptr = M._setBuffers(nch, BL);
    M._setTransposeSemitones(0, 8000/sr); M._setFormantSemitones(0, false); M._setFormantBase(0);
    const B = 256, warm = Math.ceil((BL*2)/B)*B, total = warm + outLen + B;
    const outs = chans.map(()=>new Float32Array(outLen));
    const off = (shift || 0);
    for(let e0 = -warm; e0 < outLen + B; e0 += B){
      const mem = M.HEAPF32 ? M.HEAPF32.buffer : (M.exports ? M.exports.memory.buffer : M.HEAP8.buffer);
      const outTime = (e0 + outLat + off) / sr;            // the audio we emit now is for this output time (same as the worklet)
      const inEnd = Math.round((outTime*rate)*sr) + inLat;  // input needed up to here
      for(let c=0;c<nch;c++){ const buf = new Float32Array(mem, ptr + bytes*c, BL), src = chans[c]; let n = inEnd - BL; for(let j=0;j<BL;j++, n++){ buf[j] = src[((n % L) + L) % L]; } }
      M._seek(BL, rate); M._process(0, B);
      const mem2 = M.HEAPF32 ? M.HEAPF32.buffer : (M.exports ? M.exports.memory.buffer : M.HEAP8.buffer);
      for(let c=0;c<nch;c++){ const o = new Float32Array(mem2, ptr + bytes*(c + nch), B), dst = outs[c]; for(let j=0;j<B;j++){ const k = e0 + j; if(k >= 0 && k < outLen) dst[k] = o[j]; } }
    }
    self.postMessage({ id, chans:outs }, outs.map(a=>a.buffer));
  }catch(err){ self.postMessage({ id, error:String(err && err.message || err) }); }
};
