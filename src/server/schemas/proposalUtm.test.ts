/**
 * FIRST-TOUCH attribution on a proposal (#1018). Two guarantees are pinned
 * here: a mangled tag NEVER costs a speaker their submission, and no update
 * path can rewrite where a proposal came from.
 */
import { describe, expect, it } from 'vitest'
import {
  CreateProposalSchema,
  ProposalAdminCreateSchema,
  ProposalAdminUpdateSchema,
  ProposalUpdateSchema,
  ProposalUtmSchema,
} from './proposal'

describe('ProposalUtmSchema — never blocks a submission', () => {
  it('keeps the four tags', () => {
    expect(
      ProposalUtmSchema.parse({
        source: 'bluesky',
        medium: 'social',
        campaign: 'cfp',
        content: 'cfp:launch:bluesky',
      }),
    ).toEqual({
      source: 'bluesky',
      medium: 'social',
      campaign: 'cfp',
      content: 'cfp:launch:bluesky',
    })
  })

  it('DROPS a malformed tag instead of refusing the proposal', () => {
    expect(
      ProposalUtmSchema.parse({ campaign: 'cfp', source: { evil: true } }),
    ).toEqual({ campaign: 'cfp', source: undefined })
    expect(
      ProposalUtmSchema.parse({ campaign: 'cfp', medium: 'x'.repeat(500) }),
    ).toEqual({ campaign: 'cfp', medium: undefined })
  })

  it('is undefined for an empty, blank or nonsense object', () => {
    expect(ProposalUtmSchema.parse(undefined)).toBeUndefined()
    expect(ProposalUtmSchema.parse({})).toBeUndefined()
    expect(ProposalUtmSchema.parse({ campaign: '   ' })).toBeUndefined()
    expect(ProposalUtmSchema.parse('not an object')).toBeUndefined()
    expect(ProposalUtmSchema.parse(['cfp'])).toBeUndefined()
  })

  it('trims, so a link with a trailing space does not make its own Campaign', () => {
    expect(ProposalUtmSchema.parse({ campaign: '  cfp  ' })).toEqual({
      campaign: 'cfp',
      source: undefined,
      medium: undefined,
      content: undefined,
    })
  })
})

describe('the create path accepts it and every update path refuses it', () => {
  const data = { title: 'A talk', utm: { campaign: 'cfp' } }

  it('carries the tags through proposal.create', () => {
    const parsed = CreateProposalSchema.parse({ data })
    expect(parsed.data.utm).toEqual({
      campaign: 'cfp',
      source: undefined,
      medium: undefined,
      content: undefined,
    })
  })

  it('a garbage utm still leaves a creatable proposal', () => {
    const parsed = CreateProposalSchema.parse({
      data: { title: 'A talk', utm: 'not an object' },
    })
    expect(parsed.data.title).toBe('A talk')
    expect(parsed.data.utm).toBeUndefined()
  })

  it('STRIPS it from the speaker update, so an edit cannot rewrite attribution', () => {
    const parsed = ProposalUpdateSchema.parse(data)
    expect(parsed).not.toHaveProperty('utm')
  })

  it('STRIPS it from the organizer update too', () => {
    expect(ProposalAdminUpdateSchema.parse(data)).not.toHaveProperty('utm')
  })

  it('STRIPS it from the organizer create: a hand-typed proposal followed no link', () => {
    const parsed = ProposalAdminCreateSchema.safeParse({
      ...data,
      description: [{ _type: 'block' }],
      language: 'english',
      format: 'lightning_10',
      level: 'beginner',
      audiences: ['developer'],
      topics: [{ _type: 'reference', _ref: 'topic-1' }],
      tos: true,
      speakers: ['sp-1'],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).not.toHaveProperty('utm')
  })
})
