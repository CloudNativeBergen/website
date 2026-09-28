/** How long the browser gets to decode the first frame before we give up. */
const READ_TIMEOUT_MS = 15_000

/** The poster's long side at most: a thumbnail, not a second copy. */
const POSTER_LONG_SIDE = 1920

export interface VideoPoster {
  /** The first frame as a JPEG, uploaded beside the video (spec §4.1). */
  poster: Blob
  /** The video's own size, for the preview and the "soft on social" warning. */
  width: number
  height: number
}

/**
 * Draw a picked video's first frame in the browser, or null when this
 * browser cannot decode it (a codec it lacks, a broken file). Seeking to the
 * start and waiting for `seeked` is what makes Safari, which decodes nothing
 * before it has to, paint a frame to draw.
 */
export function readVideoPoster(file: File): Promise<VideoPoster | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let settled = false
    const done = (result: VideoPoster | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(result)
    }
    const timer = setTimeout(() => done(null), READ_TIMEOUT_MS)
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onerror = () => done(null)
    // On metadata, not on data: iOS loads no frame of a video that is not in
    // the page until something (a seek) asks for one.
    video.onloadedmetadata = () => {
      // A hair past zero: some browsers skip a seek to where they already are.
      video.currentTime = Math.min(0.001, video.duration || 0)
    }
    video.onseeked = () => {
      const { videoWidth: width, videoHeight: height } = video
      if (!width || !height) return done(null)
      const scale = Math.min(1, POSTER_LONG_SIDE / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const context = canvas.getContext('2d')
      if (!context) return done(null)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (poster) => done(poster ? { poster, width, height } : null),
        'image/jpeg',
        0.9,
      )
    }
    video.src = url
  })
}
