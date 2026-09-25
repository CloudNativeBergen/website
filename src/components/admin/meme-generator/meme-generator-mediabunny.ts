import { CANVAS_SIZE } from './meme-generator-config'
import {
  PROBE_FRAMES,
  TARGET_BITRATE,
  type EncodeSession,
  type EncoderBackend,
  type Encoding,
} from './meme-generator-export'
import { FPS, FRAME } from './meme-generator-timeline'

/**
 * The browser's encoder, through WebCodecs and Mediabunny (MPL-2.0). Loaded
 * on first use, so the editor's bundle does not carry it. The codec string is
 * Mediabunny's choice — High profile, level 3.2, which covers 1080×1080 at
 * 30 fps (proof §1) — never the level-3.1 string its examples use.
 */

const loadMediabunny = () => import('mediabunny')

type Mediabunny = Awaited<ReturnType<typeof loadMediabunny>>

async function openOutput(
  mediabunny: Mediabunny,
  canvas: HTMLCanvasElement,
  encoding: Encoding,
  onPacket?: () => void,
) {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output } = mediabunny
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
  await output.start()
  return { output, source, target }
}

export const mediabunnyBackend: EncoderBackend = {
  async supports() {
    if (typeof VideoEncoder === 'undefined') return false
    try {
      const { canEncodeVideo } = await loadMediabunny()
      return await canEncodeVideo('avc', {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        bitrate: TARGET_BITRATE,
        frameRate: FPS,
      })
    } catch {
      return false
    }
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
    const cancel = () => void output.cancel().catch(() => {})
    // Aborted while the output was starting: the listener would never fire.
    if (signal.aborted) {
      cancel()
      return false
    }
    signal.addEventListener('abort', cancel)
    try {
      for (let frame = 0; frame < PROBE_FRAMES; frame++) {
        if (signal.aborted) {
          cancel()
          return false
        }
        // A frame that differs from the last, as a real video's do.
        ctx.fillStyle = `hsl(${frame * 36} 70% 50%)`
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
        await source.add(frame * FRAME, FRAME)
      }
      // Flushed: Firefox sends its first chunk only once every frame is in.
      await output.finalize()
      return packets >= PROBE_FRAMES
    } catch {
      cancel()
      return false
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  },

  async open(canvas, encoding): Promise<EncodeSession> {
    const { output, source, target } = await openOutput(
      await loadMediabunny(),
      canvas,
      encoding,
    )
    return {
      add: (timestamp, duration) => source.add(timestamp, duration),
      finish: async () => {
        await output.finalize()
        if (!target.buffer) throw new Error('The encoder wrote no file')
        return new Blob([target.buffer], { type: 'video/mp4' })
      },
      cancel: () => output.cancel(),
    }
  },
}
