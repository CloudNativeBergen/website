import { describe, it, expect } from 'vitest'
import {
  repointReferencesInDocument,
  computeSurvivorFieldMerge,
  assertMergeable,
  buildMergePlan,
  MergeValidationError,
  type MergeSpeakerDoc,
} from './merge'

const SURVIVOR = 'speaker-survivor'
const LOSER = 'speaker-loser'

function ref(id: string, key?: string) {
  return key
    ? { _type: 'reference', _ref: id, _key: key }
    : { _type: 'reference', _ref: id }
}

function speaker(overrides: Partial<MergeSpeakerDoc> = {}): MergeSpeakerDoc {
  return {
    _id: SURVIVOR,
    _type: 'speaker',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    ...overrides,
  }
}

// --- repointReferencesInDocument -------------------------------------------

describe('repointReferencesInDocument', () => {
  it('replaces a single top-level reference (review.reviewer)', () => {
    const doc = { _id: 'review-1', _type: 'review', reviewer: ref(LOSER) }
    const {
      doc: out,
      changedKeys,
      repointed,
    } = repointReferencesInDocument(doc, LOSER, SURVIVOR)
    expect(repointed).toBe(1)
    expect(changedKeys).toEqual(['reviewer'])
    expect(out.reviewer).toEqual({ _type: 'reference', _ref: SURVIVOR })
  })

  it('replaces a reference inside an array (talk.speakers[])', () => {
    const doc = {
      _id: 'talk-1',
      _type: 'talk',
      speakers: [ref('speaker-other', 'k1'), ref(LOSER, 'k2')],
    }
    const {
      doc: out,
      changedKeys,
      repointed,
    } = repointReferencesInDocument(doc, LOSER, SURVIVOR)
    expect(repointed).toBe(1)
    expect(changedKeys).toEqual(['speakers'])
    expect(out.speakers).toEqual([
      ref('speaker-other', 'k1'),
      { _type: 'reference', _ref: SURVIVOR, _key: 'k2' },
    ])
  })

  it('deduplicates when the survivor is already present in the array', () => {
    const doc = {
      _id: 'talk-1',
      _type: 'talk',
      speakers: [ref(SURVIVOR, 'k1'), ref(LOSER, 'k2')],
    }
    const { doc: out, repointed } = repointReferencesInDocument(
      doc,
      LOSER,
      SURVIVOR,
    )
    expect(repointed).toBe(1)
    // Loser entry collapses into the existing survivor entry — no duplicate.
    expect(out.speakers).toEqual([ref(SURVIVOR, 'k1')])
  })

  it('keeps the loser entry (repointed) when survivor comes after it', () => {
    const doc = {
      _id: 'gallery-1',
      _type: 'imageGallery',
      speakers: [ref(LOSER, 'k1'), ref(SURVIVOR, 'k2')],
    }
    const { doc: out } = repointReferencesInDocument(doc, LOSER, SURVIVOR)
    // First survivor-pointing entry kept (the repointed loser, key k1).
    expect(out.speakers).toEqual([
      { _type: 'reference', _ref: SURVIVOR, _key: 'k1' },
    ])
  })

  it('reports no change when the document does not reference the loser', () => {
    const doc = { _id: 'review-2', _type: 'review', reviewer: ref('someone') }
    const {
      doc: out,
      changedKeys,
      repointed,
    } = repointReferencesInDocument(doc, LOSER, SURVIVOR)
    expect(repointed).toBe(0)
    expect(changedKeys).toEqual([])
    // Structural sharing: unchanged doc is returned by identity.
    expect(out).toBe(doc)
  })

  it('repoints multiple single refs in one document (travelSupport)', () => {
    const doc = {
      _id: 'ts-1',
      _type: 'travelSupport',
      speaker: ref(LOSER),
      reviewedBy: ref(LOSER),
    }
    const {
      changedKeys,
      repointed,
      doc: out,
    } = repointReferencesInDocument(doc, LOSER, SURVIVOR)
    expect(repointed).toBe(2)
    expect(new Set(changedKeys)).toEqual(new Set(['speaker', 'reviewedBy']))
    expect(out.speaker).toEqual({ _type: 'reference', _ref: SURVIVOR })
    expect(out.reviewedBy).toEqual({ _type: 'reference', _ref: SURVIVOR })
  })

  it('preserves the survivor in conference.organizers[] (isOrganizer guarantee)', () => {
    const doc = {
      _id: 'conf-1',
      _type: 'conference',
      organizers: [ref('org-a', 'k1'), ref(LOSER, 'k2')],
      featuredSpeakers: [ref(LOSER, 'f1')],
    }
    const { doc: out, repointed } = repointReferencesInDocument(
      doc,
      LOSER,
      SURVIVOR,
    )
    expect(repointed).toBe(2)
    expect(out.organizers).toContainEqual({
      _type: 'reference',
      _ref: SURVIVOR,
      _key: 'k2',
    })
    expect(out.featuredSpeakers).toEqual([
      { _type: 'reference', _ref: SURVIVOR, _key: 'f1' },
    ])
  })
})

// --- computeSurvivorFieldMerge ---------------------------------------------

describe('computeSurvivorFieldMerge', () => {
  it('unions providers (deduplicated)', () => {
    const survivor = speaker({ providers: ['github:1'] })
    const loser = speaker({ _id: LOSER, providers: ['github:1', 'linkedin:2'] })
    const { set, identity } = computeSurvivorFieldMerge(survivor, loser)
    expect(set.providers).toEqual(['github:1', 'linkedin:2'])
    expect(identity.providers.after).toEqual(['github:1', 'linkedin:2'])
  })

  it('does not set providers when the union adds nothing', () => {
    const survivor = speaker({ providers: ['github:1', 'linkedin:2'] })
    const loser = speaker({ _id: LOSER, providers: ['github:1'] })
    const { set } = computeSurvivorFieldMerge(survivor, loser)
    expect(set.providers).toBeUndefined()
  })

  it('unions and normalizes knownEmails, folding both display emails', () => {
    const survivor = speaker({
      email: 'Ada@Example.com',
      knownEmails: ['ada@example.com'],
    })
    const loser = speaker({
      _id: LOSER,
      email: 'ADA.L@Work.io',
      knownEmails: ['ada.l@work.io'],
    })
    const { set } = computeSurvivorFieldMerge(survivor, loser)
    expect(set.knownEmails).toEqual(['ada@example.com', 'ada.l@work.io'])
  })

  it('preserves the survivor display email when non-empty', () => {
    const survivor = speaker({ email: 'keep@me.com' })
    const loser = speaker({ _id: LOSER, email: 'other@me.com' })
    const { set } = computeSurvivorFieldMerge(survivor, loser)
    expect(set.email).toBeUndefined()
  })

  it('fills the display email from the loser when the survivor has none', () => {
    const survivor = speaker({ email: '' })
    const loser = speaker({ _id: LOSER, email: 'fallback@me.com' })
    const { set } = computeSurvivorFieldMerge(survivor, loser)
    expect(set.email).toBe('fallback@me.com')
  })

  it('keeps survivor scalars and fills only the gaps from the loser', () => {
    const survivor = speaker({
      bio: 'Survivor bio',
      title: '',
      links: [],
      flags: ['local'],
    })
    const loser = speaker({
      _id: LOSER,
      bio: 'Loser bio',
      title: 'Loser title',
      links: ['https://loser.dev'],
      flags: ['diverse'],
      imageURL: 'https://img/loser.png',
    })
    const { set, filledFromLoser } = computeSurvivorFieldMerge(survivor, loser)
    expect(set.bio).toBeUndefined() // survivor kept
    expect(set.flags).toBeUndefined() // survivor kept (non-empty)
    expect(set.title).toBe('Loser title') // gap filled
    expect(set.links).toEqual(['https://loser.dev']) // gap filled
    expect(set.imageURL).toBe('https://img/loser.png') // gap filled
    expect(new Set(filledFromLoser)).toEqual(
      new Set(['title', 'links', 'imageURL']),
    )
  })

  it('never emits slug in the survivor patch', () => {
    const survivor = speaker({ slug: { current: 'ada' } })
    const loser = speaker({ _id: LOSER, slug: { current: 'ada-2' } })
    const { set } = computeSurvivorFieldMerge(survivor, loser)
    expect('slug' in set).toBe(false)
  })
})

// --- assertMergeable / buildMergePlan --------------------------------------

describe('assertMergeable', () => {
  it('rejects a self-merge', () => {
    const s = speaker()
    expect(() => assertMergeable(s, { ...s })).toThrow(MergeValidationError)
  })

  it('rejects when a document is missing', () => {
    expect(() => assertMergeable(speaker(), null)).toThrow(
      /Loser speaker not found/,
    )
    expect(() => assertMergeable(null, speaker())).toThrow(
      /Survivor speaker not found/,
    )
  })

  it('rejects non-speaker documents', () => {
    const survivor = speaker()
    const loser = speaker({ _id: LOSER, _type: 'talk' })
    expect(() => assertMergeable(survivor, loser)).toThrow(/must be speakers/)
  })

  it('rejects draft documents', () => {
    const survivor = speaker({ _id: 'drafts.speaker-survivor' })
    const loser = speaker({ _id: LOSER })
    expect(() => assertMergeable(survivor, loser)).toThrow(/draft/)
  })
})

describe('buildMergePlan', () => {
  const survivor = speaker({ providers: ['github:1'] })
  const loser = speaker({
    _id: LOSER,
    providers: ['linkedin:2'],
    email: 'loser@example.com',
  })
  const referencingDocs = [
    { _id: 'talk-1', _type: 'talk', speakers: [ref(LOSER, 'k1')] },
    {
      _id: 'conf-1',
      _type: 'conference',
      organizers: [ref(LOSER, 'k2')],
    },
    { _id: 'review-1', _type: 'review', reviewer: ref(LOSER) },
    // A doc that does NOT reference the loser must produce no patch.
    { _id: 'talk-2', _type: 'talk', speakers: [ref('other', 'k3')] },
  ]

  it('produces per-type repoint counts and a survivor patch', () => {
    const plan = buildMergePlan(survivor, loser, referencingDocs)
    expect(plan.summary.referenceRepointsByType).toEqual({
      talk: 1,
      conference: 1,
      review: 1,
    })
    expect(plan.summary.referencingDocCount).toBe(3)
    expect(plan.documentPatches.map((p) => p.id).sort()).toEqual([
      'conf-1',
      'review-1',
      'talk-1',
    ])
    expect(plan.survivorSet.providers).toEqual(['github:1', 'linkedin:2'])
  })

  it('preserves isOrganizer by repointing conference.organizers to the survivor', () => {
    const plan = buildMergePlan(survivor, loser, referencingDocs)
    const confPatch = plan.documentPatches.find((p) => p.id === 'conf-1')!
    expect(confPatch.set.organizers).toContainEqual({
      _type: 'reference',
      _ref: SURVIVOR,
      _key: 'k2',
    })
  })

  it('dry-run summary matches the committed plan (same pure function)', () => {
    const plan = buildMergePlan(survivor, loser, referencingDocs)
    // The summary is derived from exactly the patches/field-merge that would be
    // written, so counts in the preview equal the actual patch set.
    const actualByType = plan.documentPatches.reduce<Record<string, number>>(
      (acc, p) => {
        acc[p.type] = (acc[p.type] ?? 0) + p.repointed
        return acc
      },
      {},
    )
    expect(plan.summary.referenceRepointsByType).toEqual(actualByType)
    expect(plan.summary.willDeleteLoserId).toBe(LOSER)
  })
})
