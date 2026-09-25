/**
 * @vitest-environment node
 *
 * One value map feeds both Channels of a beat and the alt text (spec §4.1):
 * the tag is applied only to the BODY of a Bluesky `tagSubject` recipe.
 */

import { describe, expect, it } from 'vitest'
import { beatRecipes, buildSubjectBeat, type BeatDates } from '../expansion'
import type { BlueskyTag } from './body'
import { BUILTIN_TEMPLATE } from '../template'
import { variantDocument } from '../sanity'

const DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const speakers = BUILTIN_TEMPLATE.campaigns.find((c) => c.key === 'speakers')!
const builtin = beatRecipes(speakers, 'speakerCard')

// On EVERY recipe of the beat, LinkedIn too: a flag a Studio edit put on the
// wrong sibling must still never put a handle into LinkedIn copy.
const recipes = (tagSubject: boolean) =>
  builtin.map((r) => (tagSubject ? { ...r, tagSubject: true } : r))

function build(opts: {
  tagSubject: boolean
  tag: BlueskyTag | null
  body?: string
}) {
  const rs = recipes(opts.tagSubject)
  const dates: BeatDates = new Map(
    rs.map((r) => [
      r.key,
      { at: '2027-04-08T16:00:00.000Z', anchor: null, provisional: false },
    ]),
  )
  let n = 0
  return buildSubjectBeat({
    recipes: rs,
    subject: {
      _id: 'spk-alice',
      type: 'speaker',
      values: { name: 'Alice Liddell', company: 'SRE', title: 'Pods' },
      people: [{ _id: 'spk-alice', name: 'Alice Liddell' }],
    },
    tags: new Map([['spk-alice', opts.tag]]),
    dates,
    campaign: { _id: 'camp', key: 'speakers' },
    planId: 'plan',
    conference: { _id: 'conf-A', baseUrl: 'https://example.dev' },
    values: { event: 'CNB 2027' },
    assigneeId: 'owner',
    origin: 'trigger',
    taskId: (key) => `task:${key}`,
    newShortCode: () => `code${++n}`,
    newId: (type) => `${type}.${++n}`,
  })
}

const tagged: BlueskyTag = { status: 'tagged', handle: 'alice.dev', did: DID }

describe('a Bluesky tagSubject beat', () => {
  it('tags the Bluesky body, and the LinkedIn sibling and the alt text keep the plain name', () => {
    const beat = build({ tagSubject: true, tag: tagged })
    const bluesky = beat.variants.find((v) => v.platform === 'bluesky')!
    const linkedin = beat.variants.find((v) => v.platform === 'linkedin')!
    expect(bluesky.body).toContain(
      '🎙️ @alice.dev (SRE) is speaking at CNB 2027.',
    )
    expect(bluesky.body).not.toContain('Alice Liddell')
    // The post carries the same text as its only variant.
    expect(beat.posts.find((p) => p._id === bluesky.postId)!.body).toBe(
      bluesky.body,
    )
    expect(bluesky.mentions).toEqual([
      {
        _key: expect.any(String),
        handle: 'alice.dev',
        did: DID,
        speakerId: 'spk-alice',
        name: 'Alice Liddell',
        status: 'tagged',
      },
    ])
    expect(linkedin.body).toContain('Alice Liddell is bringing')
    expect(linkedin.body).not.toContain('@alice.dev')
    expect(linkedin.mentions).toBeUndefined()
    for (const task of beat.tasks) {
      if (task.alt) {
        expect(task.alt).toContain('Speaker card: Alice Liddell, SRE.')
        expect(task.alt).not.toContain('@')
      }
    }
  })

  it('without tagSubject the Bluesky body keeps the plain name and records nothing', () => {
    const bluesky = build({ tagSubject: false, tag: tagged }).variants.find(
      (v) => v.platform === 'bluesky',
    )!
    expect(bluesky.body).toContain('🎙️ Alice Liddell (SRE)')
    expect(bluesky.mentions).toBeUndefined()
  })

  it('an opted-out speaker (no tag offered) reads as the plain name, with no entry', () => {
    const bluesky = build({ tagSubject: true, tag: null }).variants.find(
      (v) => v.platform === 'bluesky',
    )!
    expect(bluesky.body).toContain('🎙️ Alice Liddell (SRE)')
    expect(bluesky.mentions).toBeUndefined()
  })

  it('an unresolved handle reads as the plain name, with an unresolved entry', () => {
    const bluesky = build({
      tagSubject: true,
      tag: { status: 'unresolved', handle: 'alice.dev' },
    }).variants.find((v) => v.platform === 'bluesky')!
    expect(bluesky.body).toContain('🎙️ Alice Liddell (SRE)')
    expect(bluesky.mentions).toEqual([
      expect.objectContaining({ status: 'unresolved', handle: 'alice.dev' }),
    ])
    expect(bluesky.mentions![0]).not.toHaveProperty('did')
  })
})

describe('the recorded mentions reach Sanity', () => {
  const conference = { _type: 'reference' as const, _ref: 'conf-A' }
  const now = '2027-01-01T00:00:00.000Z'
  const variantOf = (tag: BlueskyTag | null, tagSubject = true) =>
    build({ tagSubject, tag }).variants.find((v) => v.platform === 'bluesky')!

  it('variantDocument writes each with its _key, and the speaker as a WEAK reference', () => {
    expect(
      variantDocument(variantOf(tagged), conference, now).mentions,
    ).toEqual([
      {
        _key: expect.stringMatching(/^[a-zA-Z0-9_-]+$/),
        _type: 'socialPostMention',
        handle: 'alice.dev',
        did: DID,
        // Weak: a strong ref would make the speaker undeletable (GDPR erasure).
        speaker: { _type: 'reference', _ref: 'spk-alice', _weak: true },
        name: 'Alice Liddell',
        status: 'tagged',
      },
    ])
  })

  it('omits the field when there is nothing recorded', () => {
    expect(
      variantDocument(variantOf(null), conference, now),
    ).not.toHaveProperty('mentions')
  })
})
