import { describe, expect, it } from 'vitest'
import type { ReviewItem } from '@/lib/marketing/plan-templates'
import {
  copyIssues,
  groupReview,
  includeOptional,
  optionalPreviewCampaigns,
  previewWindowWords,
  sameAnchor,
  saveDecisions,
  unknownTokens,
  type TemplatePreview,
} from './template-model'

const anchorItem: ReviewItem = {
  taskId: 'marketingTask.a',
  title: 'Venue photo post',
  campaignTitle: 'Final push',
  type: 'anchor',
  anchor: { milestone: 'CONFERENCE_START', offsetDays: -7 },
  date: '2026-11-05',
}
const copyItem: ReviewItem = {
  taskId: 'marketingTask.a',
  title: 'Venue photo post',
  campaignTitle: 'Final push',
  type: 'copy',
  text: 'See you at Bergen on 12 November 2026',
}

describe('groupReview', () => {
  it('keeps the two decisions of ONE Task apart', () => {
    const { anchors, copy } = groupReview([anchorItem, copyItem])
    expect(anchors).toEqual([anchorItem])
    expect(copy).toEqual([copyItem])
  })
})

describe('unknownTokens', () => {
  it('accepts every conference placeholder', () => {
    expect(
      unknownTokens('{event} {date} {venue} {city} {url} {eventTag}'),
    ).toEqual([])
  })
  it('reports a subject placeholder a static Task can never fill in', () => {
    expect(unknownTokens('Hi {name}, see you at {venue} — {company}')).toEqual([
      '{name}',
      '{company}',
    ])
  })
  it('reports each unknown token once', () => {
    expect(unknownTokens('{days} and {days}')).toEqual(['{days}'])
  })
  it('leaves prose braces alone', () => {
    expect(unknownTokens('a {1} b { } c')).toEqual([])
  })
})

describe('copyIssues', () => {
  it('names the tokens of the draft, not of the original text', () => {
    const items = groupReview([copyItem]).copy
    expect(copyIssues(items, { 'marketingTask.a': 'Hi {name}' })).toEqual({
      'marketingTask.a': '{name} cannot be filled in for a Task like this one.',
    })
    expect(
      copyIssues(items, { 'marketingTask.a': 'See you at {city}' }),
    ).toEqual({})
  })
  it('falls back to the untouched text when nothing was typed', () => {
    const items = groupReview([{ ...copyItem, text: 'Hello {tier}' }]).copy
    expect(copyIssues(items, {})['marketingTask.a']).toBe(
      '{tier} cannot be filled in for a Task like this one.',
    )
  })
})

describe('saveDecisions', () => {
  const review = [anchorItem, copyItem]

  it('sends nothing when every answer is the one already derived', () => {
    expect(
      saveDecisions(review, {
        anchors: { 'marketingTask.a': { ...anchorItem.anchor } },
        copy: { 'marketingTask.a': copyItem.text },
      }),
    ).toEqual({})
  })

  it('sends only the CHANGED anchor and the CHANGED copy', () => {
    const second: ReviewItem = {
      ...anchorItem,
      taskId: 'marketingTask.b',
      title: 'Programme post',
    }
    expect(
      saveDecisions([...review, second], {
        anchors: {
          'marketingTask.a': { milestone: 'CFP_CLOSE', offsetDays: 3 },
          'marketingTask.b': { ...second.anchor },
        },
        copy: { 'marketingTask.a': 'See you at {venue} on {date}' },
      }),
    ).toEqual({
      anchors: {
        'marketingTask.a': { milestone: 'CFP_CLOSE', offsetDays: 3 },
      },
      copy: { 'marketingTask.a': 'See you at {venue} on {date}' },
    })
  })

  it('sends an offset change on its own', () => {
    expect(
      saveDecisions(review, {
        anchors: {
          'marketingTask.a': { milestone: 'CONFERENCE_START', offsetDays: -6 },
        },
        copy: {},
      }),
    ).toEqual({
      anchors: {
        'marketingTask.a': { milestone: 'CONFERENCE_START', offsetDays: -6 },
      },
    })
  })
})

describe('sameAnchor', () => {
  it('compares both fields', () => {
    const a = { milestone: 'CFP_OPEN', offsetDays: 0 } as const
    expect(sameAnchor(a, { ...a })).toBe(true)
    expect(sameAnchor(a, { ...a, offsetDays: 1 })).toBe(false)
    expect(sameAnchor(a, { ...a, milestone: 'CFP_CLOSE' })).toBe(false)
  })
})

const preview: TemplatePreview = {
  name: 'Bergen playbook',
  version: 2,
  campaigns: [
    {
      key: 'cfp',
      title: 'Call for papers',
      optional: false,
      start: { milestone: 'CFP_OPEN', offsetDays: 0 },
      end: { milestone: 'CFP_CLOSE', offsetDays: 1 },
      primaryOutcome: 'cfpSubmissions',
      tasks: 9,
      recipes: ['Speaker card'],
    },
    {
      key: 'keynotes',
      title: 'Keynotes',
      optional: true,
      start: { milestone: 'SPEAKERS_ANNOUNCED', offsetDays: -28 },
      end: { milestone: 'SPEAKERS_ANNOUNCED', offsetDays: 0 },
      primaryOutcome: 'ticketsSoldInWindow',
      tasks: 4,
      recipes: [],
    },
  ],
}

describe('a previewed version', () => {
  it('says a Campaign window in words', () => {
    expect(previewWindowWords(preview.campaigns[0])).toBe(
      'CFP opens → CFP closes +1 d',
    )
    expect(previewWindowWords(preview.campaigns[1])).toBe(
      'Speakers announced −28 d → Speakers announced',
    )
  })
  it('offers only the optional Campaigns, ticked by default', () => {
    expect(optionalPreviewCampaigns(preview).map((c) => c.key)).toEqual([
      'keynotes',
    ])
    expect(includeOptional(preview, new Set())).toEqual(['keynotes'])
    expect(includeOptional(preview, new Set(['keynotes']))).toEqual([])
  })
  it('has nothing to include before a version is previewed', () => {
    expect(includeOptional(undefined, new Set())).toEqual([])
  })
})
