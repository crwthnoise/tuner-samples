#!/usr/bin/env python3
"""PACKMETA (TNR-4729.22) — one small info file for the WHOLE online sound library, so TUNER's feed + PACKS can show
every sound with its waveform, length, BPM and key WITHOUT downloading the WAVs first.
Reads the list of what is online from CLOUD/packsync_done.json (written by packsync.py), reads each WAV from HQ/THREAT PACKS,
and writes CLOUD/packmeta.json:  {"v":1,"at":..., "packs":{"THREAT [AUDIO] X":[[rel, durMs, peaks48, bpm, key], ...]}}
  peaks48 = 48 characters 0-9a-z (same style as peaks64.json) · bpm 0 = unknown · key "" = unknown
Resumable: results are kept in packmeta_state.json, a run stops itself after SECS seconds (default 150) — just run it again.
Usage:  python3 packmeta.py            (or SECS=900 python3 packmeta.py on the Mac itself)
Upload: packsync.py uploads packmeta.json as packs/meta.json at the end of its run (see the 3 lines there)."""
import os, sys, json, re, time, subprocess, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "THREAT PACKS"))
DONE = os.path.join(HERE, "packsync_done.json"); STATE = os.path.join(HERE, "packmeta_state.json"); OUT = os.path.join(HERE, "packmeta.json")
SECS = float(os.environ.get("SECS", 150)); A = "0123456789abcdefghijklmnopqrstuvwxyz"; NB = 48; RATE = 8000
done = json.load(open(DONE))
state = json.load(open(STATE)) if os.path.exists(STATE) else {}
state = {k: v for k, v in state.items() if v is not None}   # 0 = file not on this Mac · [..] = done · (old failed tries are retried)
# product name -> folder (same walk as packsync.py)
prod = {}
for coll in sorted(os.listdir(ROOT)):
    cp = os.path.join(ROOT, coll)
    if not os.path.isdir(cp) or coll.startswith(("_", ".")): continue
    for pr in sorted(os.listdir(cp)):
        if pr.startswith("THREAT [AUDIO]") and os.path.isdir(os.path.join(cp, pr)): prod[pr] = os.path.join(cp, pr)

# the folders on the Mac were reorganised after packsync ran (R2 paths are the OLD ones) — so find each file by NAME + SIZE inside its product
byname = {}
def scan(pr):
    if pr in byname: return byname[pr]
    d = {}
    for r, ds, fs in os.walk(prod[pr]):
        ds[:] = [x for x in ds if not x.startswith(".")]
        for n in fs:
            if n.lower().endswith((".wav", ".mp3", ".flac", ".ogg", ".aif", ".aiff")) and not n.startswith("."):
                fp = os.path.join(r, n); d.setdefault((n, os.path.getsize(fp)), fp)
    byname[pr] = d; return d

def parse(name, one_shot):
    bpm = 0; key = ""
    parts = re.split(r"[_\s\-]+", re.sub(r"\.[^.]+$", "", name).upper())
    for p in parts:
        if not bpm and re.fullmatch(r"\d{2,3}", p) and 40 <= int(p) <= 240: bpm = int(p)
        if not key:
            m = re.fullmatch(r"([A-G])(#?)(MIN|MAJ|M)?", p)
            if m and (m.group(3) or (one_shot and p is parts[-1])):
                key = m.group(1) + m.group(2) + ("min" if m.group(3) in ("MIN", "M") else "maj" if m.group(3) == "MAJ" else "")
    return bpm, key

def analyse(fp):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", fp, "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"], capture_output=True, timeout=60)
    raw = r.stdout; n = len(raw) // 2
    if n < 8: return None
    import array; a = array.array("h"); a.frombytes(raw[:n * 2])
    b = [max(abs(x) for x in a[int(i * n / NB):max(int(i * n / NB) + 1, int((i + 1) * n / NB))]) for i in range(NB)]
    m = max(b) or 1
    return int(n * 1000 / RATE), "".join(A[min(35, int(x / m * 35))] for x in b)

t0 = time.time(); new = 0; miss = 0
for k in done:                                   # k = packs/<product>/<rel>
    if k in state: continue
    if time.time() - t0 > SECS: break
    _, pr, rel = k.split("/", 2)
    base = prod.get(pr)
    if not base: miss += 1; continue
    fp = os.path.join(base, rel.replace("/", os.sep))
    if not os.path.exists(fp): fp = scan(pr).get((os.path.basename(rel), done[k]))
    if not fp: miss += 1; state[k] = 0; continue
    try: res = analyse(fp)
    except Exception as e: res = None
    if res:
        bpm, key = parse(os.path.basename(rel), "ONE SHOT" in rel.upper())
        state[k] = [res[0], res[1], bpm, key]
    else: state[k] = 0
    new += 1
    if new % 200 == 0: json.dump(state, open(STATE, "w"))
json.dump(state, open(STATE, "w"))
left = sum(1 for k in done if k not in state)
out = {"v": 1, "at": time.strftime("%Y-%m-%dT%H:%M:%S"), "packs": {}}
for k, v in state.items():
    if not v or k not in done: continue
    _, pr, rel = k.split("/", 2); out["packs"].setdefault(pr, []).append([rel] + v)
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print("analysed", new, "this run ·", len(state), "of", len(done), "done ·", left, "left" + (" · " + str(miss) + " not found on this Mac" if miss else "") + " · packmeta.json", round(os.path.getsize(OUT) / 1e6, 2), "MB")
