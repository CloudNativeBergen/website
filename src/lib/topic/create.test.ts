import { describe, it, expect } from 'vitest'
import {
  defaultTopicColor,
  slugifyTopicTitle,
  TOPIC_COLOR_PALETTE,
  FALLBACK_TOPIC_SLUG,
} from './create'

describe('defaultTopicColor', () => {
  it('is deterministic for a given title', () => {
    expect(defaultTopicColor('Security')).toBe(defaultTopicColor('Security'))
  })

  it('always returns a palette color', () => {
    for (const title of ['a', 'Platform Engineering', 'Observability', '']) {
      expect(TOPIC_COLOR_PALETTE).toContain(defaultTopicColor(title))
    }
  })
})

describe('slugifyTopicTitle', () => {
  it('lowercases and kebab-cases', () => {
    expect(slugifyTopicTitle('Platform Engineering')).toBe(
      'platform-engineering',
    )
    expect(slugifyTopicTitle('  AI / ML  ')).toBe('ai-ml')
  })

  it('falls back for a title with no slug-safe characters', () => {
    expect(slugifyTopicTitle('🎉')).toBe(FALLBACK_TOPIC_SLUG)
    expect(slugifyTopicTitle('')).toBe(FALLBACK_TOPIC_SLUG)
  })

  it('caps length at 96 characters', () => {
    expect(slugifyTopicTitle('a'.repeat(200)).length).toBeLessThanOrEqual(96)
  })
})
