/**
 * @vitest-environment node
 *
 * The last step of the tagging chain (#1152, spec §2, §7): the five built-in
 * beats about a person or a company tag their subject — built from the
 * BUILT-IN recipes as they ship, not from a copy with the flag added.
 */

import { describe, expect, it } from 'vitest'
import { beatRecipes, buildSubjectBeat, type BeatDates } from '../expansion'
import { BUILTIN_TEMPLATE } from '../template'
import type { BlueskyTag } from './body'

const DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const tag: BlueskyTag = { status: 'tagged', handle: 'alice.dev', did: DID }

function build(
  campaignKey: string,
  beat: string,
  type: 'speaker' | 'talk' | 'sponsor',
  people: { _id: string; name: string }[],
) {
  const campaign = BUILTIN_TEMPLATE.campaigns.find(
    (c) => c.key === campaignKey,
  )!
  const recipes = beatRecipes(campaign, beat)
  const dates: BeatDates = new Map(
    recipes.map((r) => [
      r.key,
      { at: '2027-04-08T16:00:00.000Z', anchor: null, provisional: false },
    ]),
  )
  let n = 0
  return buildSubjectBeat({
    recipes,
    subject: {
      _id: 'subject-1',
      type,
      values: {
        name: 'Alice Liddell',
        company: 'SRE',
        title: 'Pods',
        hook: 'Why pods',
        tier: 'Gold',
      },
      people,
    },
    tags: new Map([['spk-alice', tag]]),
    dates,
    campaign: { _id: 'camp', key: campaignKey },
    planId: 'plan',
    conference: { _id: 'conf-A', baseUrl: 'https://example.dev' },
    values: { event: 'CNB 2027' },
    assigneeId: 'owner',
    origin: 'trigger',
    taskId: (key) => `task:${key}`,
    newShortCode: () => `code${++n}`,
    newId: (t) => `${t}.${++n}`,
  })
}

const body = (
  records: ReturnType<typeof build>,
  platform: 'bluesky' | 'linkedin',
) => records.variants.find((v) => v.platform === platform)!

const alice = [{ _id: 'spk-alice', name: 'Alice Liddell' }]

describe('the built-in recipes tag their subject', () => {
  it.each([
    ['keynotes', 'keynoteCard', 'speaker'],
    ['speakers', 'speakerCard', 'speaker'],
    ['programme', 'talkTeaser', 'talk'],
    ['postEvent', 'videoDrip', 'talk'],
  ] as const)(
    '%s / %s: the Bluesky body tags, LinkedIn keeps the name',
    (campaignKey, beat, type) => {
      const records = build(campaignKey, beat, type, alice)
      const bluesky = body(records, 'bluesky')
      expect(bluesky.body).toContain('@alice.dev')
      expect(bluesky.body).not.toContain('Alice Liddell')
      expect(bluesky.mentions).toEqual([
        expect.objectContaining({
          handle: 'alice.dev',
          did: DID,
          status: 'tagged',
          speakerId: 'spk-alice',
        }),
      ])
      expect(body(records, 'linkedin').body).toContain('Alice Liddell')
      expect(body(records, 'linkedin').body).not.toContain('@alice.dev')
    },
  )

  // Sponsor handles arrive with #1154: the flag is on, and a sponsor
  // subject has nobody to tag yet, so the copy is its plain name.
  it('sponsorCard: switched on, and plain until sponsors have handles (#1154)', () => {
    const records = build('sponsorAcquisition', 'sponsorCard', 'sponsor', [])
    expect(body(records, 'bluesky').body).toContain('Alice Liddell')
    expect(body(records, 'bluesky').mentions ?? []).toEqual([])
  })
})
