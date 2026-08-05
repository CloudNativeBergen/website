import { describe, it, expect } from 'vitest'
import {
  findDuplicateSpeakerCandidates,
  normalizeName,
  normalizeSlug,
  speakerEmailSet,
  SIGNAL_CONFIDENCE,
  type DuplicateSpeakerInput,
} from './duplicates'

describe('normalizeName', () => {
  it('trims, lowercases and collapses inner whitespace', () => {
    expect(normalizeName('  Jane   Doe ')).toBe('jane doe')
    expect(normalizeName('JANE DOE')).toBe('jane doe')
  })

  it('returns empty string for missing/blank names', () => {
    expect(normalizeName(undefined)).toBe('')
    expect(normalizeName(null)).toBe('')
    expect(normalizeName('   ')).toBe('')
  })
})

describe('normalizeSlug', () => {
  it('trims and lowercases', () => {
    expect(normalizeSlug(' Jane-Doe ')).toBe('jane-doe')
  })

  it('returns empty string for missing/blank slugs', () => {
    expect(normalizeSlug(null)).toBe('')
    expect(normalizeSlug('  ')).toBe('')
  })
})

describe('speakerEmailSet', () => {
  it('unions display email with knownEmails, normalized and deduped', () => {
    expect(
      speakerEmailSet({
        _id: 'a',
        email: 'Jane@Example.com',
        knownEmails: ['jane@example.com', ' J.Doe@Example.com ', null],
      }),
    ).toEqual(['jane@example.com', 'j.doe@example.com'])
  })
})

describe('findDuplicateSpeakerCandidates — slug collisions', () => {
  /**
   * THE INCIDENT, as a fixture (#267). Two documents for Ganesh Vasudevan, one
   * slug, different providers, different emails, and the CONFIRMED talk on the
   * older LinkedIn document — while he signs in with GitHub.
   */
  const incident: DuplicateSpeakerInput[] = [
    {
      _id: '1e80d498-4878-4341-9352-00142ce180ec',
      name: 'Ganesh Vasudevan',
      slug: 'ganesh-vasudevan',
      email: 'ganesh.vasudev@gmail.com',
      providers: ['linkedin:2mtSWuh1kA'],
      _createdAt: '2026-05-05T00:00:00Z',
      talkCount: 1,
      confirmedTalkCount: 1,
    },
    {
      _id: '241e8419-208a-48c2-8e1b-7080597752d8',
      name: 'Ganesh Vasudevan',
      slug: 'ganesh-vasudevan',
      email: 'ganesh.vasudevan@ericsson.com',
      providers: ['github:23187057'],
      _createdAt: '2026-06-15T00:00:00Z',
      talkCount: 0,
      confirmedTalkCount: 0,
    },
  ]

  it('reports an exact slug collision as a CERTAIN group', () => {
    const groups = findDuplicateSpeakerCandidates(incident)

    expect(groups).toHaveLength(1)
    expect(groups[0].signal).toBe('slug')
    expect(groups[0].confidence).toBe('certain')
    expect(groups[0].value).toBe('ganesh-vasudevan')
    expect(groups[0].members.map((member) => member._id).sort()).toEqual(
      [
        '1e80d498-4878-4341-9352-00142ce180ec',
        '241e8419-208a-48c2-8e1b-7080597752d8',
      ].sort(),
    )
  })

  it('suggests the document holding the CONFIRMED talk as the survivor', () => {
    // Merging the other way round would repoint a confirmed conference talk and
    // then delete the document the schedule was built around.
    const [group] = findDuplicateSpeakerCandidates(incident)

    expect(group.suggestedSurvivorId).toBe(
      '1e80d498-4878-4341-9352-00142ce180ec',
    )
    expect(group.survivorReason).toBe('confirmed-talks')
    // Suggested survivor leads the member list.
    expect(group.members[0]._id).toBe('1e80d498-4878-4341-9352-00142ce180ec')
  })

  it('does NOT prefer the newest or the oldest document over confirmed talks', () => {
    const newestHasTheTalk = incident.map((member) =>
      member._id === '241e8419-208a-48c2-8e1b-7080597752d8'
        ? { ...member, talkCount: 2, confirmedTalkCount: 1 }
        : { ...member, talkCount: 0, confirmedTalkCount: 0 },
    )
    const [group] = findDuplicateSpeakerCandidates(newestHasTheTalk)

    // Same fixture, confirmed talk moved to the NEWER document: the suggestion
    // follows the talk, not the creation date.
    expect(group.suggestedSurvivorId).toBe(
      '241e8419-208a-48c2-8e1b-7080597752d8',
    )
  })

  it('falls back to the oldest document when nothing has talks', () => {
    const noTalks = incident.map((member) => ({
      ...member,
      talkCount: 0,
      confirmedTalkCount: 0,
    }))
    const [group] = findDuplicateSpeakerCandidates(noTalks)

    expect(group.suggestedSurvivorId).toBe(
      '1e80d498-4878-4341-9352-00142ce180ec',
    )
    expect(group.survivorReason).toBe('oldest')
  })

  it('groups a three-way slug collision as one group', () => {
    const trio: DuplicateSpeakerInput[] = ['a', 'b', 'c'].map((id) => ({
      _id: id,
      name: `Valentin David ${id}`,
      slug: 'valentin-david',
      email: `${id}@example.com`,
      _createdAt: `2026-0${id === 'a' ? 1 : id === 'b' ? 2 : 3}-01T00:00:00Z`,
    }))

    const groups = findDuplicateSpeakerCandidates(trio)
    expect(groups).toHaveLength(1)
    expect(groups[0].members).toHaveLength(3)
  })
})

describe('findDuplicateSpeakerCandidates — distinct speakers', () => {
  it('reports NOTHING for two genuinely distinct speakers', () => {
    const distinct: DuplicateSpeakerInput[] = [
      {
        _id: 'a',
        name: 'Jane Doe',
        slug: 'jane-doe',
        email: 'jane@example.com',
        knownEmails: ['jane@example.com'],
        providers: ['github:1'],
        _createdAt: '2026-01-01T00:00:00Z',
        talkCount: 1,
        confirmedTalkCount: 1,
      },
      {
        _id: 'b',
        name: 'John Roe',
        slug: 'john-roe',
        email: 'john@example.com',
        knownEmails: ['john@example.com'],
        providers: ['linkedin:2'],
        _createdAt: '2026-02-01T00:00:00Z',
        talkCount: 3,
        confirmedTalkCount: 2,
      },
    ]

    expect(findDuplicateSpeakerCandidates(distinct)).toEqual([])
  })

  it('never groups on empty slugs, emails, providers or names', () => {
    // Absent values are not a shared value. Grouping them would put every
    // half-filled document in one enormous "duplicate" pile.
    const blanks: DuplicateSpeakerInput[] = [
      { _id: 'a', name: '', slug: '', email: '', knownEmails: [] },
      { _id: 'b', name: '   ', slug: null, email: null, providers: [null] },
      { _id: 'c', knownEmails: [null, undefined], providers: [' '] },
    ]

    expect(findDuplicateSpeakerCandidates(blanks)).toEqual([])
  })
})

describe('findDuplicateSpeakerCandidates — ranking', () => {
  it('ranks slug collisions above login, email and name matches', () => {
    expect(SIGNAL_CONFIDENCE.slug).toBe('certain')
    expect(SIGNAL_CONFIDENCE.provider).toBe('likely')
    expect(SIGNAL_CONFIDENCE.email).toBe('likely')
    expect(SIGNAL_CONFIDENCE.name).toBe('possible')

    const mixed: DuplicateSpeakerInput[] = [
      { _id: 'slug1', name: 'One', slug: 'shared-slug' },
      { _id: 'slug2', name: 'Two', slug: 'shared-slug' },
      { _id: 'mail1', name: 'Three', slug: 's3', email: 'shared@example.com' },
      {
        _id: 'mail2',
        name: 'Four',
        slug: 's4',
        knownEmails: ['SHARED@example.com'],
      },
      { _id: 'name1', name: 'Anna Hansen', slug: 's5' },
      { _id: 'name2', name: 'anna hansen', slug: 's6' },
    ]

    const groups = findDuplicateSpeakerCandidates(mixed)
    expect(groups.map((group) => group.confidence)).toEqual([
      'certain',
      'likely',
      'possible',
    ])
    expect(groups.map((group) => group.signal)).toEqual([
      'slug',
      'email',
      'name',
    ])
  })

  it('reports a same-name pair as POSSIBLE, not certain', () => {
    // Two real people can share a name. This must never be presented with the
    // weight of a slug collision.
    const namesakes: DuplicateSpeakerInput[] = [
      {
        _id: 'a',
        name: 'Anna Hansen',
        slug: 'anna-hansen',
        email: 'anna@one.example',
      },
      {
        _id: 'b',
        name: 'Anna Hansen',
        slug: 'anna-hansen-2',
        email: 'anna@two.example',
      },
    ]

    const groups = findDuplicateSpeakerCandidates(namesakes)
    expect(groups).toHaveLength(1)
    expect(groups[0].confidence).toBe('possible')
    expect(groups[0].signal).toBe('name')
  })

  it('folds a weaker signal over the SAME documents in as corroboration', () => {
    const both: DuplicateSpeakerInput[] = [
      {
        _id: 'a',
        name: 'Marcus Noble',
        slug: 'marcus-noble',
        email: 'm@one.example',
      },
      {
        _id: 'b',
        name: 'Marcus Noble',
        slug: 'marcus-noble',
        email: 'm@two.example',
      },
    ]

    const groups = findDuplicateSpeakerCandidates(both)
    expect(groups).toHaveLength(1)
    expect(groups[0].signal).toBe('slug')
    expect(groups[0].corroboratingSignals).toEqual(['name'])
  })

  it('does NOT launder a wider weak group into a stronger one', () => {
    // a+b share a slug (certain). c only shares the NAME with them. The third
    // document must not inherit the slug group's certainty — that is how an
    // organizer ends up deleting a real second person.
    const chained: DuplicateSpeakerInput[] = [
      { _id: 'a', name: 'Same Name', slug: 'same-name' },
      { _id: 'b', name: 'Same Name', slug: 'same-name' },
      { _id: 'c', name: 'same name', slug: 'same-name-2' },
    ]

    const groups = findDuplicateSpeakerCandidates(chained)
    expect(groups).toHaveLength(2)

    const [certain, possible] = groups
    expect(certain.confidence).toBe('certain')
    expect(certain.members.map((member) => member._id).sort()).toEqual([
      'a',
      'b',
    ])
    expect(possible.confidence).toBe('possible')
    expect(possible.members).toHaveLength(3)
  })

  it('reports a shared provider account as its own LIKELY group', () => {
    const shared: DuplicateSpeakerInput[] = [
      {
        _id: 'a',
        name: 'One Person',
        slug: 'one-person',
        providers: ['github:99'],
      },
      {
        _id: 'b',
        name: 'Different Name',
        slug: 'different-name',
        providers: ['github:99'],
      },
    ]

    const groups = findDuplicateSpeakerCandidates(shared)
    expect(groups).toHaveLength(1)
    expect(groups[0].signal).toBe('provider')
    expect(groups[0].confidence).toBe('likely')
    expect(groups[0].value).toBe('github:99')
  })

  it('is deterministic', () => {
    const speakers: DuplicateSpeakerInput[] = [
      { _id: 'b', name: 'Two', slug: 'dup' },
      { _id: 'a', name: 'One', slug: 'dup' },
      { _id: 'c', name: 'Three', slug: 'other-dup' },
      { _id: 'd', name: 'Four', slug: 'other-dup' },
    ]

    const first = findDuplicateSpeakerCandidates(speakers)
    const second = findDuplicateSpeakerCandidates([...speakers].reverse())
    expect(first.map((group) => group.id)).toEqual(
      second.map((group) => group.id),
    )
  })
})
