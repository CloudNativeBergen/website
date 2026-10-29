import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { loadData, type WallPhotoItem } from '../schema'
import { fetchedImageFiles, imageCacheDirectory } from './cache'

const userAgent =
  'cndn-content-judgement-eval/1.0 (https://github.com/CloudNativeBergen/website)'
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex')

export async function fetchImages(
  items: WallPhotoItem[],
  directory = imageCacheDirectory,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await mkdir(directory, { recursive: true })
  for (const item of items) {
    if (item.image.kind !== 'fetched') continue
    try {
      const files = await fetchedImageFiles(item.id, directory)
      const matching = []
      for (const filename of files) {
        const bytes = await readFile(join(directory, filename))
        if (digest(bytes) === item.image.sha256.toLowerCase())
          matching.push(filename)
      }
      if (matching.length) {
        for (const filename of files)
          if (filename !== matching[0]) await unlink(join(directory, filename))
        continue
      }
      const response = await fetcher(item.image.url, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error('Download failed')
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      if (digest(bytes) !== item.image.sha256.toLowerCase())
        throw new Error('sha256 mismatch')
      const { format } = await sharp(bytes).metadata()
      if (
        !format ||
        !['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif'].includes(format)
      )
        throw new Error('Unsupported image format')
      const filename = `${item.id}.${format === 'jpeg' ? 'jpg' : format}`
      await writeFile(join(directory, filename), bytes)
      for (const previous of files)
        if (previous !== filename) await unlink(join(directory, previous))
    } catch {
      // Library and fetch errors can contain URLs or downloaded content.
      throw new Error(
        `${item.id}: image download or sha256 verification failed`,
      )
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  Promise.resolve()
    .then(() => fetchImages(loadData('wall-photo')))
    .catch((error: unknown) => {
      console.error(
        error instanceof Error &&
          /^wp-\d{3}: image download or sha256 verification failed$/.test(
            error.message,
          )
          ? error.message
          : 'Image fetch failed; check the dataset and image hashes',
      )
      process.exitCode = 1
    })
}
