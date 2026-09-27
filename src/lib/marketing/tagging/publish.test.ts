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
      { speakerId: 'speaker-alice', name: 'Alice Smith', handle: 'alice.dev' },
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
})
