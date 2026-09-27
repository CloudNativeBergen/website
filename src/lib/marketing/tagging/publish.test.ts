/**
 * @vitest-environment node
 *
 * The publish-time check (tagging spec §4.4, Publish): a recorded tag of a
 * speaker who opted out after approval goes out as their plain name.
 */
import { describe, expect, it } from 'vitest'
import { withholdOptedOutTags } from './publish'

const alice = {
  handle: 'alice.dev',
  did: 'did:plc:alice',
  name: 'Alice Smith',
  speakerId: 'speaker-alice',
  optedOut: false,
}
const bob = {
  handle: 'bob.dev',
  did: 'did:plc:bob',
  name: 'Bob Jones',
  speakerId: 'speaker-bob',
  optedOut: false,
}

describe('withholdOptedOutTags', () => {
  it('swaps an opted-out speaker’s tag for their plain name and drops their mention', () => {
    const out = withholdOptedOutTags({
      body: '🎙️ @alice.dev and @bob.dev at the conf',
      recorded: [{ ...alice, optedOut: true }, bob],
    })
    expect(out.body).toBe('🎙️ Alice Smith and @bob.dev at the conf')
    expect(out.mentions).toEqual([{ handle: 'bob.dev', did: 'did:plc:bob' }])
    expect(out.withheld).toEqual([
      {
        speakerId: 'speaker-alice',
        name: 'Alice Smith',
        handle: 'alice.dev',
        reason: 'opted-out',
      },
    ])
  })

  it('changes nothing when nobody opted out', () => {
    const body = '@alice.dev and @bob.dev'
    const out = withholdOptedOutTags({ body, recorded: [alice, bob] })
    expect(out).toEqual({
      body,
      mentions: [
        { handle: 'alice.dev', did: 'did:plc:alice' },
        { handle: 'bob.dev', did: 'did:plc:bob' },
      ],
      withheld: [],
    })
  })

  it('swaps every occurrence of the handle, in any case', () => {
    const out = withholdOptedOutTags({
      body: '@Alice.dev spoke. Thanks @alice.dev!',
      recorded: [{ ...alice, optedOut: true }],
    })
    expect(out.body).toBe('Alice Smith spoke. Thanks Alice Smith!')
    expect(out.mentions).toEqual([])
  })

  it('a shared handle: only the opted-out person’s occurrence is swapped', () => {
    // Records are in occurrence order: the k-th occurrence is the k-th record.
    const team = { handle: 'team.dev', did: 'did:plc:team' }
    const out = withholdOptedOutTags({
      body: '@team.dev and @team.dev',
      recorded: [
        { ...alice, ...team, optedOut: false },
        { ...bob, ...team, optedOut: true },
      ],
    })
    expect(out.body).toBe('@team.dev and Bob Jones')
    expect(out.mentions).toEqual([team])
  })

  it('a recorded tag without a DID is still swapped, and posts no DID', () => {
    const { did: _did, ...noDid } = alice
    void _did
    const out = withholdOptedOutTags({
      body: 'Hi @alice.dev',
      recorded: [{ ...noDid, optedOut: true }],
    })
    expect(out.body).toBe('Hi Alice Smith')
    expect(out.mentions).toEqual([])
  })

  it('a handle nobody recorded is left for the adapter to detect as today', () => {
    const out = withholdOptedOutTags({
      body: '@kubernetes.io and @alice.dev',
      recorded: [{ ...alice, optedOut: true }],
    })
    expect(out.body).toBe('@kubernetes.io and Alice Smith')
  })

  it('a withheld name holding a shared handle that stays tagged is inserted as text (round 3, T1)', () => {
    // Bob keeps @team.dev; the adapter puts that DID on EVERY "@team.dev" it
    // detects, so Alice's inserted name must not carry one.
    const team = { handle: 'team.dev', did: 'did:plc:team' }
    const out = withholdOptedOutTags({
      body: '@team.dev and @team.dev',
      recorded: [
        { ...alice, ...team, name: 'Alice (@team.dev)', optedOut: true },
        { ...bob, ...team },
      ],
    })
    expect(out.body).toBe('Alice (team.dev) and @team.dev')
    expect(out.mentions).toEqual([team])
  })

  it('a shared handle recorded with two DIDs posts the DID of the occurrence that stays — never the opted-out one (review round 2, T1)', () => {
    const out = withholdOptedOutTags({
      body: '@team.dev and @team.dev',
      recorded: [
        { ...alice, handle: 'team.dev', did: 'did:plc:old', optedOut: true },
        { ...bob, handle: 'team.dev', did: 'did:plc:new' },
      ],
    })
    expect(out.body).toBe('Alice Smith and @team.dev')
    expect(out.mentions).toEqual([{ handle: 'team.dev', did: 'did:plc:new' }])
  })

  it('surviving occurrences of a shared handle disagreeing on the DID post none of them', () => {
    const out = withholdOptedOutTags({
      body: '@team.dev and @team.dev',
      recorded: [
        { ...alice, handle: 'team.dev', did: 'did:plc:a' },
        { ...bob, handle: 'team.dev', did: 'did:plc:b' },
      ],
    })
    expect(out.mentions).toEqual([])
  })

  it('binds a shared handle the way the approval check does: an occurrence Studio replaced with one owner’s name leaves the OTHER owner (round 2, T4)', () => {
    // Records [Bob, Alice]; Studio swapped the first occurrence for "Bob".
    // The approval check binds the remaining "@team.dev" to Alice, so her
    // later opt-out must reach it.
    const team = { handle: 'team.dev', did: 'did:plc:team' }
    const out = withholdOptedOutTags({
      body: 'Bob Jones and @team.dev',
      recorded: [
        { ...bob, ...team },
        { ...alice, ...team, optedOut: true },
      ],
    })
    expect(out.body).toBe('Bob Jones and Alice Smith')
    expect(out.mentions).toEqual([])
  })

  it('a name that itself contains the handle does not bring the tag back (review T2)', () => {
    // Only the ORIGINAL occurrences left unswapped may carry a DID: the
    // inserted name's "@alice.dev" is text, and the adapter posts
    // unrecorded handles as text.
    const out = withholdOptedOutTags({
      body: 'Hi @alice.dev and @bob.dev',
      recorded: [{ ...alice, name: 'Alice (@alice.dev)', optedOut: true }, bob],
    })
    expect(out.body).toBe('Hi Alice (alice.dev) and @bob.dev')
    expect(out.mentions).toEqual([{ handle: 'bob.dev', did: 'did:plc:bob' }])
  })

  it('a speaker who is gone (deleted or erased): neither the tag NOR the stored name — a neutral word', () => {
    // Erasure never touches the variant, so `name` on the record is the
    // erased person's real name: it must not be posted (GDPR).
    const out = withholdOptedOutTags({
      body: '🎙️ @alice.dev and @bob.dev at the conf',
      recorded: [{ ...alice, gone: true }, bob],
    })
    expect(out.body).toBe('🎙️ a speaker and @bob.dev at the conf')
    expect(out.body).not.toContain('Alice')
    expect(out.mentions).toEqual([{ handle: 'bob.dev', did: 'did:plc:bob' }])
    // Nothing of the person travels on to the notification either.
    expect(out.withheld).toEqual([
      { speakerId: 'speaker-alice', reason: 'gone' },
    ])
  })

  it('a record with no speaker (a sponsor, #1154) is posted with its recorded DID', () => {
    const out = withholdOptedOutTags({
      body: 'Thanks @acme.com',
      recorded: [
        {
          handle: 'acme.com',
          did: 'did:plc:acme',
          name: 'Acme',
          optedOut: false,
        },
      ],
    })
    expect(out).toEqual({
      body: 'Thanks @acme.com',
      mentions: [{ handle: 'acme.com', did: 'did:plc:acme' }],
      withheld: [],
    })
  })
})
