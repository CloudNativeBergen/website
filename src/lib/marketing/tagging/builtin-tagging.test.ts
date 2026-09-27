/**
 * @vitest-environment node
 *
 * The last step of the tagging chain (#1152, spec §2, §7): the five built-in
 * beats about a person or a company tag their subject — built from the
 * BUILT-IN recipes as they ship, not from a copy with the flag added.
 */

import { describe, expect, it } from 'vitest'
import {
  beatRecipes,
  buildSubjectBeat,
  talkSubject,
  type BeatDates,
} from '../expansion'
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
    // A talk's people come from its speakers (`{speakers}`, #1153), as
    // generation builds it; a speaker or sponsor from the plain values.
    subject:
      type === 'talk'
        ? talkSubject({
            _id: 'subject-1',
            title: 'Pods',
            speakers: people.map((p) => ({ ...p, title: 'SRE' })),
          })
        : {
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

  // Sponsors cannot be tagged until #1154 gives the sponsor company a
  // Bluesky handle: a sponsor subject has no people to look up, so the body
  // is the same with the flag on or off. What this ticket owns is the flag.
  it('sponsorCard: the Bluesky sibling ships with tagSubject on, LinkedIn without (#1154 adds the handles)', () => {
    const recipes = beatRecipes(
      BUILTIN_TEMPLATE.campaigns.find((c) => c.key === 'sponsorAcquisition')!,
      'sponsorCard',
    )
    expect(
      recipes
        .filter((r) => r.kind === 'publishing')
        .map((r) => [r.channel, r.tagSubject]),
    ).toEqual([
      ['linkedin', undefined],
      ['bluesky', true],
    ])
  })
})
