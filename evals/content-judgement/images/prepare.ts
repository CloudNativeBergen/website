import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { WallPhotoItem } from '../schema'
import { fetchedImageFiles, imageCacheDirectory } from './cache'

export interface PreparedImage {
  base64: string
  width: number
  height: number
}

export async function prepareImage(
  item: WallPhotoItem,
  directory = imageCacheDirectory,
): Promise<PreparedImage> {
  try {
    let filename: string
    if (item.image.kind === 'generated') {
      filename = `${item.image.generator}.png`
    } else {
      const files = await fetchedImageFiles(item.id, directory)
      if (files.length !== 1)
        throw new Error('Missing or ambiguous cache entry')
      filename = files[0]
    }
    const bytes = await readFile(join(directory, filename))
    // A stale cache would score an old photo against new labels.
    if (
      item.image.kind === 'fetched' &&
      createHash('sha256').update(bytes).digest('hex') !==
        item.image.sha256.toLowerCase()
    )
      throw new Error('Cached image does not match its sha256')
    const { data, info } = await sharp(bytes)
      .rotate()
      .resize({
        width: 1568,
        height: 1568,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true })
    if (Math.min(info.width, info.height) < 280)
      throw new Error('Image short side is below 280 px')
    return {
      base64: data.toString('base64'),
      width: info.width,
      height: info.height,
    }
  } catch (error) {
    // Keep paths and decoder output out of logs; the reason is one of ours.
    const reason =
      error instanceof Error &&
      [
        'Missing or ambiguous cache entry',
        'Cached image does not match its sha256',
        'Image short side is below 280 px',
      ].includes(error.message)
        ? error.message
        : 'decode or resize failed'
    throw new Error(`${item.id}: image preparation failed (${reason})`)
  }
}
