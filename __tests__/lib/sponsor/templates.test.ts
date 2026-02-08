import { describe, it, expect } from '@jest/globals'
import {
  processTemplateVariables,
  processPortableTextVariables,
  buildTemplateVariables,
  suggestTemplateCategory,
  suggestTemplateLanguage,
  findBestTemplate,
} from '@/lib/sponsor/templates'
import type { SponsorEmailTemplate } from '@/lib/sponsor/types'

describe('processTemplateVariables', () => {
  it('replaces single variable', () => {
    expect(
      processTemplateVariables('Hello {{{NAME}}}', { NAME: 'World' }),
    ).toBe('Hello World')
  })

  it('replaces multiple occurrences of the same variable', () => {
    expect(processTemplateVariables('{{{X}}} and {{{X}}}', { X: 'yes' })).toBe(
      'yes and yes',
    )
  })

  it('replaces multiple different variables', () => {
    expect(
      processTemplateVariables('{{{A}}} meets {{{B}}}', {
        A: 'Foo',
        B: 'Bar',
      }),
    ).toBe('Foo meets Bar')
  })

  it('leaves unknown variables untouched', () => {
    expect(
      processTemplateVariables('Hello {{{UNKNOWN}}}', { NAME: 'World' }),
    ).toBe('Hello {{{UNKNOWN}}}')
  })

  it('handles empty variables map', () => {
    expect(processTemplateVariables('Hello {{{NAME}}}', {})).toBe(
      'Hello {{{NAME}}}',
    )
  })

  it('handles text without variables', () => {
    expect(processTemplateVariables('Plain text', { A: 'B' })).toBe(
      'Plain text',
    )
  })

  it('handles empty string', () => {
    expect(processTemplateVariables('', { A: 'B' })).toBe('')
  })
})

describe('processPortableTextVariables', () => {
  const makeBlock = (text: string, key = 'k1') => ({
    _type: 'block' as const,
    _key: key,
    children: [{ _type: 'span' as const, _key: `${key}-s`, text }],
    style: 'normal' as const,
  })

  it('replaces variables in text spans', () => {
    const blocks = [makeBlock('Hello {{{NAME}}}')]
    const result = processPortableTextVariables(blocks, { NAME: 'Cloud' })
    expect(result[0].children?.[0].text).toBe('Hello Cloud')
  })

  it('does not mutate original blocks', () => {
    const blocks = [makeBlock('Hello {{{NAME}}}')]
    processPortableTextVariables(blocks, { NAME: 'Cloud' })
    expect(blocks[0].children?.[0].text).toBe('Hello {{{NAME}}}')
  })

  it('handles multiple blocks', () => {
    const blocks = [
      makeBlock('{{{A}}} first', 'k1'),
      makeBlock('{{{B}}} second', 'k2'),
    ]
    const result = processPortableTextVariables(blocks, {
      A: 'Alpha',
      B: 'Beta',
    })
    expect(result[0].children?.[0].text).toBe('Alpha first')
    expect(result[1].children?.[0].text).toBe('Beta second')
  })

  it('skips non-block types', () => {
    const blocks = [{ _type: 'image', _key: 'img1', url: 'test.png' }]
    const result = processPortableTextVariables(blocks, { A: 'B' })
    expect(result[0]._type).toBe('image')
  })

  it('skips non-span children', () => {
    const block = {
      _type: 'block' as const,
      _key: 'k1',
      children: [
        { _type: 'inlineObject' as const, _key: 'io1', value: '{{{NAME}}}' },
      ],
    }
    const result = processPortableTextVariables([block], { NAME: 'Test' })
    expect(result[0].children?.[0]._type).toBe('inlineObject')
  })

  it('handles empty blocks array', () => {
    expect(processPortableTextVariables([], { A: 'B' })).toEqual([])
  })

  it('expands variables in markDef link hrefs', () => {
    const block = {
      _type: 'block' as const,
      _key: 'k1',
      markDefs: [
        { _key: 'link1', _type: 'link', href: '{{{CONFERENCE_URL}}}' },
      ],
      children: [
        {
          _type: 'span' as const,
          _key: 's1',
          text: 'Visit our website',
          marks: ['link1'],
        },
      ],
    }
    const result = processPortableTextVariables([block], {
      CONFERENCE_URL: 'https://example.com',
    })
    const linkDef = result[0].markDefs?.find((md) => md._key === 'link1')
    expect(linkDef?.href).toBe('https://example.com')
  })

  it('auto-links CONFERENCE_URL variable in text', () => {
    const blocks = [makeBlock('Visit {{{CONFERENCE_URL}}} for details')]
    const result = processPortableTextVariables(blocks, {
      CONFERENCE_URL: 'https://conf.example.com',
    })
    const children = result[0].children!
    expect(children).toHaveLength(3)
    expect(children[0].text).toBe('Visit ')
    expect(children[1].text).toBe('https://conf.example.com')
    expect(children[1].marks).toHaveLength(1)
    expect(children[2].text).toBe(' for details')

    const linkMark = result[0].markDefs?.find(
      (md) => md._key === children[1].marks![0],
    )
    expect(linkMark?._type).toBe('link')
    expect(linkMark?.href).toBe('https://conf.example.com')
  })

  it('auto-links PROSPECTUS_URL variable', () => {
    const blocks = [makeBlock('{{{PROSPECTUS_URL}}}')]
    const result = processPortableTextVariables(blocks, {
      PROSPECTUS_URL: 'https://slides.example.com/deck',
    })
    const children = result[0].children!
    expect(children).toHaveLength(1)
    expect(children[0].text).toBe('https://slides.example.com/deck')
    expect(children[0].marks).toHaveLength(1)
    expect(result[0].markDefs).toHaveLength(1)
    expect(result[0].markDefs![0].href).toBe('https://slides.example.com/deck')
  })

  it('does not auto-link non-URL variables', () => {
    const blocks = [makeBlock('Hello {{{SENDER_NAME}}}')]
    const result = processPortableTextVariables(blocks, {
      SENDER_NAME: 'Alice',
    })
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children![0].text).toBe('Hello Alice')
    expect(result[0].markDefs).toHaveLength(0)
  })

  it('does not double-link when span already has a link mark', () => {
    const block = {
      _type: 'block' as const,
      _key: 'k1',
      markDefs: [
        { _key: 'link1', _type: 'link', href: '{{{CONFERENCE_URL}}}' },
      ],
      children: [
        {
          _type: 'span' as const,
          _key: 's1',
          text: '{{{CONFERENCE_URL}}}',
          marks: ['link1'],
        },
      ],
    }
    const result = processPortableTextVariables([block], {
      CONFERENCE_URL: 'https://example.com',
    })
    // Should expand text and href but not create additional link marks
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children![0].text).toBe('https://example.com')
    expect(result[0].children![0].marks).toEqual(['link1'])
    expect(result[0].markDefs).toHaveLength(1)
  })
})

describe('buildTemplateVariables', () => {
  it('builds basic variables', () => {
    const vars = buildTemplateVariables({
      sponsorName: 'Acme Corp',
      conference: { title: 'CloudConf 2026' },
    })
    expect(vars.SPONSOR_NAME).toBe('Acme Corp')
    expect(vars.CONFERENCE_TITLE).toBe('CloudConf 2026')
  })

  it('includes optional fields when provided', () => {
    const vars = buildTemplateVariables({
      sponsorName: 'Acme',
      contactNames: 'Yves and Petter',
      conference: {
        title: 'Conf',
        city: 'Bergen',
        start_date: '2026-06-10',
        organizer: 'Cloud Native Bergen',
        domains: ['conf.example.com'],
        prospectus_url: 'https://slides.example.com/sponsor',
      },
      senderName: 'Alice',
      tierName: 'Gold',
    })
    expect(vars.CONTACT_NAMES).toBe('Yves and Petter')
    expect(vars.ORG_NAME).toBe('Cloud Native Bergen')
    expect(vars.CONFERENCE_CITY).toBe('Bergen')
    expect(vars.CONFERENCE_DATE).toBe('10/06-26')
    expect(vars.CONFERENCE_YEAR).toBe('2026')
    expect(vars.CONFERENCE_URL).toBe('https://conf.example.com')
    expect(vars.SPONSOR_PAGE_URL).toBe('https://conf.example.com/sponsor')
    expect(vars.PROSPECTUS_URL).toBe('https://slides.example.com/sponsor')
    expect(vars.SENDER_NAME).toBe('Alice')
    expect(vars.TIER_NAME).toBe('Gold')
  })

  it('formats date as DD/MM-YY', () => {
    const vars = buildTemplateVariables({
      sponsorName: 'Acme',
      conference: { title: 'Conf', start_date: '2026-06-10' },
    })
    expect(vars.CONFERENCE_DATE).toBe('10/06-26')
    expect(vars.CONFERENCE_YEAR).toBe('2026')
  })

  it('omits optional fields when not provided', () => {
    const vars = buildTemplateVariables({
      sponsorName: 'Acme',
      conference: { title: 'Conf' },
    })
    expect(vars.CONTACT_NAMES).toBeUndefined()
    expect(vars.ORG_NAME).toBeUndefined()
    expect(vars.CONFERENCE_CITY).toBeUndefined()
    expect(vars.CONFERENCE_DATE).toBeUndefined()
    expect(vars.CONFERENCE_YEAR).toBeUndefined()
    expect(vars.CONFERENCE_URL).toBeUndefined()
    expect(vars.SPONSOR_PAGE_URL).toBeUndefined()
    expect(vars.PROSPECTUS_URL).toBeUndefined()
    expect(vars.SENDER_NAME).toBeUndefined()
    expect(vars.TIER_NAME).toBeUndefined()
  })
})

describe('suggestTemplateCategory', () => {
  it('returns returning-sponsor when tag is present', () => {
    expect(
      suggestTemplateCategory({
        tags: ['returning-sponsor'],
        status: 'prospect',
      }),
    ).toBe('returning-sponsor')
  })

  it('returns cold-outreach when tag is present', () => {
    expect(
      suggestTemplateCategory({ tags: ['cold-outreach'], status: 'contacted' }),
    ).toBe('cold-outreach')
  })

  it('returns follow-up for contacted status', () => {
    expect(suggestTemplateCategory({ status: 'contacted' })).toBe('follow-up')
  })

  it('returns follow-up for negotiating status', () => {
    expect(suggestTemplateCategory({ status: 'negotiating' })).toBe('follow-up')
  })

  it('returns follow-up when needs-follow-up tag is set', () => {
    expect(
      suggestTemplateCategory({
        tags: ['needs-follow-up'],
        status: 'prospect',
      }),
    ).toBe('follow-up')
  })

  it('defaults to cold-outreach for prospects with no tags', () => {
    expect(suggestTemplateCategory({ status: 'prospect' })).toBe(
      'cold-outreach',
    )
  })

  it('defaults to cold-outreach with no context', () => {
    expect(suggestTemplateCategory({})).toBe('cold-outreach')
  })

  it('prioritizes tags over status', () => {
    expect(
      suggestTemplateCategory({
        tags: ['returning-sponsor'],
        status: 'contacted',
      }),
    ).toBe('returning-sponsor')
  })
})

describe('suggestTemplateLanguage', () => {
  it('returns no when org number is present', () => {
    expect(suggestTemplateLanguage({ orgNumber: '123456789' })).toBe('no')
  })

  it('returns no for NOK currency', () => {
    expect(suggestTemplateLanguage({ currency: 'NOK' })).toBe('no')
  })

  it('returns en for USD currency', () => {
    expect(suggestTemplateLanguage({ currency: 'USD' })).toBe('en')
  })

  it('returns en for EUR currency', () => {
    expect(suggestTemplateLanguage({ currency: 'EUR' })).toBe('en')
  })

  it('returns no for .no website domain', () => {
    expect(suggestTemplateLanguage({ website: 'https://example.no' })).toBe(
      'no',
    )
  })

  it('defaults to no with no context', () => {
    expect(suggestTemplateLanguage({})).toBe('no')
  })

  it('prioritizes org number over currency', () => {
    expect(
      suggestTemplateLanguage({ orgNumber: '123456789', currency: 'EUR' }),
    ).toBe('no')
  })
})

describe('findBestTemplate', () => {
  const makeTemplate = (
    overrides: Partial<SponsorEmailTemplate> & { _id: string },
  ): SponsorEmailTemplate => ({
    _createdAt: '',
    _updatedAt: '',
    title: 'Template',
    slug: { current: 'template' },
    category: 'cold-outreach',
    language: 'no',
    subject: 'Subject',
    ...overrides,
  })

  it('returns undefined for empty list', () => {
    expect(findBestTemplate([], 'cold-outreach', 'no')).toBeUndefined()
  })

  it('prefers exact category + language match', () => {
    const templates = [
      makeTemplate({ _id: '1', category: 'follow-up', language: 'en' }),
      makeTemplate({ _id: '2', category: 'cold-outreach', language: 'no' }),
      makeTemplate({ _id: '3', category: 'cold-outreach', language: 'en' }),
    ]
    expect(findBestTemplate(templates, 'cold-outreach', 'no')?._id).toBe('2')
  })

  it('prefers category match over language match alone', () => {
    const templates = [
      makeTemplate({ _id: '1', category: 'follow-up', language: 'no' }),
      makeTemplate({ _id: '2', category: 'cold-outreach', language: 'en' }),
    ]
    expect(findBestTemplate(templates, 'cold-outreach', 'no')?._id).toBe('2')
  })

  it('uses is_default as tiebreaker', () => {
    const templates = [
      makeTemplate({ _id: '1', category: 'cold-outreach', language: 'no' }),
      makeTemplate({
        _id: '2',
        category: 'cold-outreach',
        language: 'no',
        is_default: true,
      }),
    ]
    expect(findBestTemplate(templates, 'cold-outreach', 'no')?._id).toBe('2')
  })

  it('returns something even with no matches', () => {
    const templates = [
      makeTemplate({ _id: '1', category: 'custom', language: 'en' }),
    ]
    expect(findBestTemplate(templates, 'cold-outreach', 'no')?._id).toBe('1')
  })
})
