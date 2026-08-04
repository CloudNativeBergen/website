import { protocolForDomain } from '@/lib/environment/localhost'

export function createSvgDataUrl(svgString: string): string | null {
  if (!svgString?.trim()) return null

  const trimmed = svgString.trim()
  if (!trimmed.includes('<svg')) return null

  try {
    let cleanSvg = trimmed

    cleanSvg = cleanSvg.replace(/^<\?xml[^>]*\?>\s*/, '')
    cleanSvg = cleanSvg.replace(/<!DOCTYPE[^>]*>\s*/i, '')
    if (!cleanSvg.includes('xmlns=')) {
      cleanSvg = cleanSvg.replace(
        '<svg',
        '<svg xmlns="http://www.w3.org/2000/svg"',
      )
    }

    if (cleanSvg.includes('<image')) {
      cleanSvg = cleanSvg.replace(
        /<image[^>]*xlink:href="data:[^"]*"[^>]*>/gi,
        '',
      )
      cleanSvg = cleanSvg.replace(/<image[^>]*>/gi, '')
    }

    cleanSvg = cleanSvg.replace(/<mask[^>]*>[\s\S]*?<\/mask>/gi, '')
    cleanSvg = cleanSvg.replace(/<clipPath[^>]*>[\s\S]*?<\/clipPath>/gi, '')
    cleanSvg = cleanSvg.replace(/mask="[^"]*"/gi, '')
    cleanSvg = cleanSvg.replace(/clip-path="[^"]*"/gi, '')

    cleanSvg = cleanSvg.replace(/<filter[^>]*>[\s\S]*?<\/filter>/gi, '')
    cleanSvg = cleanSvg.replace(/filter="[^"]*"/gi, '')

    cleanSvg = cleanSvg.replace(/<defs[^>]*>[\s\S]*?<\/defs>/gi, '')

    cleanSvg = cleanSvg.replace(/style="mix-blend-mode:[^"]*"/gi, '')

    const base64 = Buffer.from(cleanSvg).toString('base64')
    const dataUrl = `data:image/svg+xml;base64,${base64}`

    if (base64.length < 10) {
      console.error('SVG processing failed: empty or invalid content')
      return null
    }

    return dataUrl
  } catch (error) {
    console.error(
      'SVG processing error:',
      error,
      'SVG:',
      svgString?.slice(0, 100),
    )
    return null
  }
}

export function formatDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
): string | null {
  if (!startDate && !endDate) return null

  if (startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start.toDateString() === end.toDateString()) {
      return start.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }

    if (
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear()
    ) {
      return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${end.getDate()}, ${end.getFullYear()}`
    }

    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  const singleDate = startDate || endDate
  if (!singleDate) return null

  return new Date(singleDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * The three self-hosted faces every OG card is composed from, in the shape
 * `next/og`'s `ImageResponse` wants them.
 */
const BRAND_FONT_FILES = [
  { name: 'Space Grotesk', file: 'SpaceGrotesk-Bold.ttf', weight: 700 },
  { name: 'JetBrains Mono', file: 'JetBrainsMono-Bold.ttf', weight: 700 },
  { name: 'Inter', file: 'Inter-SemiBold.ttf', weight: 600 },
] as const

type BrandFont = {
  name: string
  data: ArrayBuffer
  weight: 700 | 600
  style: 'normal'
}

/**
 * Module-cached font bytes, shared by every OG route and every tenant.
 *
 * NOT keyed by domain, deliberately. `domain` only picks the ORIGIN the bytes
 * are fetched from; `/public/fonts/` is part of the deployment, so every host
 * this code answers on serves byte-identical files. Keying by domain would
 * multiply ~808 KB of resident buffers by the tenant count for no difference in
 * content.
 *
 * Same lifetime contract as `loadBadgeFontFiles` in `@/lib/badge/fonts`: a warm
 * serverless instance fetches once and every later invocation on it reuses the
 * buffers; a cold instance pays the fetch again. Module state is per-instance,
 * not global — that is the ceiling this can reach without bundling the fonts as
 * function assets, and it removes the per-REQUEST refetch, which is the actual
 * cost (3 requests / ~808 KB of self-traffic on every single OG render).
 */
let cachedBrandFonts: Promise<BrandFont[]> | null = null

/**
 * Loads brand fonts for use in OG images.
 * Fonts are self-hosted in /public/fonts/ and fetched via HTTP.
 * Uses HTTP fetch for Vercel compatibility (fs.readFile doesn't work in serverless).
 * Returns an array of font objects compatible with next/og ImageResponse.
 */
export async function loadBrandFonts(domain: string): Promise<BrandFont[]> {
  if (!cachedBrandFonts) {
    cachedBrandFonts = fetchBrandFonts(domain).catch((error) => {
      // Do not cache a failure — the next request retries the fetch.
      cachedBrandFonts = null
      throw error
    })
  }
  return cachedBrandFonts
}

async function fetchBrandFonts(domain: string): Promise<BrandFont[]> {
  const baseUrl = `${protocolForDomain(domain)}://${domain}/fonts`

  return Promise.all(
    BRAND_FONT_FILES.map(async ({ name, file, weight }) => {
      const response = await fetch(`${baseUrl}/${file}`)
      if (!response.ok) {
        throw new Error(
          `Failed to fetch OG brand font ${file}: ${response.status}`,
        )
      }
      return {
        name,
        data: await response.arrayBuffer(),
        weight,
        style: 'normal' as const,
      }
    }),
  )
}

/** Test hook: clear the module cache so fetch behavior can be re-exercised. */
export function resetBrandFontCacheForTests(): void {
  cachedBrandFonts = null
}
