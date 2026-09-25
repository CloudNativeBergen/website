import { FPS, FRAME } from './meme-generator-timeline'

/**
 * Turning the video into an MP4, frame by frame. This file is the loop and
 * its rules; the encoder itself sits behind `EncoderBackend` (Mediabunny and
 * WebCodecs in the browser, a fake in tests).
 *
 * Every frame is painted at frame n's time — never the wall clock — so an
 * export is repeatable. The loop yields a real task every few frames, as
 * awaiting a fast encoder resolves as microtasks and the progress bar would
 * never paint nor a cancel click arrive. The measurements behind the rest —
 * the per-browser latency probe, the stall watchdog, the bitrate floor — are
 * in docs/MARKETING_STUDIO_VIDEO_PROOF.md §1, §6–§8.
 */

/** 8 Mbit/s: a full minute is about 60 MB, inside the gallery's 100 MB. */
export const TARGET_BITRATE = 8_000_000
/** LinkedIn's minimum for a whole file. Every export is at least this. */
export const MIN_BITRATE = 192_000
/**
 * LinkedIn's shortest video, in seconds (proof §7). Bluesky states none, so
 * a shorter export is still made — and the organizer is told.
 */
export const LINKEDIN_MIN_SECONDS = 3
export const PROBE_FRAMES = 10
/**
 * Around the whole probe, frames and flush alike (proof §8.1). Longer for
 * the fallback: Chrome's first realtime chunk took 3.1 s.
 */
export const PROBE_TIMEOUT_MS: Record<Encoding['latencyMode'], number> = {
  quality: 3_000,
  realtime: 5_000,
}
/** How long an abandoned probe may take to let go of its encoder. */
export const PROBE_RELEASE_MS = 1_000
/**
 * How long a failed or cancelled export waits for its encoder to close
 * before it settles, so a retry does not find the old one still holding it.
 */
export const RELEASE_MS = 1_000
/** No frame accepted for this long is an encoder that has stopped (proof §6). */
export const STALL_TIMEOUT_MS = 15_000
/** Frames between real tasks handed back to the browser. */
export const FRAMES_PER_YIELD = 5

export interface Encoding {
  /** Safari needs `realtime`; Firefox fails with it; Chrome is 5× slower. */
  latencyMode: 'quality' | 'realtime'
  /**
   * `every-frame` makes each frame a key frame. It is how a flat design gets
   * over the bitrate floor: measured in Chrome 154 on macOS, a flat 3 s video
   * came out at 65 kbit/s at a constant 8 Mbit/s, and 1,478 kbit/s with a key
   * frame every frame.
   */
  keyFrames: 'default' | 'every-frame'
}

export interface EncodeSession {
  /** Encode the canvas as it is now. Resolves when more may be added. */
  add(timestamp: number, duration: number): Promise<void>
  /** Flush and finish the file. */
  finish(): Promise<Blob>
  /** Stop, and let go of the encoder. */
  cancel(): Promise<void>
}

export interface EncoderBackend {
  /**
   * Whether the encoder takes H.264 at 1080×1080 and 30 fps — asked about
   * the exact configuration, never assumed.
   */
  supports(): Promise<boolean>
  /**
   * Encode a few frames in `latencyMode` and flush: true if a chunk came
   * back for every frame. Stops when `signal` aborts.
   */
  probe(
    latencyMode: Encoding['latencyMode'],
    signal: AbortSignal,
  ): Promise<boolean>
  open(canvas: HTMLCanvasElement, encoding: Encoding): Promise<EncodeSession>
}

/** What one export draws: a canvas, and a way to paint frame n onto it. */
export interface ExportJob {
  canvas: HTMLCanvasElement
  frameCount: number
  paint: (frame: number) => void
}

export type ExportProgress =
  | { phase: 'checking' }
  | {
      phase: 'encoding'
      /** 0 to 1 through this pass. */
      fraction: number
      /** A pass after the first re-encodes at a higher bitrate. */
      pass: number
    }

export interface ExportResult {
  blob: Blob
  /** The whole file's bitrate: bytes × 8 ÷ duration. */
  bitrate: number
  encoding: Encoding
}

export class ExportCancelled extends Error {
  name = 'ExportCancelled'
  constructor() {
    super('The export was cancelled.')
  }
}

export class ExportFailed extends Error {
  name = 'ExportFailed'
  constructor(
    readonly reason:
      'unsupported' | 'probe' | 'encoder' | 'stalled' | 'bitrate',
    message: string,
  ) {
    super(message)
  }
}

export const UNSUPPORTED_MESSAGE =
  'This browser cannot make MP4 video. Use Chrome, Edge or Safari on a computer.'

/** The encoder said yes, then did not deliver a short test encode in time. */
export const PROBE_FAILED_MESSAGE =
  'The video encoder did not answer a short test in time. Try again; if it keeps happening, try another browser on a computer.'

/**
 * A real task, not a microtask: `scheduler.yield()` where there is one,
 * otherwise a message round trip — never `requestAnimationFrame`, which a
 * hidden tab throttles to a standstill.
 */
export function yieldToEventLoop(): Promise<void> {
  const scheduler = (
    globalThis as { scheduler?: { yield?: () => Promise<void> } }
  ).scheduler
  if (scheduler?.yield) return scheduler.yield()
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

/**
 * `promise`, unless `signal` aborts first (ExportCancelled) or `ms` pass with
 * no answer (`onTimeout`'s error).
 */
function guarded<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  ms: number,
  onTimeout: () => Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => finish(() => reject(onTimeout())), ms)
    const onAbort = () => finish(() => reject(new ExportCancelled()))
    const finish = (settle: () => void) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      settle()
    }
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort)
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}

const stalled = () =>
  new ExportFailed(
    'stalled',
    `The encoder stopped responding for ${STALL_TIMEOUT_MS / 1000} seconds.`,
  )

const kbits = (bitrate: number) => `${Math.round(bitrate / 1000)} kbit/s`

const describe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

/**
 * The latency mode this browser's encoder actually delivers in: `quality`
 * where a short probe gets every frame back within the timeout, else
 * `realtime` if that does, else none.
 */
async function pickLatencyMode(
  backend: EncoderBackend,
  signal: AbortSignal,
): Promise<Encoding['latencyMode'] | null> {
  for (const mode of ['quality', 'realtime'] as const) {
    // A cancel that landed while the last probe was letting go: no new
    // probe starts, so none can open an encoder after the export stopped.
    if (signal.aborted) throw new ExportCancelled()
    const probe = new AbortController()
    const stop = () => probe.abort()
    signal.addEventListener('abort', stop)
    const running = backend.probe(mode, probe.signal)
    try {
      const ok = await guarded(
        running,
        signal,
        PROBE_TIMEOUT_MS[mode],
        () => new Error('probe timed out'),
      )
      if (ok) return mode
    } catch (error) {
      if (error instanceof ExportCancelled) throw error
    } finally {
      probe.abort()
      signal.removeEventListener('abort', stop)
      // The failed check closes its encoder before the next one opens
      // (proof §8.1) — as long as closing does not itself hang.
      await Promise.race([
        running.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, PROBE_RELEASE_MS)),
      ])
    }
  }
  return null
}

/** One pass over every frame, into a finished file. */
async function encodePass(
  session: EncodeSession,
  options: {
    frameCount: number
    paint: (frame: number) => void
    signal: AbortSignal
    yieldTask: () => Promise<void>
    onFraction: (fraction: number) => void
  },
): Promise<Blob> {
  const { frameCount, paint, signal, yieldTask, onFraction } = options
  try {
    for (let frame = 0; frame < frameCount; frame++) {
      if (signal.aborted) throw new ExportCancelled()
      paint(frame)
      // Awaited, so the encoder is fed no faster than its queue drains.
      await guarded(
        session.add(frame / FPS, FRAME),
        signal,
        STALL_TIMEOUT_MS,
        stalled,
      )
      if ((frame + 1) % FRAMES_PER_YIELD === 0 || frame === frameCount - 1) {
        onFraction((frame + 1) / frameCount)
        await yieldTask()
      }
    }
    // Checked before finishing: a finish once started cannot be cancelled.
    if (signal.aborted) throw new ExportCancelled()
    return await guarded(session.finish(), signal, STALL_TIMEOUT_MS, stalled)
  } catch (error) {
    // Whatever happened, the encoder is let go of before the export settles
    // and Export can be pressed again — waiting at most RELEASE_MS on one
    // that has stopped answering.
    await Promise.race([
      session.cancel().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, RELEASE_MS)),
    ])
    if (error instanceof ExportCancelled || error instanceof ExportFailed)
      throw error
    throw new ExportFailed('encoder', `The encoder failed: ${describe(error)}`)
  }
}

/**
 * Export `frameCount` frames, each painted by `paint(n)` onto `canvas`, as an
 * MP4 of at least MIN_BITRATE. A file that comes out under it — flat designs
 * do (proof §7) — is encoded again with every frame a key frame.
 */
export async function exportVideo({
  backend,
  job: { canvas, frameCount, paint },
  onProgress,
  signal,
  yieldTask = yieldToEventLoop,
}: {
  backend: EncoderBackend
  job: ExportJob
  onProgress: (progress: ExportProgress) => void
  signal: AbortSignal
  yieldTask?: () => Promise<void>
}): Promise<ExportResult> {
  onProgress({ phase: 'checking' })
  // Nothing here may outlast a cancel, not even asking.
  const answer = <T>(promise: Promise<T>) =>
    guarded(promise, signal, STALL_TIMEOUT_MS, stalled)
  if (!(await answer(backend.supports())))
    throw new ExportFailed('unsupported', UNSUPPORTED_MESSAGE)
  const latencyMode = await pickLatencyMode(backend, signal)
  if (!latencyMode) throw new ExportFailed('probe', PROBE_FAILED_MESSAGE)

  const passes: Encoding[] = [
    { latencyMode, keyFrames: 'default' },
    { latencyMode, keyFrames: 'every-frame' },
  ]

  const duration = frameCount / FPS
  let bitrate = 0
  for (const [index, encoding] of passes.entries()) {
    if (signal.aborted) throw new ExportCancelled()
    const opening = backend.open(canvas, encoding)
    const session = await answer(opening).catch((error: unknown) => {
      // One that finishes opening after a cancel or a stall is closed then.
      void opening.then((late) => late.cancel()).catch(() => {})
      throw error
    })
    onProgress({ phase: 'encoding', fraction: 0, pass: index + 1 })
    const blob = await encodePass(session, {
      frameCount,
      paint,
      signal,
      yieldTask,
      onFraction: (fraction) =>
        onProgress({ phase: 'encoding', fraction, pass: index + 1 }),
    })
    bitrate = (blob.size * 8) / duration
    if (bitrate >= MIN_BITRATE) return { blob, bitrate, encoding }
  }
  throw new ExportFailed(
    'bitrate',
    `The video came out at ${kbits(bitrate)}, under the ${kbits(MIN_BITRATE)} LinkedIn requires. Try a design with more detail.`,
  )
}
