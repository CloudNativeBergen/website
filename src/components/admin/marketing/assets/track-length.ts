/** How long the browser gets to read a track's length before we stop asking. */
const READ_TIMEOUT_MS = 5_000

/**
 * A picked track's length in seconds, as the browser reads it, or null when it
 * cannot say. For a quick answer in the form only: the server measures the
 * file itself and has the last word.
 */
export function readTrackLength(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    const done = (seconds: number | null) => {
      clearTimeout(timer)
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
      resolve(seconds)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? audio.duration : null)
    audio.onerror = () => done(null)
    const timer = setTimeout(() => done(null), READ_TIMEOUT_MS)
    audio.src = url
  })
}
