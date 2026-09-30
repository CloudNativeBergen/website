import { describe, expect, it } from 'vitest'
import { StudioSearchParamsSchema } from '@/server/schemas/studio'
import {
  STUDIO_TABS,
  openInStudioHref,
  opensTheCard,
  projectDeleted,
  studioOriginSchema,
} from './studio'

const NO_PROJECT = { project: null }

describe('openInStudioHref', () => {
  it('opens the tab on its speaker or sponsor', () => {
    expect(
      openInStudioHref({
        tab: 'speakers',
        speakerId: 'ada',
        sponsorId: null,
        ...NO_PROJECT,
      }),
    ).toBe('/admin/marketing/studio?tab=speakers&speaker=ada')
    expect(
      openInStudioHref({
        tab: 'sponsors',
        speakerId: null,
        sponsorId: 'acme',
        ...NO_PROJECT,
      }),
    ).toBe('/admin/marketing/studio?tab=sponsors&sponsor=acme')
  })

  it('opens a subjectless tab alone, and never pairs a subject with the wrong tab', () => {
    expect(
      openInStudioHref({
        tab: 'meme-generator',
        speakerId: 'ada',
        sponsorId: null,
        ...NO_PROJECT,
      }),
    ).toBe('/admin/marketing/studio?tab=meme-generator')
  })

  it('names every tab in a form the studio page accepts', () => {
    for (const tab of STUDIO_TABS) {
      const href = openInStudioHref({
        tab,
        speakerId: 'ada',
        sponsorId: 'acme',
        ...NO_PROJECT,
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
    ) => opensTheCard({ tab, speakerId, sponsorId, ...NO_PROJECT })
    expect(at('speakers', 'ada')).toBe(true)
    expect(at('sponsors', null, 'acme')).toBe(true)
    expect(at('conference')).toBe(true)
    expect(at('speakers')).toBe(false)
    expect(at('sponsors')).toBe(false)
    expect(at('meme-generator', 'ada', 'acme')).toBe(false)
    expect(at('photo-gallery')).toBe(false)
  })
})

describe('an exported video’s project (#1182)', () => {
  const made = (exists: boolean) => ({
    tab: 'meme-generator' as const,
    speakerId: null,
    sponsorId: null,
    project: { _id: 'vp-1', exists },
  })

  it('opens the project in the studio while it exists', () => {
    expect(openInStudioHref(made(true))).toBe(
      '/admin/marketing/studio?tab=meme-generator&project=vp-1',
    )
    expect(opensTheCard(made(true))).toBe(true)
    expect(projectDeleted(made(true))).toBe(false)
  })

  it('opens the tab alone, and says so, once the project is deleted', () => {
    expect(openInStudioHref(made(false))).toBe(
      '/admin/marketing/studio?tab=meme-generator',
    )
    expect(opensTheCard(made(false))).toBe(false)
    expect(projectDeleted(made(false))).toBe(true)
  })

  it('never pairs a project with another tab', () => {
    expect(
      openInStudioHref({ ...made(true), tab: 'speakers', speakerId: 'ada' }),
    ).toBe('/admin/marketing/studio?tab=speakers&speaker=ada')
    expect(projectDeleted({ ...made(false), tab: 'speakers' })).toBe(false)
  })

  it('is in the page’s URL shape', () => {
    const query = Object.fromEntries(
      new URL(openInStudioHref(made(true)), 'https://x').searchParams,
    )
    expect(StudioSearchParamsSchema.parse(query)).toMatchObject({
      tab: 'meme-generator',
      project: 'vp-1',
    })
  })

  it('takes the backgrounds shown only on the meme generator tab, as published ids', () => {
    const sources = [{ galleryAssetId: 'asset-hall' }, { fileId: 'image-ada' }]
    expect(
      studioOriginSchema.parse({ tab: 'meme-generator', sources }),
    ).toEqual({ tab: 'meme-generator', sources })
    expect(
      studioOriginSchema.safeParse({ tab: 'speakers', sources }).success,
    ).toBe(false)
    expect(
      studioOriginSchema.safeParse({
        tab: 'meme-generator',
        sources: [{ galleryAssetId: 'drafts.asset-hall' }],
      }).success,
    ).toBe(false)
  })

  it('takes a project id only on the meme generator tab, and only a published one', () => {
    expect(
      studioOriginSchema.parse({ tab: 'meme-generator', projectId: 'vp-1' }),
    ).toEqual({ tab: 'meme-generator', projectId: 'vp-1' })
    expect(
      studioOriginSchema.safeParse({ tab: 'speakers', projectId: 'vp-1' })
        .success,
    ).toBe(false)
    expect(
      studioOriginSchema.safeParse({
        tab: 'meme-generator',
        projectId: 'drafts.vp-1',
      }).success,
    ).toBe(false)
    expect(
      studioOriginSchema.safeParse({ tab: 'meme-generator', projectId: '' })
        .success,
    ).toBe(false)
  })
})
