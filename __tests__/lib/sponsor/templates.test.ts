import { describe, it, expect } from '@jest/globals'
import {
  processTemplateVariables,
  processPortableTextVariables,
  buildTemplateVariables,
} from '@/lib/sponsor/templates'

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
    expect(vars.CONFERENCE_DATE).toBe('2026-06-10')
    expect(vars.CONFERENCE_YEAR).toBe('2026')
    expect(vars.CONFERENCE_URL).toBe('https://conf.example.com')
    expect(vars.SPONSOR_PAGE_URL).toBe('https://conf.example.com/sponsor')
    expect(vars.PROSPECTUS_URL).toBe('https://slides.example.com/sponsor')
    expect(vars.SENDER_NAME).toBe('Alice')
    expect(vars.TIER_NAME).toBe('Gold')
  })

  it('uses formatDate when provided', () => {
    const vars = buildTemplateVariables({
      sponsorName: 'Acme',
      conference: { title: 'Conf', start_date: '2026-06-10' },
      formatDate: () => 'June 10, 2026',
    })
    expect(vars.CONFERENCE_DATE).toBe('June 10, 2026')
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
