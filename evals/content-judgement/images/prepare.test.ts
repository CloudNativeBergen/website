import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import type { WallPhotoItem } from '../schema'
import { prepareImage } from './prepare'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})
const item: WallPhotoItem = {
  id: 'wp-001',
  image: { kind: 'generated', generator: 'test-image' },
  labels: {
    photo: { abusive: false, sexual: false, spam: false, personal_info: false },
  },
  tags: ['no_caption'],
}
async function cache(bytes: Buffer): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jev-image-test-'))
  directories.push(directory)
  await writeFile(join(directory, 'test-image.png'), bytes)
  return directory
}
async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#315979' },
  })
    .png()
    .toBuffer()
}

describe('cached image preparation', () => {
  it('downscales a 4000x3000 image to a metadata-free JPEG', async () => {
    const prepared = await prepareImage(
      item,
      await cache(await png(4000, 3000)),
    )
    expect({ width: prepared.width, height: prepared.height }).toEqual({
      width: 1568,
      height: 1176,
    })
    const metadata = await sharp(
      Buffer.from(prepared.base64, 'base64'),
    ).metadata()
    expect(metadata).toMatchObject({
      format: 'jpeg',
      width: 1568,
      height: 1176,
    })
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
  })
  it('never upscales and accepts a short side exactly 280 px', async () => {
    const prepared = await prepareImage(item, await cache(await png(560, 280)))
    expect({ width: prepared.width, height: prepared.height }).toEqual({
      width: 560,
      height: 280,
    })
  })
  it.each([
    [200, 200],
    [4000, 500],
  ])(
    'rejects %ix%i when the final short side would be below 280 px',
    async (width, height) => {
      const directory = await cache(await png(width, height))
      let outcome = 'accepted'
      try {
        await prepareImage(item, directory)
      } catch (error) {
        outcome = error instanceof Error ? error.message : 'unknown error'
      }
      expect(outcome).toBe(
        'wp-001: image preparation failed (Image short side is below 280 px)',
      )
    },
  )
  it('auto-rotates using EXIF before reporting dimensions and strips orientation', async () => {
    const bytes = await sharp(await png(1200, 800))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const prepared = await prepareImage(item, await cache(bytes))
    expect({ width: prepared.width, height: prepared.height }).toEqual({
      width: 800,
      height: 1200,
    })
    const metadata = await sharp(
      Buffer.from(prepared.base64, 'base64'),
    ).metadata()
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
  })
  it('loads a fetched image by item id regardless of URL extension', async () => {
    const directory = await cache(await png(900, 800))
    await writeFile(join(directory, 'wp-002.webp'), await png(1000, 800))
    const prepared = await prepareImage(
      {
        ...item,
        id: 'wp-002',
        image: {
          kind: 'fetched',
          url: 'https://example.com/download',
          page: 'https://example.com/photo',
          author: 'Example',
          licence: 'CC0-1.0',
          sha256: 'a'.repeat(64),
        },
      },
      directory,
    )
    expect({ width: prepared.width, height: prepared.height }).toEqual({
      width: 1000,
      height: 800,
    })
  })
  it('loads a fetched image whose extension is upper case', async () => {
    const directory = await cache(await png(900, 800))
    await writeFile(join(directory, 'wp-003.JPG'), await png(1100, 800))
    const prepared = await prepareImage(
      {
        ...item,
        id: 'wp-003',
        image: {
          kind: 'fetched',
          url: 'https://example.com/Photo.JPG',
          page: 'https://example.com/photo',
          author: 'Example',
          licence: 'CC0-1.0',
          sha256: 'a'.repeat(64),
        },
      },
      directory,
    )
    expect(prepared.width).toBe(1100)
  })
})
