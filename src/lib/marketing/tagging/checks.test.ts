/**
 * @vitest-environment node
 *
 * The save and approval checks on a Bluesky body's tags (#1151,
 * `docs/MARKETING_TAGGING_SPEC.md` §4.3, §4.4 Save and Approval), and the
 * text edits the tag button and the one-click fix make. All pure.
 */

import { describe, expect, it } from 'vitest'
import { RichText } from '@atproto/api'
import {
  approvalCheck,
  approvalHandlesToResolve,
  handlesToResolve,
  mentionTokens,
  plainBody,
  saveMentions,
  tagName,
  untagHandle,
  tagOwners,
  untagOwned,
  type TaggablePerson,
} from './checks'
import type { MentionRecord } from './body'
import type { HandleResolution } from './resolve'

const alice: TaggablePerson = {
  speakerId: 'speaker-alice',
  name: 'Alice Anderson',
  handle: 'alice.dev',
  optedOut: false,
}
const bob: TaggablePerson = {
  speakerId: 'speaker-bob',
  name: 'Bob',
  handle: 'bob.bsky.social',
  optedOut: false,
}
const olga: TaggablePerson = {
  speakerId: 'speaker-olga',
  name: 'Olga',
  handle: 'olga.dev',
  optedOut: true,
}
const people = [alice, bob, olga]

const resolved = (did: string): HandleResolution => ({ kind: 'resolved', did })
const DID_A = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const DID_B = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'

function tagged(p: TaggablePerson, did?: string): MentionRecord {
  return {
    _key: p.speakerId,
    handle: p.handle!,
    ...(did ? { did } : {}),
    speakerId: p.speakerId,
    name: p.name,
    status: 'tagged',
  }
}

describe('mentionTokens', () => {
  it('finds the handles the adapter would turn into facets, normalised', () => {
    expect(
      mentionTokens('Hi @Alice.Dev, (@bob.bsky.social) and me@x.com.').map(
        (t) => t.handle,
      ),
    ).toEqual(['alice.dev', 'bob.bsky.social'])
  })

  it('is a superset of @atproto/api detection on the same text', () => {
    const text =
      '🎉 @alice.dev and @bob.bsky.social. Ends with @carol.example.com! x@y.dev (@dan.test)'
    const rt = new RichText({ text })
    rt.detectFacetsWithoutResolution()
    const detected = (rt.facets ?? []).flatMap((f) =>
      f.features.flatMap((x) =>
        'did' in x && typeof x.did === 'string' ? [x.did.toLowerCase()] : [],
      ),
    )
    const ours = mentionTokens(text).map((t) => t.handle)
    expect(detected.length).toBeGreaterThan(0)
    for (const h of detected) expect(ours).toContain(h)
  })

  it('reports the span of the @ and the handle', () => {
    const [t] = mentionTokens('Meet @alice.dev.')
    expect('Meet @alice.dev.'.slice(t.start, t.end)).toBe('@alice.dev')
  })
})

describe('tag button text edits', () => {
  it('tagName swaps the first occurrence of the name for the handle', () => {
    expect(tagName('Alice Anderson talks. Alice Anderson again.', alice)).toBe(
      '@alice.dev talks. Alice Anderson again.',
    )
  })

  it('tagName swaps the name only where it stands as a whole word', () => {
    const ann = { name: 'Ann', handle: 'ann.dev' }
    expect(tagName('Annika, https://x.dev/Ann, “Ann” and Ann.', ann)).toBe(
      'Annika, https://x.dev/Ann, “Ann” and @ann.dev.',
    )
    expect(tagName('Annika only', ann)).toBeNull()
  })

  it('tagName never glues the handle to a following word', () => {
    expect(tagName('An Alice Anderson-led workshop.', alice)).toBeNull()
    expect(
      tagName('An Alice Anderson-led workshop, with Alice Anderson.', alice),
    ).toBe('An Alice Anderson-led workshop, with @alice.dev.')
  })

  it('tagName returns null when the name is not in the body', () => {
    expect(tagName('Someone talks.', alice)).toBeNull()
  })

  it('untagHandle swaps every tag of the handle back for the name, any case', () => {
    expect(
      untagHandle('@alice.dev and @Alice.dev.', 'alice.dev', 'Alice Anderson'),
    ).toBe('Alice Anderson and Alice Anderson.')
  })

  it('untagHandle leaves a longer handle that starts the same alone', () => {
    expect(
      untagHandle('@alice.dev.example.com', 'alice.dev', 'Alice Anderson'),
    ).toBe('@alice.dev.example.com')
  })

  it('round-trips name → handle → name', () => {
    const body = 'Catch Alice Anderson at 10.'
    expect(untagHandle(tagName(body, alice)!, 'alice.dev', alice.name)).toBe(
      body,
    )
  })
})

describe('plainBody', () => {
  it('replaces every recorded tag with its name and leaves strangers', () => {
    expect(
      plainBody('@alice.dev with @kubernetes.io and @bob.bsky.social', [
        tagged(alice, DID_A),
        tagged(bob, DID_B),
      ]),
    ).toBe('Alice Anderson with @kubernetes.io and Bob')
  })
})

describe('a shared team handle, end to end: tag, save, read back', () => {
  // Two speakers list the same team account, in talk order Bob then Alice.
  const team = { ...bob, handle: 'team.dev' }
  const mate = { ...alice, handle: 'team.dev' }
  const people = [team, mate]
  const resolutions = new Map([['team.dev', resolved(DID_B)]])
  const save = (body: string, previous: MentionRecord[] = []) =>
    saveMentions({ body, people, previous, resolutions })
  const start = 'Bob and Alice Anderson on platform teams.'

  it('tagging the second speaker records HER, and she stays tagged after the save', () => {
    const body = tagName(start, mate)!
    expect(body).toBe('Bob and @team.dev on platform teams.')
    const saved = save(body)
    expect(saved.issues).toEqual([])
    expect(saved.mentions.map((m) => m.speakerId)).toEqual(['speaker-alice'])
    expect([...tagOwners(body, people, saved.mentions)]).toEqual([
      ['speaker-alice', { handle: 'team.dev', occurrence: null }],
    ])
    expect(plainBody(body, saved.mentions)).toBe(start)
  })

  it('tagging both records both, one per occurrence, and the plain form names each', () => {
    const one = tagName(start, mate)!
    const first = save(one)
    const both = tagName(one, team)!
    expect(both).toBe('@team.dev and @team.dev on platform teams.')
    const saved = save(both, first.mentions)
    expect(saved.issues).toEqual([])
    expect(saved.mentions.map((m) => m.speakerId)).toEqual([
      'speaker-bob',
      'speaker-alice',
    ])
    expect(plainBody(both, saved.mentions)).toBe(start)
    // "Use name" for Alice after the save hands back only her occurrence.
    const owners = tagOwners(both, people, saved.mentions)
    expect(untagOwned(both, owners.get('speaker-alice')!, mate.name)).toBe(
      '@team.dev and Alice Anderson on platform teams.',
    )
  })
})

describe('saveMentions (§4.3 rebuilt on every save, §4.4 Save)', () => {
  it('records a typed handle of a speaker, reusing a checked DID', () => {
    const previous = [tagged(alice, DID_A)]
    const body = 'See @alice.dev'
    expect(handlesToResolve({ body, people, previous })).toEqual([])
    const out = saveMentions({
      body,
      people,
      previous,
      resolutions: new Map(),
    })
    expect(out.issues).toEqual([])
    expect(out.mentions).toEqual([
      {
        _key: 'speaker-alice',
        handle: 'alice.dev',
        did: DID_A,
        speakerId: 'speaker-alice',
        name: 'Alice Anderson',
        status: 'tagged',
      },
    ])
  })

  it('a newly typed handle is resolved and recorded with its DID', () => {
    const body = 'See @Bob.bsky.social'
    expect(handlesToResolve({ body, people, previous: [] })).toEqual([
      'bob.bsky.social',
    ])
    const out = saveMentions({
      body,
      people,
      previous: [],
      resolutions: new Map([['bob.bsky.social', resolved(DID_B)]]),
    })
    expect(out.mentions.map((m) => [m.speakerId, m.did])).toEqual([
      ['speaker-bob', DID_B],
    ])
  })

  it('a stranger’s handle is not recorded and not refused', () => {
    const out = saveMentions({
      body: 'Thanks @kubernetes.io',
      people,
      previous: [],
      resolutions: new Map(),
    })
    expect(out).toEqual({ mentions: [], issues: [], warnings: [] })
  })

  it('refuses an opted-out speaker’s handle, and never asks Bluesky about it', () => {
    const body = 'With @olga.dev'
    expect(handlesToResolve({ body, people, previous: [] })).toEqual([])
    const out = saveMentions({
      body,
      people,
      previous: [],
      resolutions: new Map(),
    })
    expect(out.issues).toEqual([
      expect.objectContaining({
        code: 'opted-out',
        mentionKey: 'speaker-olga',
        handle: 'olga.dev',
        name: 'Olga',
      }),
    ])
  })

  it('refuses an opted-out speaker’s SECOND Bluesky account too', () => {
    const two = { ...olga, handles: ['olga.dev', 'olga.bsky.social'] }
    const body = 'With @olga.bsky.social'
    expect(handlesToResolve({ body, people: [two], previous: [] })).toEqual([])
    const out = saveMentions({
      body,
      people: [two],
      previous: [],
      resolutions: new Map(),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['opted-out', 'speaker-olga'],
    ])
  })

  it('records a speaker by their second account, as that handle', () => {
    const two = { ...bob, handles: ['bob.bsky.social', 'bob.dev'] }
    const out = saveMentions({
      body: 'Hi @bob.dev',
      people: [two],
      previous: [],
      resolutions: new Map([['bob.dev', resolved(DID_B)]]),
    })
    expect(out.mentions.map((m) => [m.speakerId, m.handle, m.did])).toEqual([
      ['speaker-bob', 'bob.dev', DID_B],
    ])
  })

  it('refuses when ANY speaker sharing the handle opted out', () => {
    const twin = { ...olga, speakerId: 'speaker-twin', optedOut: false }
    const out = saveMentions({
      body: '@olga.dev',
      people: [twin, olga],
      previous: [],
      resolutions: new Map(),
    })
    expect(out.issues.map((i) => i.code)).toEqual(['opted-out'])
  })

  it('refuses a handle Bluesky definitely does not know', () => {
    const out = saveMentions({
      body: '@bob.bsky.social',
      people,
      previous: [],
      resolutions: new Map([['bob.bsky.social', { kind: 'not-found' }]]),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['not-found', 'speaker-bob'],
    ])
  })

  it('an unreachable Bluesky records the tag without a DID and warns', () => {
    const out = saveMentions({
      body: '@bob.bsky.social',
      people,
      previous: [],
      resolutions: new Map([['bob.bsky.social', { kind: 'unreachable' }]]),
    })
    expect(out.issues).toEqual([])
    expect(out.mentions).toEqual([
      expect.objectContaining({ speakerId: 'speaker-bob', status: 'tagged' }),
    ])
    expect(out.mentions[0].did).toBeUndefined()
    expect(out.warnings.map((w) => w.code)).toEqual(['unverified'])
  })

  it('a deleted tag leaves the record; an unresolved note survives', () => {
    const unresolved: MentionRecord = {
      _key: 'speaker-bob',
      handle: 'bob.bsky.social',
      speakerId: 'speaker-bob',
      name: 'Bob',
      status: 'unresolved',
    }
    const out = saveMentions({
      body: 'Alice Anderson and Bob',
      people,
      previous: [tagged(alice, DID_A), unresolved],
      resolutions: new Map(),
    })
    expect(out.mentions).toEqual([unresolved])
    // Once the name is gone from the post, so is the note.
    expect(
      saveMentions({
        body: 'Alice Anderson only',
        people,
        previous: [unresolved],
        resolutions: new Map(),
      }).mentions,
    ).toEqual([])
  })

  it('a now-tagged person’s unresolved note is dropped (one entry per person)', () => {
    const out = saveMentions({
      body: '@bob.bsky.social',
      people,
      previous: [
        {
          _key: 'speaker-bob',
          handle: 'bob.bsky.social',
          speakerId: 'speaker-bob',
          name: 'Bob',
          status: 'unresolved',
        },
      ],
      resolutions: new Map([['bob.bsky.social', resolved(DID_B)]]),
    })
    expect(out.mentions.map((m) => m.status)).toEqual(['tagged'])
  })

  it('refuses a body that fits only in its tagged form', () => {
    const long = { ...alice, name: 'A'.repeat(200) }
    const filler = 'x'.repeat(280)
    const body = `${filler} @alice.dev`
    expect(body.length).toBeLessThanOrEqual(300)
    const out = saveMentions({
      body,
      people: [long],
      previous: [tagged(long, DID_A)],
      resolutions: new Map(),
    })
    expect(out.issues).toEqual([
      expect.objectContaining({ code: 'plain-too-long', mentionKey: null }),
    ])
    expect(out.issues[0].message).toContain('481')
  })

  it('refuses a plain form over the 3,000-byte cap, though under 300 characters', () => {
    const family = '👨‍👩‍👧‍👦' // one grapheme, 25 bytes
    const wide = { ...alice, name: family.repeat(120) }
    const out = saveMentions({
      body: '@alice.dev x',
      people: [wide],
      previous: [tagged(wide, DID_A)],
      resolutions: new Map(),
    })
    expect(out.issues).toEqual([
      expect.objectContaining({ code: 'plain-too-long', mentionKey: null }),
    ])
    expect(out.issues[0].message).toContain('3002 bytes')
  })

  it('a body that fits both ways saves', () => {
    const out = saveMentions({
      body: `${'x'.repeat(270)} @alice.dev`,
      people,
      previous: [tagged(alice, DID_A)],
      resolutions: new Map(),
    })
    expect(out.issues).toEqual([])
  })
})

describe('saveMentions keeps a departed speaker’s tag in view', () => {
  it('refuses, rather than drops, a recorded tag of someone no longer on the roster', () => {
    const body = '@alice.dev'
    const previous = [tagged(alice, DID_A)]
    const out = saveMentions({
      body,
      people: [bob],
      previous,
      resolutions: new Map(),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['not-a-speaker', 'speaker-alice'],
    ])
  })
})

describe('saveMentions and a speaker who changed their link', () => {
  const moved = { ...alice, handle: 'alice.example.com' }
  it('keeps the recorded tag of the old handle, DID and all', () => {
    const out = saveMentions({
      body: '@alice.dev',
      people: [moved],
      previous: [tagged(alice, DID_A)],
      resolutions: new Map(),
    })
    expect(out.issues).toEqual([])
    expect(out.mentions).toEqual([tagged(alice, DID_A)])
  })
  it('keeps the old handle’s record beside the new one, under its own key', () => {
    const out = saveMentions({
      body: '@alice.dev and @alice.example.com',
      people: [moved],
      previous: [tagged(alice, DID_A)],
      resolutions: new Map([['alice.example.com', resolved(DID_B)]]),
    })
    expect(out.mentions.map((m) => [m.handle, m.did])).toEqual([
      ['alice.dev', DID_A],
      ['alice.example.com', DID_B],
    ])
    expect(new Set(out.mentions.map((m) => m._key)).size).toBe(2)
  })

  it('a handle another speaker now lists stays bound to its recorded person', () => {
    const taker = { ...bob, handle: 'alice.dev' }
    const out = saveMentions({
      body: '@alice.dev',
      people: [{ ...moved, optedOut: true }, taker],
      previous: [tagged(alice, DID_A)],
      resolutions: new Map(),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['opted-out', 'speaker-alice'],
    ])
  })

  it('a retained handle saved without a DID is resolved on the next save', () => {
    const input = {
      body: '@alice.dev',
      people: [moved],
      previous: [tagged(alice)],
    }
    expect(handlesToResolve(input)).toEqual(['alice.dev'])
    expect(
      saveMentions({
        ...input,
        resolutions: new Map([['alice.dev', resolved(DID_A)]]),
      }).mentions.map((m) => m.did),
    ).toEqual([DID_A])
  })

  it('a shared account keeps every speaker it was recorded for', () => {
    const team = { ...bob, handle: 'team.dev' }
    const mate = { ...alice, handle: 'team.dev' }
    const previous = [tagged(team, DID_B), tagged(mate, DID_B)]
    const kept = saveMentions({
      body: '@team.dev and @team.dev',
      people: [team, mate],
      previous,
      resolutions: new Map(),
    })
    expect(kept.mentions.map((m) => m.speakerId)).toEqual([
      'speaker-bob',
      'speaker-alice',
    ])
    // The second one leaving the roster is refused, not silently dropped.
    const left = saveMentions({
      body: '@team.dev and @team.dev',
      people: [team],
      previous,
      resolutions: new Map(),
    })
    expect(left.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['not-a-speaker', 'speaker-alice'],
    ])
  })

  it('refuses it when that speaker has opted out since', () => {
    const out = saveMentions({
      body: '@alice.dev',
      people: [{ ...moved, optedOut: true }],
      previous: [tagged(alice, DID_A)],
      resolutions: new Map(),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['opted-out', 'speaker-alice'],
    ])
  })
})

describe('approvalCheck (§4.4 Approval)', () => {
  const peopleMap = people

  it('passes a recorded tag that still resolves to its DID', () => {
    const mentions = [tagged(alice, DID_A)]
    expect(
      approvalHandlesToResolve({
        body: '@alice.dev',
        mentions,
        people: peopleMap,
      }),
    ).toEqual(['alice.dev'])
    expect(
      approvalCheck({
        body: '@alice.dev',
        mentions,
        people: peopleMap,
        resolutions: new Map([['alice.dev', resolved(DID_A)]]),
      }),
    ).toEqual({ issues: [], warnings: [] })
  })

  it('refuses a changed DID', () => {
    const out = approvalCheck({
      body: '@alice.dev',
      mentions: [tagged(alice, DID_A)],
      people: peopleMap,
      resolutions: new Map([['alice.dev', resolved(DID_B)]]),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['did-changed', 'speaker-alice'],
    ])
  })

  it('refuses a speaker who opted out since, without asking Bluesky', () => {
    const late = { ...alice, optedOut: true }
    const mentions = [tagged(alice, DID_A)]
    expect(
      approvalHandlesToResolve({
        body: '@alice.dev',
        mentions,
        people: [late],
      }),
    ).toEqual([])
    const out = approvalCheck({
      body: '@alice.dev',
      mentions,
      people: [late],
      resolutions: new Map(),
    })
    expect(out.issues.map((i) => i.code)).toEqual(['opted-out'])
  })

  it('refuses a recorded tag of an opted-out speaker whose link has since changed', () => {
    // The body still carries the OLD handle; the roster only knows the new
    // one, so only the recorded mention can catch it.
    const moved = { ...alice, handle: 'alice.example.com', optedOut: true }
    const out = approvalCheck({
      body: '@alice.dev',
      mentions: [tagged(alice, DID_A)],
      people: [moved],
      resolutions: new Map([['alice.dev', resolved(DID_A)]]),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['opted-out', 'speaker-alice'],
    ])
  })

  it('refuses a mention of someone no longer a speaker here', () => {
    const out = approvalCheck({
      body: '@alice.dev',
      mentions: [tagged(alice, DID_A)],
      people: [bob],
      resolutions: new Map(),
    })
    expect(out.issues.map((i) => i.code)).toEqual(['not-a-speaker'])
  })

  it('refuses a handle that no longer exists', () => {
    const out = approvalCheck({
      body: '@alice.dev',
      mentions: [tagged(alice, DID_A)],
      people: peopleMap,
      resolutions: new Map([['alice.dev', { kind: 'not-found' }]]),
    })
    expect(out.issues.map((i) => i.code)).toEqual(['not-found'])
  })

  it('an unreachable Bluesky is a warning, not a refusal', () => {
    const out = approvalCheck({
      body: '@alice.dev',
      mentions: [tagged(alice, DID_A)],
      people: peopleMap,
      resolutions: new Map([['alice.dev', { kind: 'unreachable' }]]),
    })
    expect(out.issues).toEqual([])
    expect(out.warnings.map((w) => [w.code, w.mentionKey])).toEqual([
      ['unverified', 'speaker-alice'],
    ])
  })

  it('also refuses an opted-out handle in the body that no save recorded', () => {
    const out = approvalCheck({
      body: 'with @olga.dev',
      mentions: [],
      people: peopleMap,
      resolutions: new Map(),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['opted-out', 'speaker-olga'],
    ])
  })

  it('refuses a tag saved without a DID once Bluesky can be asked again', () => {
    const out = approvalCheck({
      body: '@alice.dev',
      mentions: [tagged(alice)],
      people: peopleMap,
      resolutions: new Map([['alice.dev', resolved(DID_A)]]),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['unchecked', 'speaker-alice'],
    ])
  })

  it('refuses a speaker handle in the body that no save recorded', () => {
    const out = approvalCheck({
      body: 'with @bob.bsky.social',
      mentions: [],
      people: peopleMap,
      resolutions: new Map(),
    })
    expect(out.issues.map((i) => [i.code, i.mentionKey])).toEqual([
      ['unchecked', 'speaker-bob'],
    ])
  })

  it('refuses a body that fits only in its tagged form, as save does', () => {
    const long = { ...alice, name: 'A'.repeat(200) }
    const out = approvalCheck({
      body: `${'x'.repeat(280)} @alice.dev`,
      mentions: [tagged(long, DID_A)],
      people: [long],
      resolutions: new Map([['alice.dev', resolved(DID_A)]]),
    })
    expect(out.issues).toEqual([
      expect.objectContaining({ code: 'plain-too-long', mentionKey: null }),
    ])
    expect(out.issues[0].message).toContain('481')
  })

  it('a record whose @handle left the body is neither asked about nor refused', () => {
    const mentions = [tagged(alice, DID_A)]
    const input = { body: 'Alice Anderson at 10', mentions, people: peopleMap }
    expect(approvalHandlesToResolve(input)).toEqual([])
    expect(
      approvalCheck({
        ...input,
        resolutions: new Map([['alice.dev', resolved(DID_B)]]),
      }),
    ).toEqual({ issues: [], warnings: [] })
  })

  it('ignores unresolved notes', () => {
    const out = approvalCheck({
      body: 'Bob',
      mentions: [{ ...tagged(bob), status: 'unresolved' }],
      people: [],
      resolutions: new Map(),
    })
    expect(out).toEqual({ issues: [], warnings: [] })
  })
})
