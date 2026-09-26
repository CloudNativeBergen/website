import { describe, expect, it } from 'vitest'
import { StudioSearchParamsSchema } from '@/server/schemas/studio'
import {
  STUDIO_TABS,
  openInStudioHref,
  opensTheCard,
  studioOriginSchema,
} from './studio'

describe('openInStudioHref', () => {
  it('opens the tab on its speaker or sponsor', () => {
    expect(
      openInStudioHref({ tab: 'speakers', speakerId: 'ada', sponsorId: null }),
    ).toBe('/admin/marketing/studio?tab=speakers&speaker=ada')
    expect(
      openInStudioHref({ tab: 'sponsors', speakerId: null, sponsorId: 'acme' }),
    ).toBe('/admin/marketing/studio?tab=sponsors&sponsor=acme')
  })

  it('opens a subjectless tab alone, and never pairs a subject with the wrong tab', () => {
    expect(
      openInStudioHref({
        tab: 'meme-generator',
        speakerId: 'ada',
        sponsorId: null,
      }),
    ).toBe('/admin/marketing/studio?tab=meme-generator')
  })

  it('names every tab in a form the studio page accepts', () => {
    for (const tab of STUDIO_TABS) {
      const href = openInStudioHref({
        tab,
        speakerId: 'ada',
        sponsorId: 'acme',
      })
      const query = Object.fromEntries(new URL(href, 'https://x').searchParams)
      expect(StudioSearchParamsSchema.parse(query).tab).toBe(tab)
    }
  })
})

describe('studioOriginSchema', () => {
  it('accepts the five tabs and nothing else', () => {
    expect(STUDIO_TABS).toHaveLength(5)
    expect(studioOriginSchema.safeParse({ tab: 'video' }).success).toBe(false)
    expect(studioOriginSchema.parse({ tab: 'speakers', speaker: 'x' })).toEqual(
      { tab: 'speakers' },
    )
  })
})

describe('opensTheCard', () => {
  it('is true only where the link lands on the card itself', () => {
    const at = (
      tab: (typeof STUDIO_TABS)[number],
      speakerId: string | null = null,
      sponsorId: string | null = null,
    ) => opensTheCard({ tab, speakerId, sponsorId })
    expect(at('speakers', 'ada')).toBe(true)
    expect(at('sponsors', null, 'acme')).toBe(true)
    expect(at('conference')).toBe(true)
    expect(at('speakers')).toBe(false)
    expect(at('sponsors')).toBe(false)
    expect(at('meme-generator', 'ada', 'acme')).toBe(false)
    expect(at('photo-gallery')).toBe(false)
  })
})
