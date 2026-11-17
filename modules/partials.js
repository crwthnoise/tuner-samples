/* PARTIALS SYNTH engine v2 - no DOM. Works in any page with Web Audio (TUNER, standalone page).
   const syn = new PartialsSynth(audioContext); syn.connect(audioContext.destination);
   syn.noteOn('k1', 60); syn.noteOff('k1'); syn.set('ott', .6);
   const preset = PartialsSynth.sampleToPreset(monoFloat32, sampleRate, 'NAME'); syn.setSlot('A', preset);
*/
(function(root){
'use strict';
const dB=x=>Math.pow(10,x/20);
const T=(arr)=>arr.map(p=>({r:p[0],a:dB(p[1]),t:p[2]}));
const BUILTIN=[
 {name:'KARAN BELL',parts:T([[1,0,1.2],[2.04,-23,.6],[1.97,-23,.6],[3.49,-25,.4],[4.15,-26,.35],[3.53,-27,.4],[3.69,-27,.4],[2.64,-28,.5],[3.59,-29,.4],[2.85,-29,.5],[2.69,-29,.5],[4.26,-29,.3]])},
 {name:'WUMP SUB',parts:T([[1,0,.5],[2.98,-13,.35],[4.98,-15,.3],[6.29,-27,.2],[4.18,-28,.2],[11.55,-27,.15],[8.9,-33,.15],[13.8,-35,.12],[2.1,-35,.25]])},
 {name:'HOLLOW ODD',parts:[1,3,5,7,9,11,13,15].map((n,i)=>({r:n,a:1/n,t:1.6/(1+i*.4)}))},
 {name:'PURE SAW',parts:Array.from({length:16},(_,i)=>({r:i+1,a:1/(i+1),t:1.4/(1+i*.15)}))}
];
// knob table: [key, label, min, max, default, page]
const KNOBS=[
 ['parts','PARTS',1,24,12,'S'],['stretch','STRETCH',0,1,.5,'S'],['bright','BRIGHT',0,1,.5,'S'],['oe','ODD/EVEN',0,1,.5,'S'],
 ['decay','DECAY',0,1,.5,'S'],['shim','SHIMMER',0,1,0,'S'],['morph','MORPH A>B',0,1,0,'S'],['hit','HIT',0,1,0,'S'],
 ['motion','MOTION',0,1,0,'S'],['rate','RATE',0,1,.3,'S'],['glide','GLIDE',0,1,0,'S'],['atk','ATTACK',0,1,0,'S'],
 ['cut','CUTOFF',0,1,1,'F'],['res','RESON',0,1,.1,'F'],['comb','COMB',0,1,0,'F'],['satL','SAT LOW',0,1,0,'F'],
 ['satM','SAT MID',0,1,0,'F'],['satH','SAT HIGH',0,1,0,'F'],['ott','OTT',0,1,0,'F'],['mix','OTT MIX',0,1,1,'F'],
 ['x1','X-OVER 1',0,1,.3,'F'],['x2','X-OVER 2',0,1,.6,'F'],['vol','VOLUME',0,1,.7,'F']
];
const D={};KNOBS.forEach(k=>D[k[0]]=k[4]);
const cutHz=v=>80*Math.pow(150,v), atkS=v=>0.002+0.4*v*v, x1Hz=v=>80+520*v*v*3.2, x2Hz=v=>1200+5800*v;
function satCurve(d){const n=2048,c=new Float32Array(n),k=d<.01?0:1+d*24;for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=k===0?x:Math.tanh(k*x)/Math.tanh(k);}return c;}

class PartialsSynth{
 constructor(ctx){
  this.ctx=ctx;this.p=Object.assign({},D);this.slots={A:BUILTIN[0],B:BUILTIN[1]};this.voices={};this.lastF=261.6;this.mono=null;
  const c=ctx;
  this.in=c.createGain();
  this.lp=c.createBiquadFilter();this.lp.type='lowpass';
  this.cDry=c.createGain();this.cDl=c.createDelay(1);this.cFb=c.createGain();this.cWet=c.createGain();this.cOut=c.createGain();
  this.in.connect(this.lp);this.lp.connect(this.cDry);this.lp.connect(this.cDl);this.cDl.connect(this.cFb);this.cFb.connect(this.cDl);this.cDl.connect(this.cWet);
  this.cDry.connect(this.cOut);this.cWet.connect(this.cOut);
  // 3-band split
  this.bLo=c.createBiquadFilter();this.bLo.type='lowpass';
  this.bMh=c.createBiquadFilter();this.bMh.type='highpass';this.bMl=c.createBiquadFilter();this.bMl.type='lowpass';
  this.bHi=c.createBiquadFilter();this.bHi.type='highpass';
  this.cOut.connect(this.bLo);this.cOut.connect(this.bMh);this.bMh.connect(this.bMl);this.cOut.connect(this.bHi);
  this.sh=[0,1,2].map(()=>{const s=c.createWaveShaper();s.oversample='4x';return s;});
  this.cp=[0,1,2].map(()=>{const k=c.createDynamicsCompressor();k.attack.value=.003;k.release.value=.09;k.knee.value=6;return k;});
  this.mk=[0,1,2].map(()=>c.createGain());
  [this.bLo,this.bMl,this.bHi].forEach((b,i)=>{b.connect(this.sh[i]);this.sh[i].connect(this.cp[i]);this.cp[i].connect(this.mk[i]);});
  this.wetG=c.createGain();this.dryG=c.createGain();this.master=c.createGain();
  this.mk.forEach(m=>m.connect(this.wetG));this.cOut.connect(this.dryG);
  this.lim=c.createDynamicsCompressor();this.lim.threshold.value=-6;this.lim.ratio.value=12;this.lim.attack.value=.002;this.lim.release.value=.08;
  this.wetG.connect(this.master);this.dryG.connect(this.master);this.master.connect(this.lim);
  this.clip=c.createWaveShaper();this.clip.oversample='2x';{const n=1024,cv=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*4-2;cv[i]=Math.tanh(x);}this.clip.curve=cv;}this.lim.connect(this.clip);this.out=this.clip;
  // shared noise for HIT
  const nb=c.createBuffer(1,c.sampleRate,c.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;this.noise=nb;
  this.apply();
 }
 connect(node){this.out.connect(node);return this;}
 disconnect(){try{this.out.disconnect();}catch(e){}}
 set(k,v){this.p[k]=v;this.apply();}
 setSlot(s,preset){this.slots[s]=preset;}
 apply(){
  const c=this.ctx,t=c.currentTime,p=this.p;
  this.lp.frequency.setTargetAtTime(Math.min(cutHz(p.cut),c.sampleRate*.45),t,.02);this.lp.Q.setTargetAtTime(.3+p.res*14,t,.02);
  this.cFb.gain.setTargetAtTime(p.comb*.88,t,.02);this.cWet.gain.setTargetAtTime(p.comb*.9,t,.02);this.cDl.delayTime.setTargetAtTime(1/this.lastF,t,.01);
  const f1=x1Hz(p.x1),f2=Math.max(f1*1.6,x2Hz(p.x2));
  this.bLo.frequency.setTargetAtTime(f1,t,.02);this.bMh.frequency.setTargetAtTime(f1,t,.02);this.bMl.frequency.setTargetAtTime(f2,t,.02);this.bHi.frequency.setTargetAtTime(f2,t,.02);
  [p.satL,p.satM,p.satH].forEach((d,i)=>{if(this._d&&this._d[i]===d)return;this.sh[i].curve=satCurve(d);});this._d=[p.satL,p.satM,p.satH];
  const thr=-6-p.ott*38,ratio=1+p.ott*19,mk=dB(-thr*(1-1/ratio)*.4);
  this.cp.forEach((k,i)=>{k.threshold.setTargetAtTime(thr,t,.02);k.ratio.setTargetAtTime(ratio,t,.02);this.mk[i].gain.setTargetAtTime(mk*(i===2?.85:1),t,.02);});
  this.wetG.gain.setTargetAtTime(p.mix,t,.02);this.dryG.gain.setTargetAtTime(1-p.mix,t,.02);
  this.master.gain.setTargetAtTime(p.vol*1.5,t,.02);
 }
 // partial table for one preset with the knobs applied
 shaped(base,table,weight){
  const p=this.p,N=Math.round(p.parts),out=[];
  for(let i=0;i<Math.min(N,table.length);i++){
   const q=table[i],n=Math.round(q.r);let a=q.a*weight;
   a*=Math.pow(q.r,(p.bright-.5)*2);
   if(Math.abs(q.r-n)<.1&&n>1){const odd=n%2===1;a*=odd?Math.min(1,2*(1-p.oe)):Math.min(1,2*p.oe);}
   out.push({f:base*Math.pow(q.r,1+(p.stretch-.5)*.2),a,t:q.t*.15*Math.pow(40,p.decay)});
  }
  return out;
 }
 partialsFor(base){
  const m=this.p.morph;let ps=[];
  if(m<.99)ps=ps.concat(this.shaped(base,this.slots.A.parts,1-m));
  if(m>.01)ps=ps.concat(this.shaped(base,this.slots.B.parts,m));
  return ps;
 }
 noteOn(id,midi,vel){
  const c=this.ctx;if(c.state==='suspended'&&!c.startRendering){try{c.resume();}catch(e){}}
  vel=vel==null?1:vel;const p=this.p,base=440*Math.pow(2,(midi-69)/12);this.lastF=base;
  const ps=this.partialsFor(base),now=c.currentTime;
  // glide: retarget the held voice instead of starting a new one
  if(p.glide>.02&&this.mono&&this.voices[this.mono]){
   const v=this.voices[this.mono],gt=p.glide*.6;
   v.oscs.forEach((o,i)=>{if(ps[i]){o.frequency.cancelScheduledValues(now);o.frequency.setValueAtTime(o.frequency.value,now);o.frequency.exponentialRampToValueAtTime(Math.max(20,ps[i].f),now+gt);}});
   this.voices[id]=v;delete this.voices[this.mono];this.mono=id;this.cDl.delayTime.setTargetAtTime(1/base,now,gt/3);return;
  }
  this.noteOff(id,true);this.apply();
  const at=atkS(p.atk),g=c.createGain();let sum=0;ps.forEach(q=>sum+=q.a);const sc=.5/Math.max(.5,sum)*(.4+.6*vel);
  g.connect(this.in);
  const lfo=c.createOscillator();lfo.frequency.value=.2+p.rate*p.rate*9;lfo.start(now);
  const oscs=[],extra=[lfo];
  ps.forEach((q,i)=>{
   if(q.f>=c.sampleRate/2-200)return;
   const o=c.createOscillator(),mg=c.createGain(),pg=c.createGain();
   o.frequency.value=q.f;o.detune.value=(Math.random()*2-1)*p.shim*25;
   if(p.motion>.01){const lg=c.createGain();lg.gain.value=(i%2?1:-1)*p.motion*.9;lfo.connect(lg);lg.connect(mg.gain);extra.push(lg);}
   pg.gain.setValueAtTime(0,now);pg.gain.linearRampToValueAtTime(q.a*sc,now+at);pg.gain.setTargetAtTime(0,now+at,Math.max(.03,q.t));
   o.connect(mg);mg.connect(pg);pg.connect(g);o.start(now);oscs.push(o);
  });
  // HIT: noise that rings through narrow bands tuned to the strongest partials
  if(p.hit>.01){
   const top=ps.slice().sort((u,v)=>v.a-u.a).slice(0,6),ns=c.createBufferSource(),hg=c.createGain();
   ns.buffer=this.noise;ns.loop=true;hg.gain.setValueAtTime(p.hit*sc*6,now);hg.gain.setTargetAtTime(0,now,.025+p.hit*.05);
   top.forEach(q=>{if(q.f>=c.sampleRate/2-200)return;const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=q.f;bp.Q.value=40;ns.connect(bp);bp.connect(hg);});
   hg.connect(g);ns.start(now);ns.stop(now+.6);
  }
  this.voices[id]={g,oscs,extra};this.mono=id;
 }
 noteOff(id,hard){
  const v=this.voices[id];if(!v)return;delete this.voices[id];if(this.mono===id)this.mono=null;
  const c=this.ctx,now=c.currentTime,r=hard?.02:.25;
  v.g.gain.cancelScheduledValues(now);v.g.gain.setValueAtTime(v.g.gain.value,now);v.g.gain.setTargetAtTime(0,now,r/3);
  v.oscs.forEach(o=>{try{o.stop(now+r+.3);}catch(e){}});v.extra.forEach(o=>{try{if(o.stop)o.stop(now+r+.3);}catch(e){}});
  setTimeout(()=>{try{v.g.disconnect();}catch(e){}},(r+.6)*1000);
 }
 allOff(){Object.keys(this.voices).forEach(k=>this.noteOff(k));}
 getState(){return{p:Object.assign({},this.p),A:this.slots.A,B:this.slots.B};}
 setState(s){if(s.p)Object.assign(this.p,s.p);if(s.A)this.slots.A=s.A;if(s.B)this.slots.B=s.B;this.apply();}
 // ----- sound -> preset -----
 static sampleToPreset(x,sr,name){
  const N=16384,w=hann(N),re=new Float64Array(N),im=new Float64Array(N),p=new Float64Array(N/2+1);
  for(let s=0;s<=Math.max(0,x.length-N);s+=N/2){for(let i=0;i<N;i++){re[i]=(s+i<x.length?x[s+i]:0)*w[i];im[i]=0;}fft(re,im);for(let k=0;k<=N/2;k++)p[k]+=re[k]*re[k]+im[k]*im[k];}
  const bh=sr/N,mx=Math.max.apply(null,p)+1e-30,d=new Float64Array(p.length);for(let i=0;i<p.length;i++)d[i]=10*Math.log10(p[i]/mx+1e-20);
  const r=Math.max(2,Math.ceil(30/bh)),lo=Math.max(2,Math.floor(25/bh)),hi=Math.min(p.length-2,Math.floor(16000/bh)),c=[];
  for(let i=lo;i<hi;i++){if(d[i]<-55||!(d[i]>d[i-1]&&d[i]>=d[i+1]))continue;let ok=true;for(let j=Math.max(1,i-r);j<=Math.min(p.length-2,i+r);j++)if(d[j]>d[i]){ok=false;break;}if(!ok)continue;const a=d[i-1],b=d[i],cc=d[i+1],den=a-2*b+cc,dd=den!==0?.5*(a-cc)/den:0;c.push({f:(i+dd)*bh,db:b});}
  c.sort((u,v)=>v.db-u.db);const pk=c.slice(0,24);if(!pk.length)return null;
  const main=pk[0].f,M=2048,hop=512,wm=hann(M),fr=[];
  for(let s=0;s<Math.max(1,x.length-M+hop);s+=hop){for(let i=0;i<M;i++){re[i]=(s+i<x.length?x[s+i]:0)*wm[i];im[i]=0;}fft(re,im);const a=new Float32Array(M/2);for(let k=0;k<M/2;k++)a[k]=Math.hypot(re[k],im[k]);fr.push(a);}
  const dur=x.length/sr,parts=pk.map(q=>{
   const b=Math.round(q.f*M/sr),lv=fr.map(a=>Math.max(a[Math.max(1,b-1)],a[b],a[Math.min(M/2-1,b+1)]));
   let pi=0;lv.forEach((v,i)=>{if(v>lv[pi])pi=i;});let tau=null;
   for(let i=pi;i<lv.length;i++)if(lv[i]<lv[pi]*.1){tau=((i-pi)*hop/sr)/2.3;break;}
   if(tau===null)tau=Math.max(.3,(dur-pi*hop/sr))/1.5;
   return{r:q.f/main,a:dB(q.db),t:Math.max(.05,Math.min(8,tau))};
  });
  return{name:String(name||'SOUND').replace(/\.[^.]+$/,'').slice(0,22).toUpperCase(),parts:parts,src:Math.round(main)};
 }
}
const FFTC={};
function fftPrep(n){if(FFTC[n])return FFTC[n];const bits=Math.round(Math.log2(n)),rev=new Uint32Array(n);for(let i=0;i<n;i++){let r=0;for(let b=0;b<bits;b++)if(i&(1<<b))r|=1<<(bits-1-b);rev[i]=r;}const cos=new Float64Array(n/2),sin=new Float64Array(n/2);for(let i=0;i<n/2;i++){cos[i]=Math.cos(2*Math.PI*i/n);sin[i]=-Math.sin(2*Math.PI*i/n);}return FFTC[n]={rev:rev,cos:cos,sin:sin};}
function fft(re,im){const n=re.length,o=fftPrep(n),rev=o.rev,cos=o.cos,sin=o.sin;for(let i=0;i<n;i++){const j=rev[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}for(let s=2;s<=n;s<<=1){const h=s>>1,st=n/s;for(let i=0;i<n;i+=s)for(let j=0,k=0;j<h;j++,k+=st){const a=i+j,b=a+h,tr=re[b]*cos[k]-im[b]*sin[k],ti=re[b]*sin[k]+im[b]*cos[k];re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;}}}
function hann(N){const w=new Float64Array(N);for(let i=0;i<N;i++)w[i]=.5-.5*Math.cos(2*Math.PI*i/N);return w;}
PartialsSynth.KNOBS=KNOBS;PartialsSynth.DEFAULTS=D;PartialsSynth.BUILTIN=BUILTIN;

// ----- lightweight voice for TUNER's PAD (works on live or offline contexts) -----
// cfg: parts, stretch, bright, oe, decay, shim, hit, atk, sus (0..1, how much of each partial keeps ringing while held), cut (0..1)
PartialsSynth.voice=function(ac,dest,midi,t,cfg,preset){
 const c=Object.assign({},D,{sus:.35},cfg||{}),base=440*Math.pow(2,(midi-69)/12),N=Math.round(c.parts),tab=preset.parts;
 const out=ac.createGain(),lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(cutHz(c.cut),ac.sampleRate*.45);lp.Q.value=.3+c.res*14;
 lp.connect(out);out.connect(dest);out.gain.setValueAtTime(1,t);
 const ps=[];let sum=0;
 for(let i=0;i<Math.min(N,tab.length);i++){const q=tab[i],n=Math.round(q.r);let a=q.a*Math.pow(q.r,(c.bright-.5)*2);
  if(Math.abs(q.r-n)<.1&&n>1){const odd=n%2===1;a*=odd?Math.min(1,2*(1-c.oe)):Math.min(1,2*c.oe);}
  ps.push({r:Math.pow(q.r,1+(c.stretch-.5)*.2),a:a,t:Math.max(.03,q.t*.15*Math.pow(40,c.decay))});sum+=a;}
 const sc=.85/Math.max(.5,sum),at=atkS(c.atk),oscs=[],gs=[];
 ps.forEach(q=>{const f=base*q.r;if(f>=ac.sampleRate/2-200)return;
  const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;o.detune.value=(Math.random()*2-1)*c.shim*25;
  const lv=q.a*sc;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(lv,t+at);g.gain.setTargetAtTime(lv*c.sus,t+at,q.t);
  o.connect(g);g.connect(lp);o.start(t);oscs.push([o,q.r]);gs.push(g);});
 if(c.hit>.01){const nb=ac.createBuffer(1,Math.floor(ac.sampleRate*.3),ac.sampleRate),d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const ns=ac.createBufferSource(),hg=ac.createGain();ns.buffer=nb;hg.gain.setValueAtTime(c.hit*sc*6,t);hg.gain.setTargetAtTime(0,t,.025+c.hit*.05);
  ps.slice().sort((u,v)=>v.a-u.a).slice(0,6).forEach(q=>{const f=base*q.r;if(f>=ac.sampleRate/2-200)return;const bp=ac.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=40;ns.connect(bp);bp.connect(hg);});
  hg.connect(lp);ns.start(t);}
 return{
  glide(np,at){const nb=440*Math.pow(2,(np-69)/12);oscs.forEach(([o,r])=>o.frequency.setTargetAtTime(nb*r,at,.03));},
  stop(at){out.gain.cancelScheduledValues(at);out.gain.setValueAtTime(1,at);out.gain.linearRampToValueAtTime(0,at+.12);oscs.forEach(([o])=>{try{o.stop(at+.15);}catch(e){}});}
 };
};
PartialsSynth.fmt={cut:v=>Math.round(cutHz(v))+'',atk:v=>(atkS(v)*1000).toFixed(0)+'ms',x1:v=>Math.round(x1Hz(v))+'',x2:v=>Math.round(x2Hz(v))+''};
root.PartialsSynth=PartialsSynth;
})(typeof window!=='undefined'?window:globalThis);
