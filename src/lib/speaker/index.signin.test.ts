import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  getOrCreateSpeaker: vi.fn(),
  getOrCreateSpeakerForVerifiedEmail: vi.fn(),
  attachProviderToSpeaker: vi.fn(),
  getSpeaker: vi.fn(),
}))
vi.mock('./sanity', () => store)

import * as seam from './index'

// The sign-in wrappers `src/lib/auth.ts` uses forward args and results
// one-to-one, including rejections (#1876).
describe('speaker seam sign-in wrappers', () => {
  beforeEach(() => vi.resetAllMocks())

  const cases: [keyof typeof store, unknown[]][] = [
    [
      'getOrCreateSpeaker',
      [{ email: 'a@b.c' }, { provider: 'github' }, { p: 1 }],
    ],
    ['getOrCreateSpeakerForVerifiedEmail', ['a@b.c', { nameHint: 'A' }]],
    [
      'attachProviderToSpeaker',
      ['spk-1', { email: 'a@b.c' }, { provider: 'github' }, undefined],
    ],
    ['getSpeaker', ['spk-1']],
  ]

  it.each(cases)('%s forwards args and result', async (name, args) => {
    const result = { speaker: { _id: 'spk-1' }, err: null }
    store[name].mockResolvedValue(result)
    const fn = seam[name] as (...a: unknown[]) => Promise<unknown>
    await expect(fn(...args)).resolves.toBe(result)
    expect(store[name]).toHaveBeenCalledExactlyOnceWith(...args)
  })

  it.each(cases)('%s surfaces a rejection unchanged', async (name, args) => {
    const err = new Error('boom')
    store[name].mockRejectedValue(err)
    const fn = seam[name] as (...a: unknown[]) => Promise<unknown>
    await expect(fn(...args)).rejects.toBe(err)
  })
})
