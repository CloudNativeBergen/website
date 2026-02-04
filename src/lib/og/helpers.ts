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
 * Loads brand fonts for use in OG images.
 * Fonts are self-hosted in /public/fonts/ and fetched via HTTP.
 * Uses HTTP fetch for Vercel compatibility (fs.readFile doesn't work in serverless).
 * Returns an array of font objects compatible with next/og ImageResponse.
 */
export async function loadBrandFonts(domain: string) {
  const protocol = domain.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${protocol}://${domain}/fonts`

  const [spaceGroteskFont, jetbrainsMonoFont, interFont] = await Promise.all([
    fetch(`${baseUrl}/SpaceGrotesk-Bold.ttf`).then((res) => res.arrayBuffer()),
    fetch(`${baseUrl}/JetBrainsMono-Bold.ttf`).then((res) => res.arrayBuffer()),
    fetch(`${baseUrl}/Inter-SemiBold.ttf`).then((res) => res.arrayBuffer()),
  ])

  return [
    {
      name: 'Space Grotesk',
      data: spaceGroteskFont,
      weight: 700 as const,
      style: 'normal' as const,
    },
    {
      name: 'JetBrains Mono',
      data: jetbrainsMonoFont,
      weight: 700 as const,
      style: 'normal' as const,
    },
    {
      name: 'Inter',
      data: interFont,
      weight: 600 as const,
      style: 'normal' as const,
    },
  ]
}
