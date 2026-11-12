/* CLOUDPACKS (TNR-4729.22) — the WHOLE online THREAT PACKS library (R2, ~11,600 WAV) inside TUNER's feed + PACKS.
   Reads two small files from the cloud:  packs/index.json (what is online, made by packsync.py)
                                          packs/meta.json  (waveform · length · BPM · key per sound, made by packmeta.py)
   and registers every sound as a light library entry. The audio itself is only downloaded when you tap a sound.
   No PIN saved on this device (the maker PIN, same one STEPS / SAMPLE MAKER use) = nothing happens, the app stays as it was. */
(()=>{
  'use strict';
  const CLOUD = 'https://space.crwth.workers.dev';
  const pin = () => { try{ return localStorage.getItem('tuner_makerPin') || ''; }catch(e){ return ''; } };
  const hdr = () => ({ 'x-pin': pin() });
  const url = (pk, rel) => CLOUD + '/m/packs/' + [pk].concat(rel.split('/')).map(encodeURIComponent).join('/');
  const hash = s => { let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const CK = 'tuner_cloudpk_meta';
  const CP = window.CLOUDPK = { loaded:false, loading:null, count:0, withMeta:0, state:'idle' };

  function peaksOf(str){ const n = str.length, out = new Array(n); for(let i=0;i<n;i++){ const v = parseInt(str[i], 36); out[i] = Math.round((isNaN(v) ? 0 : v) * 99 / 35); } return out; }
  async function getJson(path){ const r = await fetch(CLOUD + '/m/packs/' + path + '?' + Date.now(), { headers: hdr() }); if(!r.ok) throw new Error(path + ' ' + r.status); return r.json(); }

  function register(idx, meta){
    const have = new Set(samples.map(s=>s.id)); let n = 0, m = 0;
    const mm = {}; if(meta && meta.packs) Object.entries(meta.packs).forEach(([pk, arr]) => { const d = mm[pk] = new Map(); arr.forEach(a => d.set(a[0], a)); });
    Object.entries(idx.packs || {}).forEach(([pk, files]) => {
      const short = pk.replace(/^THREAT \[AUDIO\]\s*/i, '').trim(), md = mm[pk];
      files.forEach(([rel]) => {
        const id = 'cl-' + hash(pk + '/' + rel); if(have.has(id)) return; have.add(id);
        const parts = rel.split('/'), file = parts.pop(), dirs = parts.map(d => d.replace(/^\[[^\]]*\]\s*/, '').trim()).filter(Boolean);
        const a = md && md.get(rel); let bpm = 0, key = null, lpk = null, dur = 0;
        if(a){ dur = a[1] / 1000; lpk = peaksOf(a[2]); bpm = a[3] || 0; key = a[4] || null; m++; }
        if(!bpm || !key){ try{ const x = parseLoopMeta(file); if(!bpm && x.bpm) bpm = x.bpm; if(!key && x.key) key = x.key; }catch(e){} }
        samples.push({ id, name: file, displayName: file.replace(/\.[^.]+$/, '').toUpperCase(), url: url(pk, rel), hdr, cloud: true, buffer: null, bpm: bpm || undefined, key: key || undefined, tags: [],
          folder: [short].concat(dirs).join(' / '), builtin: true, hidden: false, waveImg: null, env: null, peaks: null, lpk, cdur: dur, frames: 0, sr: 0, fpAt: 0, fpScale: 1, fp: null });
        n++;
      });
    });
    CP.count = (CP.count || 0) + n; CP.withMeta = (CP.withMeta || 0) + m; return n;
  }

  CP.load = function(){
    if(CP.loading) return CP.loading;
    if(!pin()){ CP.state = 'nopin'; return Promise.resolve(0); }
    CP.state = 'loading';
    CP.loading = (async () => {
      try{
        const idx = await getJson('index.json'); let meta = null;
        try{ meta = await getJson('meta.json'); }catch(e){ CP.state = 'nometa'; }
        const n = register(idx, meta); CP.loaded = true; if(CP.state === 'loading') CP.state = 'ok';
        try{ renderLibrarySoon(); }catch(e){}
        return n;
      }catch(e){ CP.state = 'error: ' + (e && e.message || e); return 0; }
    })();
    return CP.loading;
  };
})();
