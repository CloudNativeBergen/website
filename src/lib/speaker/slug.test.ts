import { describe, it, expect, vi } from 'vitest'
import {
  generateSpeakerSlug,
  generateUniqueSpeakerSlug,
  isCanonicalSpeakerSlug,
  resolveSpeakerSlugs,
  FALLBACK_SLUG_BASE,
  MAX_SLUG_LENGTH,
  type SpeakerSlugInput,
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

describe('isCanonicalSpeakerSlug', () => {
  it('accepts slugs already in canonical form', () => {
    expect(isCanonicalSpeakerSlug('jane-doe')).toBe(true)
    expect(isCanonicalSpeakerSlug('jane-doe-2')).toBe(true)
    expect(isCanonicalSpeakerSlug('speaker')).toBe(true)
    expect(isCanonicalSpeakerSlug('a1')).toBe(true)
  })

  it('rejects non-canonical or wrongly-shaped slugs', () => {
    expect(isCanonicalSpeakerSlug('Jane-Doe')).toBe(false) // uppercase
    expect(isCanonicalSpeakerSlug('jane--doe')).toBe(false) // doubled dash
    expect(isCanonicalSpeakerSlug('-jane')).toBe(false) // leading dash
    expect(isCanonicalSpeakerSlug('jane-')).toBe(false) // trailing dash
    expect(isCanonicalSpeakerSlug('jane doe')).toBe(false) // space
    expect(isCanonicalSpeakerSlug('jané')).toBe(false) // non-ascii
    expect(isCanonicalSpeakerSlug('')).toBe(false)
    expect(isCanonicalSpeakerSlug('   ')).toBe(false)
    expect(isCanonicalSpeakerSlug('a'.repeat(MAX_SLUG_LENGTH + 1))).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isCanonicalSpeakerSlug(undefined)).toBe(false)
    expect(isCanonicalSpeakerSlug(null)).toBe(false)
    expect(isCanonicalSpeakerSlug({ current: 'jane-doe' })).toBe(false)
    expect(isCanonicalSpeakerSlug(42)).toBe(false)
  })

  it('agrees with generateSpeakerSlug output for arbitrary names', () => {
    for (const name of ['Jane Doe', '  Grace  Hopper ', '🎤', '日本語', '']) {
      expect(isCanonicalSpeakerSlug(generateSpeakerSlug(name))).toBe(true)
    }
  })
})

describe('resolveSpeakerSlugs', () => {
  it('leaves a valid, unique slug untouched', () => {
    const inputs: SpeakerSlugInput[] = [
      { id: 'a', name: 'Jane Doe', currentSlug: 'jane-doe' },
    ]
    expect(resolveSpeakerSlugs(inputs)).toEqual([
      { id: 'a', slug: 'jane-doe', changed: false },
    ])
  })

  it('generates a slug for missing/empty/whitespace slugs', () => {
    const inputs: SpeakerSlugInput[] = [
      { id: 'a', name: 'Jane Doe', currentSlug: undefined },
      { id: 'b', name: 'John Roe', currentSlug: '' },
      { id: 'c', name: 'Amy Poe', currentSlug: '   ' },
    ]
    expect(resolveSpeakerSlugs(inputs)).toEqual([
      { id: 'a', slug: 'jane-doe', changed: true },
      { id: 'b', slug: 'john-roe', changed: true },
      { id: 'c', slug: 'amy-poe', changed: true },
    ])
  })

  it('canonicalizes non-url-safe slugs', () => {
    const inputs: SpeakerSlugInput[] = [
      { id: 'a', name: 'Jane Doe', currentSlug: 'Jane--Doe!' },
    ]
    expect(resolveSpeakerSlugs(inputs)).toEqual([
      { id: 'a', slug: 'jane-doe', changed: true },
    ])
  })

  it('falls back to "speaker" for nameless/emoji docs and suffixes collisions', () => {
    const inputs: SpeakerSlugInput[] = [
      { id: 'a', name: '', currentSlug: undefined },
      { id: 'b', name: '🎤', currentSlug: undefined },
      { id: 'c', name: null, currentSlug: undefined },
    ]
    const result = resolveSpeakerSlugs(inputs)
    const slugs = result.map((r) => r.slug).sort()
    expect(slugs).toEqual(['speaker', 'speaker-2', 'speaker-3'])
    // All distinct.
    expect(new Set(slugs).size).toBe(3)
  })

  it('keeps the slug on the most-referenced doc and re-slugs the rest', () => {
    const inputs: SpeakerSlugInput[] = [
      {
        id: 'new',
        name: 'Jane Doe',
        currentSlug: 'jane-doe',
        referenceCount: 0,
      },
      {
        id: 'established',
        name: 'Jane Doe',
        currentSlug: 'jane-doe',
        referenceCount: 5,
      },
    ]
    const byId = Object.fromEntries(
      resolveSpeakerSlugs(inputs).map((r) => [r.id, r]),
    )
    expect(byId.established).toEqual({
      id: 'established',
      slug: 'jane-doe',
      changed: false,
    })
    expect(byId.new).toEqual({ id: 'new', slug: 'jane-doe-2', changed: true })
  })

  it('breaks reference ties by oldest _createdAt', () => {
    const inputs: SpeakerSlugInput[] = [
      {
        id: 'younger',
        name: 'Jane Doe',
        currentSlug: 'jane-doe',
        referenceCount: 2,
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'older',
        name: 'Jane Doe',
        currentSlug: 'jane-doe',
        referenceCount: 2,
        createdAt: '2020-01-01T00:00:00Z',
      },
    ]
    const byId = Object.fromEntries(
      resolveSpeakerSlugs(inputs).map((r) => [r.id, r]),
    )
    expect(byId.older.slug).toBe('jane-doe')
    expect(byId.younger.slug).toBe('jane-doe-2')
  })

  it('does not let a re-slug collide with another group winner', () => {
    // 'jane-doe-2' is already a valid unique slug held by a different speaker;
    // the loser of the 'jane-doe' collision must skip it to 'jane-doe-3'.
    const inputs: SpeakerSlugInput[] = [
      {
        id: 'keep',
        name: 'Jane Doe',
        currentSlug: 'jane-doe',
        referenceCount: 9,
      },
      { id: 'other', name: 'Jane Doe', currentSlug: 'jane-doe-2' },
      {
        id: 'loser',
        name: 'Jane Doe',
        currentSlug: 'jane-doe',
        referenceCount: 0,
      },
    ]
    const byId = Object.fromEntries(
      resolveSpeakerSlugs(inputs).map((r) => [r.id, r]),
    )
    expect(byId.keep.slug).toBe('jane-doe')
    expect(byId.other.slug).toBe('jane-doe-2')
    expect(byId.other.changed).toBe(false)
    expect(byId.loser.slug).toBe('jane-doe-3')
  })

  it('produces globally unique slugs and is idempotent on a mixed dataset', () => {
    const inputs: SpeakerSlugInput[] = [
      { id: '1', name: 'Jane Doe', currentSlug: 'jane-doe' },
      { id: '2', name: 'Jane Doe', currentSlug: undefined },
      { id: '3', name: 'Jane Doe', currentSlug: 'Jane Doe' },
      { id: '4', name: '', currentSlug: '' },
      { id: '5', name: '🎤', currentSlug: '  ' },
      { id: '6', name: 'Unique Person', currentSlug: 'unique-person' },
    ]
    const first = resolveSpeakerSlugs(inputs)
    const slugs = first.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length) // all unique
    for (const r of first) expect(isCanonicalSpeakerSlug(r.slug)).toBe(true)

    // Feeding the resolved slugs back in must be a no-op (idempotent).
    const second = resolveSpeakerSlugs(
      inputs.map((input) => ({
        ...input,
        currentSlug: first.find((r) => r.id === input.id)!.slug,
      })),
    )
    expect(second.every((r) => r.changed === false)).toBe(true)
    expect(second.map((r) => r.slug)).toEqual(slugs)
  })
})
