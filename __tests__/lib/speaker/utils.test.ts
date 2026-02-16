/**
 * @vitest-environment jsdom
 */
import {
  generateSlugFromName,
  getSpeakerSlug,
  getSpeakerFilename,
} from '@/lib/speaker/utils'
import { Speaker } from '@/lib/speaker/types'

describe('Speaker Utils', () => {
  describe('generateSlugFromName', () => {
    it('should convert spaces to hyphens and lowercase', () => {
      expect(generateSlugFromName('John Doe')).toBe('john-doe')
    })

    it('should handle multiple spaces', () => {
      expect(generateSlugFromName('John   Michael   Doe')).toBe(
        'john-michael-doe',
      )
    })

    it('should trim whitespace', () => {
      expect(generateSlugFromName('  Jane Smith  ')).toBe('jane-smith')
    })

    it('should handle already lowercase names', () => {
      expect(generateSlugFromName('john doe')).toBe('john-doe')
    })

    it('should handle mixed case names', () => {
      expect(generateSlugFromName('JoHn DoE')).toBe('john-doe')
    })

    it('should return empty string for empty input', () => {
      expect(generateSlugFromName('')).toBe('')
    })

    it('should return empty string for whitespace-only input', () => {
      expect(generateSlugFromName('   ')).toBe('')
    })

    it('should return empty string for null input', () => {
      expect(generateSlugFromName(null as unknown as string)).toBe('')
    })

    it('should return empty string for undefined input', () => {
      expect(generateSlugFromName(undefined as unknown as string)).toBe('')
    })

    it('should handle single word names', () => {
      expect(generateSlugFromName('Madonna')).toBe('madonna')
    })

    it('should handle names with special characters', () => {
      expect(generateSlugFromName('José García')).toBe('josé-garcía')
    })
  })

  describe('getSpeakerSlug', () => {
    it('should use existing slug if available', () => {
      const speaker = {
        slug: 'john-d',
        name: 'John Doe',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerSlug(speaker)).toBe('john-d')
    })

    it('should generate slug from name if slug is not available', () => {
      const speaker = {
        name: 'Jane Smith',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerSlug(speaker)).toBe('jane-smith')
    })

    it('should generate slug from name if slug is empty', () => {
      const speaker = {
        slug: '',
        name: 'Jane Smith',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerSlug(speaker)).toBe('jane-smith')
    })

    it('should generate slug from name if slug is whitespace', () => {
      const speaker = {
        slug: '   ',
        name: 'Jane Smith',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerSlug(speaker)).toBe('jane-smith')
    })

    it('should return fallback if both slug and name are unavailable', () => {
      const speaker = {
        name: '',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerSlug(speaker)).toBe('unknown-speaker')
    })

    it('should return fallback if name is whitespace only', () => {
      const speaker = {
        name: '   ',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerSlug(speaker)).toBe('unknown-speaker')
    })

    it('should handle names with multiple spaces', () => {
      const speaker = {
        name: 'John   Michael   Doe',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerSlug(speaker)).toBe('john-michael-doe')
    })

    it('should prioritize slug over name', () => {
      const speaker = {
        slug: 'custom-slug',
        name: 'Different Name',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerSlug(speaker)).toBe('custom-slug')
    })
  })

  describe('getSpeakerFilename', () => {
    it('should return the same result as getSpeakerSlug', () => {
      const speaker = {
        slug: 'john-d',
        name: 'John Doe',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerFilename(speaker)).toBe(getSpeakerSlug(speaker))
      expect(getSpeakerFilename(speaker)).toBe('john-d')
    })

    it('should handle missing slug', () => {
      const speaker = {
        name: 'Jane Smith',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerFilename(speaker)).toBe('jane-smith')
    })

    it('should handle missing name', () => {
      const speaker = {
        name: '',
      } as Pick<Speaker, 'slug' | 'name'>

      expect(getSpeakerFilename(speaker)).toBe('unknown-speaker')
    })
  })

  describe('Data consistency', () => {
    it('should always return consistent results for the same input', () => {
      const speaker = {
        name: 'John Doe',
      } as Pick<Speaker, 'slug' | 'name'>

      const slug1 = getSpeakerSlug(speaker)
      const slug2 = getSpeakerSlug(speaker)
      const slug3 = getSpeakerSlug(speaker)

      expect(slug1).toBe(slug2)
      expect(slug2).toBe(slug3)
      expect(slug1).toBe('john-doe')
    })

    it('should handle edge cases consistently', () => {
      const testCases = [
        { name: '', expected: 'unknown-speaker' },
        { name: '   ', expected: 'unknown-speaker' },
        { name: 'A', expected: 'a' },
        { name: '  A  ', expected: 'a' },
      ]

      testCases.forEach(({ name, expected }) => {
        const speaker = { name } as Pick<Speaker, 'slug' | 'name'>
        expect(getSpeakerSlug(speaker)).toBe(expected)
      })
    })
  })
})
