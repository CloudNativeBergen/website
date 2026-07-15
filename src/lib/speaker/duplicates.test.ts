import { describe, it, expect } from 'vitest'
import {
  clusterDuplicateSpeakers,
  normalizeName,
  speakerEmailSet,
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

describe('clusterDuplicateSpeakers', () => {
  it('returns no clusters when nothing overlaps', () => {
    const speakers: DuplicateSpeakerInput[] = [
      { _id: 'a', name: 'Jane Doe', email: 'jane@example.com' },
      { _id: 'b', name: 'John Roe', email: 'john@example.com' },
    ]
    expect(clusterDuplicateSpeakers(speakers)).toEqual([])
  })

  it('clusters speakers sharing a normalized email', () => {
    const speakers: DuplicateSpeakerInput[] = [
      {
        _id: 'a',
        name: 'Jane Doe',
        email: 'jane@example.com',
        _createdAt: '2020-01-01T00:00:00Z',
      },
      {
        _id: 'b',
        name: 'Jane D.',
        knownEmails: ['JANE@example.com'],
        _createdAt: '2021-01-01T00:00:00Z',
      },
    ]
    const clusters = clusterDuplicateSpeakers(speakers)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].reasons).toEqual(['email'])
    expect(clusters[0].sharedEmails).toEqual(['jane@example.com'])
    // Oldest _createdAt first.
    expect(clusters[0].members.map((m) => m._id)).toEqual(['a', 'b'])
  })

  it('clusters speakers sharing an identical normalized name', () => {
    const speakers: DuplicateSpeakerInput[] = [
      { _id: 'a', name: 'Jane Doe', email: 'jane1@example.com' },
      { _id: 'b', name: 'jane   doe', email: 'jane2@example.com' },
    ]
    const clusters = clusterDuplicateSpeakers(speakers)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].reasons).toEqual(['name'])
    expect(clusters[0].sharedNames).toEqual(['jane doe'])
  })

  it('links transitively across email and name (union-find)', () => {
    const speakers: DuplicateSpeakerInput[] = [
      { _id: 'a', name: 'Jane Doe', email: 'shared@example.com' },
      { _id: 'b', name: 'Jane Doe', email: 'other@example.com' }, // name links a-b
      { _id: 'c', name: 'Totally Different', email: 'shared@example.com' }, // email links a-c
    ]
    const clusters = clusterDuplicateSpeakers(speakers)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].members.map((m) => m._id).sort()).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(clusters[0].reasons.sort()).toEqual(['email', 'name'])
  })

  it('keeps unrelated duplicate groups in separate clusters, largest first', () => {
    const speakers: DuplicateSpeakerInput[] = [
      { _id: 'x1', name: 'Solo Group', email: 'x@example.com' },
      { _id: 'x2', name: 'Solo Group', email: 'x2@example.com' },
      { _id: 'y1', name: 'Trio', email: 'y@example.com' },
      { _id: 'y2', name: 'Trio', email: 'y2@example.com' },
      { _id: 'y3', name: 'Trio', email: 'y3@example.com' },
      { _id: 'z1', name: 'Lonely', email: 'z@example.com' },
    ]
    const clusters = clusterDuplicateSpeakers(speakers)
    expect(clusters).toHaveLength(2)
    // Largest cluster first.
    expect(clusters[0].members).toHaveLength(3)
    expect(clusters[1].members).toHaveLength(2)
  })

  it('does not cluster on empty/blank names or emails', () => {
    const speakers: DuplicateSpeakerInput[] = [
      { _id: 'a', name: '', email: '' },
      { _id: 'b', name: '   ', email: null },
      { _id: 'c', name: '', knownEmails: [] },
    ]
    expect(clusterDuplicateSpeakers(speakers)).toEqual([])
  })
})
