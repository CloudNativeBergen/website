/**
 * @vitest-environment node
 *
 * A talk's post names ALL of its speakers, in the talk's order (tagging spec
 * §4.2, #1153): `{name}` joins them, `{speakers}` adds each one's title, and
 * a tagging Bluesky body tags each speaker it can. The talk stays the Task's
 * subject: its key and target page do not depend on who speaks.
 */

import { describe, expect, it } from 'vitest'
import {
  beatRecipes,
  buildSubjectBeat,
  talkSubject,
  type BeatDates,
} from '../expansion'
import type { BlueskyTag } from './body'
import { BUILTIN_TEMPLATE } from '../template'

const DID_A = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const DID_C = 'did:plc:cccccccccccccccccccccccc'
const postEvent = BUILTIN_TEMPLATE.campaigns.find((c) =>
  c.recipes.some((r) => r.beat === 'videoDrip'),
)!

const alice = { _id: 'spk-alice', name: 'Alice Liddell', title: 'SRE, Acme' }
const bob = { _id: 'spk-bob', name: 'Bob Smith', title: 'CTO, Initech' }
const carol = { _id: 'spk-carol', name: 'Carol Danvers', title: null }

type Speaker = { _id: string; name: string | null; title: string | null }

function build(
  speakers: (Speaker | null)[],
  tags: Record<string, BlueskyTag | null> = {},
) {
  const rs = beatRecipes(postEvent, 'videoDrip').map((r) => ({
    ...r,
    ...(r.channel === 'bluesky' ? { tagSubject: true } : {}),
    // No built-in talk beat has alt text; one that did would read the plain map.
    alt: 'Talk card: "{title}" by {name}. {speakers}.',
  }))
  const dates: BeatDates = new Map(
    rs.map((r) => [
      r.key,
      { at: '2027-06-08T16:00:00.000Z', anchor: null, provisional: false },
    ]),
  )
  let n = 0
  return buildSubjectBeat({
    recipes: rs,
    subject: talkSubject({ _id: 'talk-1', title: 'Pods at scale', speakers }),
    tags: new Map(Object.entries(tags)),
    dates,
    campaign: { _id: 'camp', key: 'postEvent' },
    planId: 'plan',
    conference: { _id: 'conf-A', baseUrl: 'https://example.dev' },
    values: { event: 'CNB 2027' },
    assigneeId: 'owner',
    origin: 'expansion',
    taskId: (key) => `task:${key}`,
    newShortCode: () => `code${++n}`,
    newId: (type) => `${type}.${++n}`,
  })
}

const on = (beat: ReturnType<typeof build>, platform: string) =>
  beat.variants.find((v) => v.platform === platform)!

const tagged = (handle: string, did: string): BlueskyTag => ({
  status: 'tagged',
  handle,
  did,
})

describe('a talk beat names every speaker', () => {
  it('one, two and three speakers read naturally in the body and the alt text', () => {
    const cases: [Speaker[], string, string][] = [
      [[alice], 'Alice Liddell', 'Alice Liddell (SRE, Acme)'],
      [
        [alice, bob],
        'Alice Liddell and Bob Smith',
        'Alice Liddell (SRE, Acme) and Bob Smith (CTO, Initech)',
      ],
      [
        [alice, bob, carol],
        'Alice Liddell, Bob Smith and Carol Danvers',
        'Alice Liddell (SRE, Acme), Bob Smith (CTO, Initech) and Carol Danvers',
      ],
    ]
    for (const [speakers, names, withTitles] of cases) {
      const beat = build(speakers)
      expect(on(beat, 'bluesky').body).toContain(
        `🎬 "Pods at scale" — ${withTitles} at CNB 2027.`,
      )
      expect(on(beat, 'linkedin').body).toContain(
        `${withTitles} at CNB 2027: "Pods at scale". Recording online.`,
      )
      for (const task of beat.tasks.filter((t) => t.kind === 'publishing'))
        expect(task.alt).toBe(
          `Talk card: "Pods at scale" by ${names}. ${withTitles}.`,
        )
    }
  })

  it('tags where it can, plain names otherwise; mentions[] holds only the tagged, each the SPEAKER', () => {
    const beat = build([alice, bob, carol], {
      'spk-alice': tagged('alice.dev', DID_A),
      'spk-bob': null, // opted out, no link, or our own account
      'spk-carol': tagged('carol.example.com', DID_C),
    })
    const bluesky = on(beat, 'bluesky')
    expect(bluesky.body).toContain(
      '🎬 "Pods at scale" — @alice.dev (SRE, Acme), Bob Smith (CTO, Initech) and @carol.example.com at CNB 2027.',
    )
    expect(bluesky.mentions).toEqual([
      {
        _key: expect.any(String),
        handle: 'alice.dev',
        did: DID_A,
        speakerId: 'spk-alice',
        name: 'Alice Liddell',
        status: 'tagged',
      },
      {
        _key: expect.any(String),
        handle: 'carol.example.com',
        did: DID_C,
        speakerId: 'spk-carol',
        name: 'Carol Danvers',
        status: 'tagged',
      },
    ])
    // The LinkedIn sibling and every alt text read the plain map.
    expect(on(beat, 'linkedin').body).not.toContain('@')
    expect(on(beat, 'linkedin').mentions).toBeUndefined()
    for (const task of beat.tasks) expect(task.alt ?? '').not.toContain('@')
  })

  it('{company} on a talk stays the first speaker’s', () => {
    expect(
      talkSubject({ _id: 't', title: 'T', speakers: [alice, bob] }).values
        .company,
    ).toBe('SRE, Acme')
  })

  it('a dangling or nameless speaker ref is left out, never an empty name', () => {
    const subject = talkSubject({
      _id: 't',
      title: 'T',
      speakers: [null, { _id: 'spk-x', name: null, title: 'Ghost' }, bob],
    })
    expect(subject.values.name).toBe('Bob Smith')
    expect(subject.values.speakers).toBe('Bob Smith (CTO, Initech)')
    // `{company}` follows the speaker `{name}` starts with.
    expect(subject.values.company).toBe('CTO, Initech')
    expect(subject.people?.map((p) => p._id)).toEqual(['spk-bob'])
  })

  it('a speaker the talk lists twice is named and tagged once (a mention _key is unique)', () => {
    const beat = build([alice, bob, alice], {
      'spk-alice': tagged('alice.dev', DID_A),
    })
    const bluesky = on(beat, 'bluesky')
    expect(bluesky.body).toContain(
      '— @alice.dev (SRE, Acme) and Bob Smith (CTO, Initech) at CNB 2027.',
    )
    expect(bluesky.mentions?.map((m) => m.speakerId)).toEqual(['spk-alice'])
  })

  it('the talk stays the subject: keys and target page do not depend on its speakers', () => {
    const shape = (beat: ReturnType<typeof build>) =>
      beat.tasks.map((t) => ({
        key: t.key,
        subject: t.subject,
        targetPage: t.targetPage,
      }))
    const expected = [
      {
        key: 'videoDrip:talk-1:linkedin',
        subject: { _id: 'talk-1', type: 'talk' },
        targetPage: '/program',
      },
      {
        key: 'videoDrip:talk-1:bluesky',
        subject: { _id: 'talk-1', type: 'talk' },
        targetPage: '/program',
      },
    ]
    expect(shape(build([alice]))).toEqual(expected)
    expect(
      shape(
        build([alice, bob, carol], { 'spk-alice': tagged('a.dev', DID_A) }),
      ),
    ).toEqual(expected)
  })
})
