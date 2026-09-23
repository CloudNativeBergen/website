// Throwaway proof page for #1171. Not merged.
import * as MB from 'mediabunny'
import { registerAacEncoder } from '@mediabunny/aac-encoder'

const W = 1080, H = 1080, FPS = 30, SECONDS = Number(new URLSearchParams(location.search).get('seconds') ?? 10), FRAMES = FPS * SECONDS, RATE = 48000
// Swatches from src/styles/tailwind.css @theme
const SWATCHES = [
  ['brand-cloud-blue', '#1d4ed8'],
  ['brand-sunbeam-yellow', '#facc15'],
  ['brand-fresh-green', '#10b981'],
  ['brand-nordic-purple', '#6366f1'],
  ['brand-slate-gray', '#334155'],
]
const BATCH = 5
document.getElementById('bar').max = FRAMES
const qs = new URLSearchParams(location.search)
const LABEL = qs.get('label') ?? 'run'
const $ = (id) => document.getElementById(id)
const canvas = $('c')
const ctx = canvas.getContext('2d', { alpha: false })
const record = { label: LABEL, ua: navigator.userAgent, events: [] }
window.addEventListener('error', (e) => log('window error', e.message + ' ' + e.filename + ':' + e.lineno))
const log = (msg, data) => {
  const line = `[${performance.now().toFixed(1)}] ${msg}` + (data !== undefined ? ' ' + JSON.stringify(data) : '')
  console.log(line)
  $('log').textContent += line + '\n'
  record.events.push({ t: performance.now(), msg, data })
  fetch(`/log?name=${LABEL}`, { method: 'POST', body: line }).catch(() => {})
}

// Frame-index-pure drawing: depends on n only.
function draw(n) {
  ctx.fillStyle = SWATCHES[0][1]
  ctx.fillRect(0, 0, W, H) // large flat cloud-blue swatch = the background
  // small swatches row at the bottom
  SWATCHES.slice(1).forEach(([, hex], i) => {
    ctx.fillStyle = hex
    ctx.fillRect(40 + i * 250, 820, 220, 220)
  })
  // moving bar so each frame differs
  ctx.fillStyle = '#f9fafb'
  ctx.fillRect(((n * 12) % (W - 60)), 700, 60, 60)
  // flash: frame n where n % 30 === 0 -> white box top-left 300x300
  if (n % FPS === 0) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(40, 40, 300, 300)
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 64px system-ui'
  ctx.fillText(`frame ${n}`, 400, 200)
}

async function makeAudio() {
  const oac = new OfflineAudioContext(2, RATE * SECONDS, RATE)
  const buf = oac.createBuffer(2, RATE * SECONDS, RATE)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) d[i] = 0.05 * Math.sin((2 * Math.PI * 220 * i) / RATE)
    // sharp click at each second boundary: 96 samples (2 ms) of +0.9 starting exactly at k*RATE
    for (let k = 0; k < SECONDS; k++) for (let j = 0; j < 96; j++) d[k * RATE + j] = 0.9
  }
  const src = oac.createBufferSource()
  src.buffer = buf
  src.connect(oac.destination)
  src.start(0)
  const rendered = await oac.startRendering()
  log('audio rendered', { sampleRate: rendered.sampleRate, length: rendered.length, ch: rendered.numberOfChannels })
  return rendered
}

const yieldTask = () =>
  globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0))

// Measure the AAC encoder's priming delay by encoding a click and decoding it back.
async function measurePriming() {
  const t = performance.now()
  const out = new MB.Output({ format: new MB.Mp4OutputFormat(), target: new MB.BufferTarget() })
  const src = new MB.AudioBufferSource({ codec: 'aac', quality: new MB.Quality({ bitrate: 128_000 }) })
  out.addAudioTrack(src)
  await out.start()
  const len = RATE / 2, at = 4800
  const b = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: RATE })
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let j = 0; j < 96; j++) d[at + j] = 0.9 }
  await src.add(b)
  src.close()
  await out.finalize()
  const input = new MB.Input({ source: new MB.BufferSource(out.target.buffer), formats: MB.ALL_FORMATS })
  const track = await input.getPrimaryAudioTrack()
  const sink = new MB.AudioBufferSink(track)
  let found = null
  for await (const { buffer, timestamp } of sink.buffers()) {
    const d = buffer.getChannelData(0)
    for (let i = 0; i < d.length; i++) if (d[i] > 0.45) { found = Math.round(timestamp * RATE) + i; break }
    if (found !== null) break
  }
  const priming = found === null ? null : found - at
  log('measured priming', { samples: priming, ms: +(performance.now() - t).toFixed(1) })
  return priming
}

function trimHead(buf, n) {
  const out = new AudioBuffer({ length: buf.length - n, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate })
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(n), ch)
  return out
}

let current = null // { output, canceled, cancelAt }

async function probeSupport() {
  const res = {}
  const v = async (codec) => {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 8e6, framerate: FPS })
      return r.supported
    } catch (e) {
      return 'throws: ' + e.message
    }
  }
  res.videoNative = {
    'avc1.42001f (baseline 3.1)': await v('avc1.42001f'),
    'avc1.420028 (baseline 4.0)': await v('avc1.420028'),
    'avc1.4d0028 (main 4.0)': await v('avc1.4d0028'),
    'avc1.640028 (high 4.0)': await v('avc1.640028'),
    'avc1.640032 (high 5.0)': await v('avc1.640032'),
  }
  try {
    res.audioNativeAac = (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate: 128000 })).supported
  } catch (e) {
    res.audioNativeAac = 'throws: ' + e.message
  }
  res.mbCanEncodeVideoAvc = await MB.canEncodeVideo('avc', { width: W, height: H, bitrate: 8e6 })
  res.mbCanEncodeAudioAacBeforeAddon = await MB.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: RATE, bitrate: 128000 })
  res.hasSchedulerYield = !!globalThis.scheduler?.yield
  return res
}

let addonRegistered = false
async function run(mode) {
  const t0 = performance.now()
  const support = await probeSupport()
  log('support', support)
  let useAudio = mode !== 'silent'
  if (useAudio && (mode === 'addon' || (mode === 'auto' && !support.audioNativeAac))) {
    if (!addonRegistered) {
      const tr = performance.now()
      registerAacEncoder()
      addonRegistered = true
      log('registered AAC add-on', { ms: +(performance.now() - tr).toFixed(1) })
    }
    support.mbCanEncodeAudioAacAfterAddon = await MB.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: RATE, bitrate: 128000 })
    log('after add-on canEncodeAudio(aac)', support.mbCanEncodeAudioAacAfterAddon)
  }
  record.support = support
  record.mode = mode

  const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() })
  const state = { output, canceled: false, cancelClickAt: null, encoderStarted: false }
  current = state
  const videoSource = new MB.CanvasSource(canvas, {
    codec: 'avc',
    quality: new MB.Quality({ bitrate: 8_000_000 }),
    ...(qs.get('vcodec') ? { fullCodecString: qs.get('vcodec') } : {}),
    ...(qs.get('hw') ? { hardwareAcceleration: qs.get('hw') } : {}),
    ...(qs.get('latency') ? { latencyMode: qs.get('latency') } : {}),
    onEncodedPacket: (pk, meta) => {
      if (meta?.decoderConfig && !record.videoDecoderConfig) {
        record.videoDecoderConfig = { codec: meta.decoderConfig.codec, colorSpace: meta.decoderConfig.colorSpace }
        log('video decoderConfig from encoder', record.videoDecoderConfig)
      }
    },
    onEncoderConfig: (c) => {
      try { const f = new VideoFrame(canvas, { timestamp: 0 }); record.canvasFrameColorSpace = f.colorSpace.toJSON(); log('canvas VideoFrame colorSpace', record.canvasFrameColorSpace); f.close() } catch (e) { log('frame colorSpace err', e.message) }
      record.videoEncoderConfig = { ...c }
      log('video encoder config', c)
      VideoEncoder.isConfigSupported(c).then((r) => log('isConfigSupported(actual video config)', r.supported))
    },
  })
  output.addVideoTrack(videoSource, { frameRate: FPS })
  let audioSource = null
  // comp = none | trim:<n> | elst:<n> | calibrate (measure, then trim)
  const comp = qs.get('comp') ?? 'none'
  let trim = 0, startTimestamp = 0
  if (useAudio && comp !== 'none') {
    const [kind, arg] = comp.split(':')
    const n = kind === 'calibrate' ? await measurePriming() : Number(arg)
    record.compensation = { comp, samples: n }
    if (kind === 'elst') startTimestamp = -n / RATE
    else trim = n ?? 0
  }
  if (useAudio) {
    audioSource = new MB.AudioBufferSource({
      codec: 'aac',
      quality: new MB.Quality({ bitrate: 128_000 }),
      onEncoderConfig: (c) => {
        record.audioEncoderConfig = { ...c }
        log('audio encoder config', c)
        if (globalThis.AudioEncoder) AudioEncoder.isConfigSupported(c).then((r) => log('native isConfigSupported(actual audio config)', r.supported)).catch((e) => log('native isConfigSupported threw', e.message))
      },
    }, { startTimestamp })
    output.addAudioTrack(audioSource)
  }

  // responsiveness probes: task heartbeat and rAF paints during encode
  let maxGap = 0, lastBeat = performance.now(), beats = 0, rafs = 0, running = true
  const beat = () => {
    const now = performance.now()
    maxGap = Math.max(maxGap, now - lastBeat)
    lastBeat = now
    beats++
    if (running) setTimeout(beat, 4)
  }
  setTimeout(beat, 4)
  const raf = () => { rafs++; if (running) requestAnimationFrame(raf) }
  requestAnimationFrame(raf)

  // scheduled cancel (setTimeout task) for the automated cancel run
  const cancelAtFrame = qs.has('cancelAt') ? Number(qs.get('cancelAt')) : null
  let firstError = null
  let framesDone = 0
  let lastProgress = performance.now()
  const watchdog = setInterval(() => {
    if (performance.now() - lastProgress > 15000 && !state.canceled) {
      log('STALL: no frame accepted for 15 s', { framesDone, outputState: output.state })
      state.stalled = true
      doCancel('watchdog')
    }
  }, 1000)
  const tStart = performance.now()
  try {
    await output.start()
    const audio = useAudio ? await makeAudio() : null
    if (audio) {
      const ta = performance.now()
      await audioSource.add(trim ? trimHead(audio, trim) : audio)
      audioSource.close()
      log('audio added', { ms: +(performance.now() - ta).toFixed(1) })
    }
    for (let n = 0; n < FRAMES; n++) {
      if (state.canceled) break
      draw(n)
      await videoSource.add(n / FPS, 1 / FPS)
      framesDone = n + 1
      lastProgress = performance.now()
      if (n % 30 === 0) log('frame', n)
      if (cancelAtFrame !== null && n === cancelAtFrame && !state.cancelScheduled) {
        state.cancelScheduled = performance.now()
        setTimeout(() => doCancel('scheduled'), 0)
      }
      if (n % BATCH === BATCH - 1) {
        $('bar').value = n + 1
        $('pct').textContent = Math.round(((n + 1) / FRAMES) * 100) + '%'
        await yieldTask()
      }
    }
    if (state.canceled) {
      await state.cancelPromise
      const stopMs = performance.now() - state.cancelClickAt
      log('canceled', { framesDone, cancelToStoppedMs: +stopMs.toFixed(1), outputState: output.state, scheduledToHandlerMs: state.cancelScheduled ? +(state.cancelClickAt - state.cancelScheduled).toFixed(1) : null })
      record.cancel = { framesDone, cancelToStoppedMs: stopMs, outputState: output.state, scheduledToHandlerMs: state.cancelScheduled ? state.cancelClickAt - state.cancelScheduled : null, source: state.cancelSource }
    } else {
      videoSource.close()
      const tf = performance.now()
      await output.finalize()
      log('finalized', { finalizeMs: +(performance.now() - tf).toFixed(1) })
    }
  } catch (e) {
    firstError = { name: e?.name, message: e?.message ?? String(e), framesDone }
    log('FIRST ERROR', firstError)
    try { await output.cancel() } catch {}
  }
  running = false
  clearInterval(watchdog)
  const wallMs = performance.now() - tStart
  record.result = {
    wallMs,
    totalMsInclProbe: performance.now() - t0,
    framesDone,
    maxTaskGapMs: maxGap,
    heartbeats: beats,
    rafPaints: rafs,
    firstError,
    supportedButFailed: !!firstError && support.mbCanEncodeVideoAvc === true,
    bytes: output.target.buffer?.byteLength ?? 0,
  }
  log('result', record.result)
  if (output.target.buffer && !state.canceled) {
    const name = `${LABEL}.mp4`
    await fetch(`/save?name=${name}`, { method: 'POST', body: output.target.buffer })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([output.target.buffer], { type: 'video/mp4' }))
    a.download = name
    a.textContent = 'download ' + name
    document.body.prepend(a)
    log('saved', name)
  }
  await fetch(`/save?name=${LABEL}.json`, { method: 'POST', body: JSON.stringify(record, null, 2) })
  log('DONE')
  document.title = 'DONE ' + LABEL
}

function doCancel(source) {
  if (!current || current.canceled) return
  current.canceled = true
  current.cancelSource = source
  current.cancelClickAt = performance.now()
  log('cancel clicked', { source })
  current.cancelPromise = current.output.cancel()
}

// Raw WebCodecs probe, no Mediabunny: does the browser's encoder emit chunks as frames go in?
async function rawProbe() {
  const codec = qs.get('vcodec') ?? 'avc1.640020'
  let outputs = 0, err = null
  const enc = new VideoEncoder({ output: () => outputs++, error: (e) => (err = e.message) })
  const cfg = { codec, width: W, height: H, bitrate: 8e6, framerate: FPS, avc: { format: 'avc' } }
  if (qs.get('latency')) cfg.latencyMode = qs.get('latency')
  if (qs.get('hw')) cfg.hardwareAcceleration = qs.get('hw')
  log('raw config', { cfg, supported: (await VideoEncoder.isConfigSupported(cfg)).supported })
  enc.configure(cfg)
  const t = performance.now()
  for (let n = 0; n < FRAMES; n++) {
    draw(n)
    const f = new VideoFrame(canvas, { timestamp: Math.round((n * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
    enc.encode(f, { keyFrame: n % 60 === 0 })
    f.close()
    if (n % 30 === 0) log('raw frame', { n, queue: enc.encodeQueueSize, outputs, err })
    let waited = 0
    while (enc.encodeQueueSize > 4 && waited < 5000) { await new Promise((r) => setTimeout(r, 5)); waited += 5 }
    if (waited >= 5000) { log('raw STALL', { n, queue: enc.encodeQueueSize, outputs, err }); break }
  }
  await Promise.race([enc.flush().catch((e) => (err = e.message)), new Promise((r) => setTimeout(() => { err = err ?? 'flush timeout 5s'; r() }, 5000))])
  log('raw done', { ms: +(performance.now() - t).toFixed(0), outputs, err, state: enc.state })
  record.raw = { outputs, err }
  await fetch(`/save?name=${LABEL}.json`, { method: 'POST', body: JSON.stringify(record, null, 2) })
  document.title = 'DONE ' + LABEL
}

// Play an exported MP4 in THIS browser's <video> and read back swatch pixels.
async function verify() {
  const files = (qs.get('files') ?? '').split(',').filter(Boolean)
  const pts = [['brand-cloud-blue', '#1d4ed8', 540, 450], ['brand-sunbeam-yellow', '#facc15', 150, 930], ['brand-fresh-green', '#10b981', 400, 930], ['brand-nordic-purple', '#6366f1', 650, 930], ['brand-slate-gray', '#334155', 900, 930]]
  record.verify = {}
  for (const f of files) {
    const v = document.createElement('video')
    v.muted = true
    v.src = `/scratch/video-proof/out/${f}.mp4`
    document.body.append(v)
    try {
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('video error ' + v.error?.code)) })
      v.currentTime = 0.51
      await new Promise((r) => (v.onseeked = r))
      await new Promise((r) => setTimeout(r, 200))
      const c = new OffscreenCanvas(W, H)
      const x = c.getContext('2d')
      x.drawImage(v, 0, 0, W, H)
      const out = pts.map(([name, hex, px, py]) => {
        const d = x.getImageData(px, py, 1, 1).data
        const src = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
        return { name, hex, got: [d[0], d[1], d[2]], maxDelta: Math.max(...src.map((s, i) => Math.abs(s - d[i]))) }
      })
      record.verify[f] = { duration: v.duration, w: v.videoWidth, h: v.videoHeight, swatches: out, maxDelta: Math.max(...out.map((o) => o.maxDelta)) }
      log('verify ' + f, record.verify[f])
    } catch (e) {
      record.verify[f] = { error: e.message }
      log('verify ' + f + ' failed', e.message)
    }
    v.remove()
  }
  await fetch(`/save?name=${LABEL}.json`, { method: 'POST', body: JSON.stringify(record, null, 2) })
  document.title = 'DONE ' + LABEL
}

$('start').onclick = () => run($('mode').value)
$('cancel').onclick = () => doCancel('click')
window.addEventListener('error', (e) => log('window error', e.message))
window.addEventListener('unhandledrejection', (e) => log('unhandled rejection', String(e.reason?.message ?? e.reason)))
if (qs.get('mode')) {
  $('mode').value = qs.get('mode')
  if (qs.has('auto')) setTimeout(() => (qs.get('mode') === 'raw' ? rawProbe() : qs.get('mode') === 'verify' ? verify() : run(qs.get('mode'))), 300)
}
