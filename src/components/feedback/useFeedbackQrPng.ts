import { useEffect, useState } from 'react'
import { renderFeedbackQrPng } from '@/lib/feedback/code-assets'

/**
 * The Feedback Code's QR as a PNG data URL, drawn for the screen it is shown
 * on. Keyed by the URL it was drawn for, so a new URL never shows the old
 * image, nor the old failure. `failed` is a URL no QR can hold.
 */
export function useFeedbackQrPng(
  url: string,
  width: number,
): { src?: string; failed: boolean } {
  const [drawn, setDrawn] = useState<{ url: string; src: string | null }>()
  useEffect(() => {
    let cancelled = false
    renderFeedbackQrPng(url, width)
      .then((src) => !cancelled && setDrawn({ url, src }))
      .catch(() => !cancelled && setDrawn({ url, src: null }))
    return () => {
      cancelled = true
    }
  }, [url, width])
  const src = drawn?.url === url ? drawn.src : undefined
  return { src: src ?? undefined, failed: src === null }
}
