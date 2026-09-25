import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
const deleteMock = vi.fn()

const configMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    withConfig: (config: unknown) => {
      configMock(config)
      return { fetch: (...args: unknown[]) => fetchMock(...args) }
    },
  },
  clientWrite: { delete: (...args: unknown[]) => deleteMock(...args) },
}))

import {
  deleteFileAssetIfOrphaned,
  deleteImageAssetIfOrphaned,
} from './orphaned-asset'

const cases = [
  {
    name: 'deleteImageAssetIfOrphaned',
    fn: deleteImageAssetIfOrphaned,
    id: 'image-abc-500x500-png',
  },
  {
    name: 'deleteFileAssetIfOrphaned',
    fn: deleteFileAssetIfOrphaned,
    id: 'file-def-mp4',
  },
] as const

beforeEach(() => {
  fetchMock.mockReset()
  configMock.mockReset()
  deleteMock.mockReset().mockResolvedValue({})
})

describe.each(cases)('$name', ({ fn, id }) => {
  it('sends the unscoped, uncached, raw-perspective reference count: no type or tenant filter', async () => {
    fetchMock.mockResolvedValue({ n: 0 })
    await fn(id)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '{ "n": count(*[references($assetId)]) }',
      { assetId: id },
      // `raw` is pinned per request: the API's default perspective became
      // `published` at v2025-02-19, which hides draft-only and release-version
      // references and would read a confident 0 for an asset a draft still uses.
      { cache: 'no-store', perspective: 'raw' },
    )
    // ...at an API version whose `raw` includes Content Release versions: an
    // asset referenced only from a release must not read 0 (#1160, where an
    // organizer can make a deduplicated upload of another tenant's image).
    expect(configMock).toHaveBeenCalledWith({ apiVersion: '2025-02-19' })
  })

  it('keeps a referenced asset and reports the count', async () => {
    fetchMock.mockResolvedValue({ n: 1 })
    expect(await fn(id)).toEqual({
      id,
      deleted: false,
      remainingReferences: 1,
    })
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('deletes an unreferenced asset', async () => {
    fetchMock.mockResolvedValue({ n: 0 })
    expect(await fn(id)).toEqual({ id, deleted: true, remainingReferences: 0 })
    expect(deleteMock).toHaveBeenCalledWith(id)
  })

  it('keeps the asset when the count throws (fail closed)', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    expect(await fn(id)).toEqual({
      id,
      deleted: false,
      remainingReferences: -1,
    })
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('keeps the asset when the count comes back null (fail closed)', async () => {
    fetchMock.mockResolvedValue(null)
    expect(await fn(id)).toEqual({
      id,
      deleted: false,
      remainingReferences: -1,
    })
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('reports not deleted when the delete itself throws', async () => {
    fetchMock.mockResolvedValue({ n: 0 })
    deleteMock.mockRejectedValue(new Error('conflict'))
    expect(await fn(id)).toEqual({
      id,
      deleted: false,
      remainingReferences: 0,
    })
    expect(deleteMock).toHaveBeenCalledWith(id)
  })

  it('does nothing for a null id', async () => {
    expect(await fn(null)).toEqual({
      id: null,
      deleted: false,
      remainingReferences: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
