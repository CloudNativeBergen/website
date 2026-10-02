import { CANVAS_SIZE } from './meme-generator-config'
import {
  PROBE_FRAMES,
  TARGET_BITRATE,
  type EncodeSession,
  type EncoderBackend,
  type Encoding,
  type ExportAudio,
} from './meme-generator-export'
import { MIX_RATE, findClick } from './meme-generator-music'
import { FPS, FRAME } from './meme-generator-timeline'

/**
 * The browser's encoder, through WebCodecs and Mediabunny (MPL-2.0). Loaded
 * on first use, so the editor's bundle does not carry it. The codec string is
 * Mediabunny's choice — High profile, level 3.2, which covers 1080×1080 at
 * 30 fps (proof §1) — never the level-3.1 string its examples use.
 */


const loadMediabunny = () => import('mediabunny')

type Mediabunny = Awaited<ReturnType<typeof loadMediabunny>>

/** AAC-LC, stereo, as the proof measured it (§2). */
export const AUDIO_BITRATE = 128_000
const AAC = { numberOfChannels: 2, sampleRate: MIX_RATE } as const

/** Where the test click sits in its half second, in samples. */
const CLICK_AT = 4_800

/**
 * The encoder's priming, in samples: encode half a second holding one click,
 * decode it back, and see how late the click comes out (proof §4). Native
 * AAC on macOS measured 2112, the add-on 1024 — a number per encoder, so it
 * is measured rather than assumed.
 */
async function measurePriming(
  mediabunny: Mediabunny,
  signal: AbortSignal,
): Promise<number | null> {
  const { AudioBufferSource, BufferTarget, Mp4OutputFormat, Output, Quality } =
    mediabunny
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const source = new AudioBufferSource({
    codec: 'aac',
    quality: new Quality({ bitrate: AUDIO_BITRATE }),
  })
  output.addAudioTrack(source)
  // Stopped from outside — a cancelled or stalled export — the output is
  // cancelled, which also rejects whatever step is waiting on it.
  const stop = () => void output.cancel().catch(() => {})
  signal.addEventListener('abort', stop, { once: true })
  if (signal.aborted) stop()
  try {
    return await measureOn(mediabunny, output, source, target, signal)
  } finally {
    signal.removeEventListener('abort', stop)
  }
}

/** The measurement itself, on an output set up by {@link measurePriming}. */
async function measureOn(
  { ALL_FORMATS, AudioBufferSink, BufferSource, Input }: Mediabunny,
  output: InstanceType<Mediabunny['Output']>,
  source: InstanceType<Mediabunny['AudioBufferSource']>,
  target: InstanceType<Mediabunny['BufferTarget']>,
  signal: AbortSignal,
): Promise<number | null> {
  await output.start()
  try {
    const click = new Float32Array(MIX_RATE / 2)
    click.fill(0.9, CLICK_AT, CLICK_AT + 96)
    await source.add(toAudioBuffer([click, click]))
    source.close()
    await output.finalize()
  } catch (error) {
    // Its encoder is let go of, not left open behind a failed measurement.
    await output.cancel().catch(() => {})
    throw error
  }
  if (!target.buffer) return null
  const input = new Input({
    source: new BufferSource(target.buffer),
    formats: ALL_FORMATS,
  })
  // Stopped while decoding the click back — a decode can stall between
  // buffers, where no check of the signal would ever run — the input and
  // its decoder are let go of at once.
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    input.dispose()
  }
  let onAbort = () => {}
  const aborted = new Promise<null>((resolve) => {
    onAbort = () => {
      dispose()
      resolve(null)
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  const decode = async () => {
    const track = await input.getPrimaryAudioTrack()
    if (!track) return null
    for await (const { buffer, timestamp } of new AudioBufferSink(
      track,
    ).buffers()) {
      if (signal.aborted) return null
      const at = findClick(buffer.getChannelData(0), 0.45)
      if (at !== null) return Math.round(timestamp * MIX_RATE) + at - CLICK_AT
    }
    return null
  }
  try {
    const decoding = decode()
    // One that fails once disposed, after the abort won the race, is no one's.
    decoding.catch(() => {})
    return await Promise.race([decoding, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
    dispose()
  }
}

/** Samples as an AudioBuffer at MIX_RATE, which Mediabunny encodes. */
function toAudioBuffer(channels: readonly Float32Array[]): AudioBuffer {
  const buffer = new AudioBuffer({
    length: channels[0].length,
    numberOfChannels: channels.length,
    sampleRate: MIX_RATE,
  })
  channels.forEach((samples, c) =>
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, c),
  )
  return buffer
}

async function openOutput(
  mediabunny: Mediabunny,
  canvas: HTMLCanvasElement,
  encoding: Encoding,
  onPacket?: () => void,
  audio: ExportAudio | null = null,
) {
  const {
    AudioBufferSource,
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    Quality,
  } = mediabunny
  const target = new BufferTarget()
  const output = new Output({
    // The index at the front, so a player can start before the whole file.
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  })
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: TARGET_BITRATE,
    latencyMode: encoding.latencyMode,
    ...(encoding.keyFrames === 'every-frame' && { keyFrameInterval: 0 }),
    onEncodedPacket: onPacket,
  })
  output.addVideoTrack(source, { frameRate: FPS })
  const sound = audio
    ? new AudioBufferSource({
        codec: 'aac',
        quality: new Quality({ bitrate: AUDIO_BITRATE }),
      })
    : null
  if (sound) output.addAudioTrack(sound)
  await output.start()
  // The whole track first, then the frames, as the proof did (§4): the MP4
  // is written in memory, so nothing waits on the tracks interleaving. Not
  // awaited here: the session exists — and can be cancelled — while it
  // encodes, and its first frame waits for it, under the stall guard.
  let audioAdded: Promise<void> | null = null
  try {
    audioAdded =
      sound && audio
        ? sound.add(toAudioBuffer(audio.channels)).then(() => sound.close())
        : null
  } catch (error) {
    // The encoders are open now: one that throws setting up the track —
    // the copy runs out of memory, say — lets them go before failing.
    await output.cancel().catch(() => {})
    throw error
  }
  // A cancel before the first frame rejects it with no one waiting.
  audioAdded?.catch(() => {})
  return { output, source, target, audioAdded }
}

export const mediabunnyBackend: EncoderBackend = {
  async supports() {
    if (typeof VideoEncoder === 'undefined') return false
    // A chunk that fails to load rejects, so the panel can offer a retry;
    // only the encoder itself answers no.
    const { canEncodeVideo } = await loadMediabunny()
    return canEncodeVideo('avc', {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      bitrate: TARGET_BITRATE,
      frameRate: FPS,
    })
  },

  async probe(latencyMode, signal) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = CANVAS_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    let packets = 0
    const { output, source } = await openOutput(
      await loadMediabunny(),
      canvas,
      { latencyMode, keyFrames: 'default' },
      () => packets++,
    )
    // An abort settles the probe only once the encoder is closed, so the
    // next check never opens one while this one still holds it. Known hole:
    // once finalize() has begun, Mediabunny ignores cancel(), so a probe
    // stuck in its flush settles at once and its encoder may linger — the
    // proof saw Safari stall in add(), before the flush, never inside it.
    const aborted = new Promise<false>((resolve) => {
      const stop = () => {
        // A probe that finished is already closed; cancelling it again only
        // makes Mediabunny warn "Output has already been finalized".
        if (output.state === 'finalized' || output.state === 'canceled') {
          resolve(false)
          return
        }
        output
          .cancel()
          .catch(() => {})
          .then(() => resolve(false))
      }
      if (signal.aborted) stop()
      else signal.addEventListener('abort', stop, { once: true })
    })
    // Aborted while the output was starting: nothing is encoded, and the
    // probe settles only once that output is closed.
    if (signal.aborted) return aborted
    const encode = async () => {
      for (let frame = 0; frame < PROBE_FRAMES; frame++) {
        if (signal.aborted) return aborted
        // A frame that differs from the last, as a real video's do.
        ctx.fillStyle = `hsl(${frame * 36} 70% 50%)`
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
        await source.add(frame * FRAME, FRAME)
      }
      // Flushed: Firefox sends its first chunk only once every frame is in.
      await output.finalize()
      return packets >= PROBE_FRAMES
    }
    return Promise.race([
      encode().catch(async () => {
        // An add() rejected by our own cancel waits for THAT cancel to
        // finish closing the encoder; a second cancel() can settle at once.
        if (signal.aborted) return aborted
        await output.cancel().catch(() => {})
        return false
      }),
      aborted,
    ])
  },

  async prepareAudio(signal) {
    if (typeof AudioBuffer === 'undefined') return { silent: 'no-encoder' }
    const mediabunny = await loadMediabunny()
    const aac = {
      ...AAC,
      quality: new mediabunny.Quality({ bitrate: AUDIO_BITRATE }),
    }
    // No AAC of the browser's own (Firefox, among those measured): a silent
    // video, said so. The FFmpeg-based add-on that could fill in is not
    // shipped — we cannot provide the source its LGPL licence requires
    // (docs/MARKETING_STUDIO_VIDEO_PROOF.md §8).
    if (!(await mediabunny.canEncodeAudio('aac', aac)))
      return { silent: 'no-encoder' }
    if (signal.aborted) return { silent: 'unmeasured' }
    const priming = await measurePriming(mediabunny, signal).catch(() => null)
    // Unmeasurable is an encoder that cannot be trusted with the track.
    return priming === null || priming < 0
      ? { silent: 'unmeasured' }
      : { priming }
  },

  async open(canvas, encoding, audio): Promise<EncodeSession> {
    const { output, source, target, audioAdded } = await openOutput(
      await loadMediabunny(),
      canvas,
      encoding,
      undefined,
      audio,
    )
    let audioPending = audioAdded
    return {
      add: async (timestamp, duration) => {
        if (audioPending) {
          await audioPending
          audioPending = null
        }
        return source.add(timestamp, duration)
      },
      finish: async () => {
        await output.finalize()
        if (!target.buffer) throw new Error('The encoder wrote no file')
        return new Blob([target.buffer], { type: 'video/mp4' })
      },
      cancel: () => output.cancel(),
    }
  },
}
