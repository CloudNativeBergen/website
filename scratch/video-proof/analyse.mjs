// Throwaway analysis for the #1171 proof. Usage: node analyse.mjs out/x.mp4 [...]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
const FF = '/opt/homebrew/bin/ffmpeg', FP = '/opt/homebrew/bin/ffprobe'
const run = (cmd, args, enc = 'utf8') => execFileSync(cmd, args, { encoding: enc, maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] })
const SW = [
  ['brand-cloud-blue', '#1d4ed8', 540, 450],
  ['brand-sunbeam-yellow', '#facc15', 150, 930],
  ['brand-fresh-green', '#10b981', 400, 930],
  ['brand-nordic-purple', '#6366f1', 650, 930],
  ['brand-slate-gray', '#334155', 900, 930],
]
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function yuvOf([r, g, b], m) {
  const [kr, kb] = m === '709' ? [0.2126, 0.0722] : [0.299, 0.114]
  const R = r / 255, G = g / 255, B = b / 255
  const Y = kr * R + (1 - kr - kb) * G + kb * B
  return [16 + 219 * Y, 128 + 224 * ((B - Y) / (2 * (1 - kb))), 128 + 224 * ((R - Y) / (2 * (1 - kr)))].map((v) => Math.round(v))
}
function rgbOf([Y, U, V], m) {
  const [kr, kb] = m === '709' ? [0.2126, 0.0722] : [0.299, 0.114]
  const y = (Y - 16) / 219, pb = (U - 128) / 224, pr = (V - 128) / 224
  const R = y + 2 * (1 - kr) * pr, B = y + 2 * (1 - kb) * pb, G = (y - kr * R - kb * B) / (1 - kr - kb)
  return [R, G, B].map((v) => Math.max(0, Math.min(255, Math.round(v * 255))))
}
// minimal ISO-BMFF walk for elst + mdhd timescales
function boxes(buf, start, end, path, out) {
  let p = start
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), hdr = 8
    if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); hdr = 16 }
    if (size === 0) size = end - p
    const full = [...path, type]
    out.push({ type, path: full.join('/'), start: p, hdr, size })
    if (['moov', 'trak', 'edts', 'mdia', 'minf', 'stbl'].includes(type)) boxes(buf, p + hdr, p + size, full, out)
    p += size
  }
  return out
}
function editLists(file) {
  const buf = fs.readFileSync(file)
  const all = boxes(buf, 0, buf.length, [], [])
  const tracks = []
  let cur = null
  for (const b of all) {
    if (b.type === 'trak') tracks.push((cur = { elst: [] }))
    if (b.type === 'hdlr' && cur) cur.handler = buf.toString('latin1', b.start + b.hdr + 8, b.start + b.hdr + 12)
    if (b.type === 'mdhd' && cur) { const v = buf[b.start + b.hdr]; cur.timescale = buf.readUInt32BE(b.start + b.hdr + (v === 1 ? 20 : 12)) }
    if (b.type === 'elst' && cur) {
      const o = b.start + b.hdr, v = buf[o], n = buf.readUInt32BE(o + 4)
      for (let i = 0, q = o + 8; i < n; i++) {
        const dur = v === 1 ? Number(buf.readBigUInt64BE(q)) : buf.readUInt32BE(q)
        const mt = v === 1 ? Number(buf.readBigInt64BE(q + 8)) : buf.readInt32BE(q + 4)
        cur.elst.push({ segmentDuration: dur, mediaTime: mt })
        q += v === 1 ? 20 : 12
      }
    }
  }
  return { tracks, topLevel: all.filter((b) => !b.path.includes('/')).map((b) => b.type) }
}
function clicks(file, ignoreEditList) {
  const args = [...(ignoreEditList ? ['-ignore_editlist', '1'] : []), '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']
  const raw = run(FF, args, 'buffer')
  const s = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
  const on = []
  for (let i = 1; i < s.length; i++) if (s[i] > 0.45 && (on.length === 0 || i - on[on.length - 1] > 24000)) on.push(i)
  return { onsets: on, samples: s.length }
}
function flashes(file) {
  const pts = run(FP, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file]).trim().split('\n').map((x) => parseFloat(x))
  const raw = run(FF, ['-i', file, '-map', '0:v:0', '-vf', 'crop=2:2:190:190', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], 'buffer')
  const idx = []
  for (let i = 0; i < raw.length / 4; i++) if (raw[i * 4] > 200) idx.push(i)
  return { frames: pts.length, flashFrames: idx, flashPts: idx.map((i) => pts[i]), firstPts: pts[0], lastPts: pts[pts.length - 1] }
}
function swatches(file) {
  // raw YUV of frame 15 (not a flash frame), sampled per swatch
  const w = 1080
  const raw = run(FF, ['-i', file, '-map', '0:v:0', '-vf', 'select=eq(n\\,15)', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'], 'buffer')
  const Yp = raw.subarray(0, w * w), Up = raw.subarray(w * w, w * w * 1.25), Vp = raw.subarray(w * w * 1.25)
  return SW.map(([name, h, x, y]) => {
    const yuv = [Yp[y * w + x], Up[(y >> 1) * (w >> 1) + (x >> 1)], Vp[(y >> 1) * (w >> 1) + (x >> 1)]]
    const src = hex(h)
    const r = {}
    for (const m of ['709', '601']) {
      const back = rgbOf(yuv, m)
      r['decodedAs' + m] = back
      r['maxDelta' + m] = Math.max(...back.map((v, i) => Math.abs(v - src[i])))
      r['expectedYuv' + m] = yuvOf(src, m)
    }
    return { name, hex: h, src, yuv, ...r }
  })
}
function detHash(file) {
  return run(FF, ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'md5', '-']).trim()
}
for (const f of process.argv.slice(2)) {
  const probe = JSON.parse(run(FP, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]))
  const firstPk = (sel) => {
    const o = run(FP, ['-v', 'error', '-select_streams', sel, '-show_entries', 'packet=pts_time,dts_time,duration_time', '-of', 'csv=p=0', '-read_intervals', '%+#2', f]).trim().split('\n')[0]
    return o
  }
  const v = probe.streams.find((s) => s.codec_type === 'video'), a = probe.streams.find((s) => s.codec_type === 'audio')
  const res = {
    file: f,
    bytes: fs.statSync(f).size,
    formatDuration: +probe.format.duration,
    video: v && { codec: v.codec_name, profile: v.profile, level: v.level, pix_fmt: v.pix_fmt, w: v.width, h: v.height, r_frame_rate: v.r_frame_rate, avg_frame_rate: v.avg_frame_rate, nb_frames: +v.nb_frames, duration: +v.duration, bit_rate: +v.bit_rate, color_range: v.color_range, color_space: v.color_space, color_primaries: v.color_primaries, color_transfer: v.color_transfer, start_time: +v.start_time, firstPacket: firstPk('v:0') },
    audio: a && { codec: a.codec_name, profile: a.profile, sample_rate: +a.sample_rate, channels: a.channels, bit_rate: +a.bit_rate, duration: +a.duration, start_time: +a.start_time, nb_frames: +a.nb_frames, firstPacket: firstPk('a:0') },
    boxes: editLists(f),
    videoMd5: detHash(f),
    swatches: swatches(f),
  }
  const fl = flashes(f)
  res.flashes = { frames: fl.frames, flashFrames: fl.flashFrames, firstPts: fl.firstPts, lastPts: fl.lastPts }
  if (a) {
    for (const ign of [false, true]) {
      const c = clicks(f, ign)
      const fs48 = fl.flashPts.map((t) => Math.round(t * 48000))
      const offs = c.onsets.map((s) => { const near = fs48.reduce((b, x) => (Math.abs(s - x) < Math.abs(s - b) ? x : b)); return s - near })
      res[ign ? 'avIgnoringEditList' : 'avHonouringEditList'] = { clicksFound: c.onsets.length, decodedSamples: c.samples, clickOnsets: c.onsets, clickMinusFlashSamples: offs, meanMs: +((offs.reduce((x, y) => x + y, 0) / offs.length / 48)).toFixed(3) }
    }
  }
  console.log(JSON.stringify(res, null, 1))
}
