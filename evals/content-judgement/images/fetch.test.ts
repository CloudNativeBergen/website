import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WallPhotoItem } from '../schema'
import { fetchImages } from './fetch'

const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex')
const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'jev-fetch-test-'))
  directories.push(directory)
  const bytes = await sharp({
    create: { width: 900, height: 800, channels: 3, background: '#abc' },
  })
    .png()
    .toBuffer()
  const item: WallPhotoItem = {
    id: 'wp-001',
    image: {
      kind: 'fetched',
      url: 'https://example.com/download',
      page: 'https://example.com/photo',
      author: 'Example',
      licence: 'CC0-1.0',
      sha256: digest(bytes),
    },
    labels: {
      photo: {
        abusive: false,
        sexual: false,
        spam: false,
        personal_info: false,
      },
    },
    tags: ['benign', 'no_caption'],
  }
  return { directory, bytes, item }
}

describe('fetched image cache', () => {
  it('downloads sequentially with the eval User-Agent and verifies the original bytes', async () => {
    const { directory, bytes, item } = await fixture()
    let active = 0
    let peak = 0
    const fetcher = vi.fn<typeof fetch>(async () => {
      active++
      peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      return new Response(new Uint8Array(bytes))
    })
    await fetchImages([item, { ...item, id: 'wp-002' }], directory, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(peak).toBe(1)
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({
      'User-Agent':
        'cndn-content-judgement-eval/1.0 (https://github.com/CloudNativeBergen/website)',
    })
    expect(digest(await readFile(join(directory, 'wp-001.png')))).toBe(
      digest(bytes),
    )
    expect(digest(await readFile(join(directory, 'wp-002.png')))).toBe(
      digest(bytes),
    )
  })
  it('skips a correct cached hash and removes stale duplicate cache files', async () => {
    const { directory, bytes, item } = await fixture()
    if (item.image.kind === 'fetched')
      item.image.sha256 = item.image.sha256.toUpperCase()
    await writeFile(join(directory, 'wp-001.png'), bytes)
    await writeFile(join(directory, 'wp-001.jpg'), 'outdated')
    const fetcher = vi.fn<typeof fetch>()
    await fetchImages([item], directory, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    expect(await readdir(directory)).toEqual(['wp-001.png'])
    expect(digest(await readFile(join(directory, 'wp-001.png')))).toBe(
      digest(bytes),
    )
  })
  it('replaces a stale cached file only after downloading matching bytes', async () => {
    const { directory, bytes, item } = await fixture()
    await writeFile(join(directory, 'wp-001.jpg'), 'outdated')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array(bytes)))
    await fetchImages([item], directory, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await readdir(directory)).toEqual(['wp-001.png'])
    expect(digest(await readFile(join(directory, 'wp-001.png')))).toBe(
      digest(bytes),
    )
  })
  it('rejects a hash mismatch naming only the item and leaves no downloaded file', async () => {
    const { directory, item } = await fixture()
    const differentBytes = await sharp({
      create: { width: 900, height: 800, channels: 3, background: '#def' },
    })
      .png()
      .toBuffer()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array(differentBytes)))
    await expect(fetchImages([item], directory, fetcher)).rejects.toThrow(
      'wp-001: image download or sha256 verification failed',
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await readdir(directory)).toEqual([])
  })
})
