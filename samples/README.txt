SAMPLE LIBRARY — everyone who opens TUNER gets everything in this folder.

Drop audio files into subfolders. The subfolder name becomes the folder in the app:
  samples/Drums/kick_133.wav
  samples/Bass/sub_133_Fmin_[dark,epic].wav
  samples/Melodic/pad_133_Cmin_#cinematic#sad.wav

Filename → info:  a 2–3 digit number = BPM,  Fmin / C#maj = key,  [a,b] or #a#b = tags.
Mood tags the app knows: anger happy sad motivation epic cinematic dark chill hype dreamy
Any other word is a custom tag.

Upload on github.com (Add file → Upload files, inside the right subfolder). The site rebuilds
itself in about a minute and the new samples show up for everyone. Delete a file to remove it.
Don't edit index.json — it is regenerated on every deploy. To rename or re-tag a file without
renaming it, add a line to overrides.json.

v10.23: loops are stored as small AAC .m4a files. A new .wav still works, but to make it ~10x smaller run
  node tools/encode.js   (needs ffmpeg) — it encodes every .wav, writes meta.json (exact loop length + seam
  fingerprint) and removes the .wav. Names shown in the app = the original file name, ALL CAPS.
