import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { imageCacheDirectory } from './cache'
import { imageTemplates } from './templates'

export async function generateImages(
  directory = imageCacheDirectory,
): Promise<void> {
  await mkdir(directory, { recursive: true })
  // These local synthetic pages can run in one process on restricted macOS runners.
  const browser = await chromium.launch({
    args: ['--single-process', '--no-zygote'],
  })
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 })
    for (const template of await imageTemplates()) {
      await page.setViewportSize({
        width: template.width,
        height: template.height,
      })
      await page.setContent(template.html, { waitUntil: 'load' })
      await page.screenshot({
        path: join(directory, `${template.id}.png`),
        type: 'png',
      })
    }
  } finally {
    await browser.close()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  generateImages().catch(() => {
    console.error('Image generation failed')
    process.exitCode = 1
  })
}
