import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

/**
 * Font provisioning for server-side badge rasterization.
 *
 * resvg loads no fonts of its own in serverless (there ARE no system fonts on
 * Vercel's runtime — a PNG rendered there would silently drop every `<text>`
 * node, i.e. the speaker name). Same pattern as `loadBrandFonts` in lib/og:
 * fetch the self-hosted font over HTTP (fs on `public/` is not reliable in
 * serverless), then persist it to the function's tmpdir because resvg-js only
 * accepts font FILE PATHS (`fontFiles`), not buffers.
 *
 * The promise is module-cached so a warm function fetches/writes once.
 */
const BADGE_FONT_PUBLIC_PATH = '/fonts/Inter-SemiBold.ttf'
const BADGE_FONT_TMP_NAME = 'badge-font-inter-semibold.ttf'

let cachedFontFile: Promise<string> | null = null

export async function loadBadgeFontFiles(origin: string): Promise<string[]> {
  if (!cachedFontFile) {
    cachedFontFile = fetchFontToTmp(origin).catch((error) => {
      // Do not cache a failure — the next request retries the fetch.
      cachedFontFile = null
      throw error
    })
  }
  return [await cachedFontFile]
}

async function fetchFontToTmp(origin: string): Promise<string> {
  const response = await fetch(new URL(BADGE_FONT_PUBLIC_PATH, origin))
  if (!response.ok) {
    throw new Error(
      `Failed to fetch badge font ${BADGE_FONT_PUBLIC_PATH}: ${response.status}`,
    )
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  const filePath = path.join(os.tmpdir(), BADGE_FONT_TMP_NAME)
  // Write-then-rename so a concurrent reader never sees a partial file.
  const tmpPath = `${filePath}.${process.pid}.partial`
  await fs.writeFile(tmpPath, bytes)
  await fs.rename(tmpPath, filePath)
  return filePath
}

/** Test hook: clear the module cache so fetch behavior can be re-exercised. */
export function resetBadgeFontCacheForTests(): void {
  cachedFontFile = null
}
