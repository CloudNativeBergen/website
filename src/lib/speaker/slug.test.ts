import { describe, it, expect, vi } from 'vitest'
import {
  generateSpeakerSlug,
  generateUniqueSpeakerSlug,
  FALLBACK_SLUG_BASE,
  MAX_SLUG_LENGTH,
} from './slug'

describe('generateSpeakerSlug', () => {
  it('produces a url-safe lowercase slug from a normal name', () => {
    expect(generateSpeakerSlug('Jane Doe')).toBe('jane-doe')
    expect(generateSpeakerSlug('Ada  Lovelace!')).toBe('ada-lovelace')
    expect(generateSpeakerSlug('  Grace   Hopper  ')).toBe('grace-hopper')
  })

  it('never returns empty for an emoji-only or non-Latin name', () => {
    expect(generateSpeakerSlug('🎤🎤')).toBe(FALLBACK_SLUG_BASE)
    expect(generateSpeakerSlug('日本語')).toBe(FALLBACK_SLUG_BASE)
    expect(generateSpeakerSlug('')).toBe(FALLBACK_SLUG_BASE)
    expect(generateSpeakerSlug('---')).toBe(FALLBACK_SLUG_BASE)
  })

  it('appends a numeric suffix and truncates to stay within max length', () => {
    expect(generateSpeakerSlug('Jane Doe', 2)).toBe('jane-doe-2')

    const long = 'a'.repeat(200)
    const suffixed = generateSpeakerSlug(long, 42)
    expect(suffixed.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
    expect(suffixed.endsWith('-42')).toBe(true)
  })

  it('truncates a plain slug to the max length', () => {
    const slug = generateSpeakerSlug('a'.repeat(200))
    expect(slug.length).toBe(MAX_SLUG_LENGTH)
  })
})

describe('generateUniqueSpeakerSlug', () => {
  it('returns the base slug when it is free', async () => {
    const exists = vi.fn().mockResolvedValue(false)
    expect(await generateUniqueSpeakerSlug('Jane Doe', exists)).toBe('jane-doe')
    expect(exists).toHaveBeenCalledTimes(1)
  })

  it('probes numeric suffixes until it finds a free slug', async () => {
    const taken = new Set(['jane-doe', 'jane-doe-2', 'jane-doe-3'])
    const exists = vi.fn(async (slug: string) => taken.has(slug))
    expect(await generateUniqueSpeakerSlug('Jane Doe', exists)).toBe(
      'jane-doe-4',
    )
  })

  it('falls back to a stable base for emoji-only names, then suffixes', async () => {
    const taken = new Set(['speaker'])
    const exists = vi.fn(async (slug: string) => taken.has(slug))
    expect(await generateUniqueSpeakerSlug('🎤', exists)).toBe('speaker-2')
  })
})
