import { describe, it, expect } from 'vitest'
import {
  repointReferencesInDocument,
  computeSurvivorFieldMerge,
  assertMergeable,
  buildMergePlan,
  reconcileDeterministicDoc,
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

  it('unions and normalizes knownEmails from the two verified match-sets', () => {
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

  // SECURITY (#808): the display `email` must NEVER be folded into knownEmails
  // (the verified login match-set). Its unverified writer, speaker.admin.create,
  // would otherwise let an organizer launder an attacker-chosen address into a
  // victim's verified set via a throwaway merge — a cross-tenant takeover.
  it('does NOT fold either display email into knownEmails (#808)', () => {
    const survivor = speaker({
      email: 'victim-display@example.com',
      knownEmails: ['victim-verified@example.com'],
    })
    const loser = speaker({
      _id: LOSER,
      email: 'attacker@evil.example', // organizer-typed, never signed in
      knownEmails: [], // throwaway has no verified match-set
    })
    const { set, identity } = computeSurvivorFieldMerge(survivor, loser)
    // Only the survivor's own verified email survives; neither display email is
    // promoted into the verified set.
    expect(set.knownEmails).toBeUndefined() // union adds nothing → no patch
    expect(identity.knownEmails.after).toEqual(['victim-verified@example.com'])
    expect(identity.knownEmails.after).not.toContain('attacker@evil.example')
    expect(identity.knownEmails.after).not.toContain(
      'victim-display@example.com',
    )
  })

  it('unions ONLY the genuine verified knownEmails of two real duplicates (#808)', () => {
    // A legitimate de-duplication: both accounts are real, each with its own
    // verified match-set AND display email. The merge must still union the two
    // verified sets (no regression) while ignoring the display emails.
    const survivor = speaker({
      email: 'ada@example.com',
      knownEmails: ['ada@example.com', 'ada.old@example.com'],
    })
    const loser = speaker({
      _id: LOSER,
      email: 'ada.l@work.io',
      knownEmails: ['ada.l@work.io'],
    })
    const { set, identity } = computeSurvivorFieldMerge(survivor, loser)
    expect(set.knownEmails).toEqual([
      'ada@example.com',
      'ada.old@example.com',
      'ada.l@work.io',
    ])
    expect(identity.knownEmails.after).toEqual([
      'ada@example.com',
      'ada.old@example.com',
      'ada.l@work.io',
    ])
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
    expect(set.title).toBe('Loser title') // gap filled
    expect(set.imageURL).toBe('https://img/loser.png') // gap filled
    // links/flags are ARRAYS — unioned, not gap-filled (see the union tests).
    expect(set.flags).toEqual(['local', 'diverse'])
    expect(set.links).toEqual(['https://loser.dev'])
    expect(new Set(filledFromLoser)).toEqual(new Set(['title', 'imageURL']))
  })

  // --- email recommendation (verification-aware) ----------------------------
  //
  // THE REPORTED BUG. `email` used to follow whichever document won
  // `pickSurvivor` (confirmed talks → talks → age — no email signal). The
  // organizer-created placeholder usually holds the talks while the verified
  // login document holds none, so the typed address overwrote the real one.
  // Each of these asserts on the RECOMMENDED SIDE and the resulting value, so
  // they fail against the old "survivor's non-empty email always wins" rule.

  it('recommends the provider-verified address over an organizer-typed one', () => {
    // Survivor: created by `speaker.admin.create`, address typed by an organizer,
    // never signed in. Loser: the real login, address in its verified match-set.
    const survivor = speaker({ email: 'typo@organizer.example' })
    const loser = speaker({
      _id: LOSER,
      email: 'real@person.dev',
      providers: ['github:42'],
      knownEmails: ['real@person.dev'],
    })

    const { set, fields } = computeSurvivorFieldMerge(survivor, loser)
    const email = fields.find((f) => f.field === 'email')!
    expect(email.recommended).toBe('loser')
    expect(email.reason).toBe('verified-known-account')
    expect(email.selected).toBe('loser')
    expect(set.email).toBe('real@person.dev')
  })

  it('recommends the side with a linked account when neither address is verified', () => {
    const survivor = speaker({ email: 'typed@organizer.example' })
    const loser = speaker({
      _id: LOSER,
      email: 'signed-in@person.dev',
      providers: ['linkedin:7'],
    })

    const { set, fields } = computeSurvivorFieldMerge(survivor, loser)
    const email = fields.find((f) => f.field === 'email')!
    expect(email.recommended).toBe('loser')
    expect(email.reason).toBe('has-linked-account')
    expect(set.email).toBe('signed-in@person.dev')
  })

  it('keeps the survivor address when IT is the verified one', () => {
    const survivor = speaker({
      email: 'real@person.dev',
      providers: ['github:42'],
      knownEmails: ['real@person.dev'],
    })
    const loser = speaker({ _id: LOSER, email: 'typo@organizer.example' })

    const { set, fields } = computeSurvivorFieldMerge(survivor, loser)
    const email = fields.find((f) => f.field === 'email')!
    expect(email.recommended).toBe('survivor')
    expect(email.reason).toBe('verified-known-account')
    expect(set.email).toBeUndefined()
  })

  it('falls back to the survivor when nothing separates the two addresses', () => {
    const survivor = speaker({ email: 'a@x.dev', providers: ['github:1'] })
    const loser = speaker({
      _id: LOSER,
      email: 'b@x.dev',
      providers: ['github:2'],
    })
    const email = computeSurvivorFieldMerge(survivor, loser).fields.find(
      (f) => f.field === 'email',
    )!
    expect(email.recommended).toBe('survivor')
    expect(email.reason).toBe('survivor-default')
  })

  it('honours an operator override against the recommendation', () => {
    const survivor = speaker({ email: 'typed@organizer.example' })
    const loser = speaker({
      _id: LOSER,
      email: 'real@person.dev',
      providers: ['github:42'],
      knownEmails: ['real@person.dev'],
    })

    const { set, fields } = computeSurvivorFieldMerge(survivor, loser, {
      email: 'survivor',
    })
    const email = fields.find((f) => f.field === 'email')!
    expect(email.recommended).toBe('loser') // recommendation unchanged…
    expect(email.selected).toBe('survivor') // …but the operator overrode it.
    expect(set.email).toBeUndefined() // survivor's own address kept
  })

  it('a selection can only ever yield one of the two documents own values', () => {
    const survivor = speaker({ email: 'a@x.dev', bio: 'Survivor bio' })
    const loser = speaker({ _id: LOSER, email: 'b@x.dev', bio: 'Loser bio' })
    for (const side of ['survivor', 'loser'] as const) {
      const { set } = computeSurvivorFieldMerge(survivor, loser, {
        email: side,
        bio: side,
      })
      const applied = { ...survivor, ...set }
      expect(['a@x.dev', 'b@x.dev']).toContain(applied.email)
      expect(['Survivor bio', 'Loser bio']).toContain(applied.bio)
    }
  })

  it('a chosen display email is stored CANONICAL (#684)', () => {
    // A non-canonical display address resolves to no document on the next
    // login, which spawns the very duplicate this tool exists to remove.
    const survivor = speaker({ email: 'a@x.dev' })
    const loser = speaker({ _id: LOSER, email: '  Real.Person@Example.COM ' })
    const { set } = computeSurvivorFieldMerge(survivor, loser, {
      email: 'loser',
    })
    expect(set.email).toBe('real.person@example.com')
  })

  it('a chosen-but-empty side never UNSETS what the survivor has', () => {
    const survivor = speaker({ email: 'keep@me.dev', bio: 'Survivor bio' })
    const loser = speaker({ _id: LOSER, email: '', bio: undefined })
    const { set } = computeSurvivorFieldMerge(survivor, loser, {
      email: 'loser',
      bio: 'loser',
    })
    expect(set.email).toBeUndefined()
    expect(set.bio).toBeUndefined()
  })

  it('still refuses to fold a CHOSEN display email into knownEmails (#808)', () => {
    const survivor = speaker({ email: 'typed@organizer.example' })
    const loser = speaker({
      _id: LOSER,
      email: 'unverified@loser.dev',
      providers: ['github:9'],
    })
    const { set, unions } = computeSurvivorFieldMerge(survivor, loser, {
      email: 'loser',
    })
    expect(set.email).toBe('unverified@loser.dev')
    expect(unions.knownEmails.after).toEqual([])
    expect(set.knownEmails).toBeUndefined()
  })

  // --- multi-value unions ---------------------------------------------------

  it('unions links and flags instead of destroying the losers set', () => {
    const survivor = speaker({
      links: ['https://a.dev', 'https://a.dev'],
      flags: ['local'],
    })
    const loser = speaker({
      _id: LOSER,
      links: ['https://b.dev', 'https://a.dev'],
      flags: ['requiresTravelFunding', 'local'],
    })
    const { set, unions } = computeSurvivorFieldMerge(survivor, loser)
    expect(set.links).toEqual(['https://a.dev', 'https://b.dev'])
    expect(set.flags).toEqual(['local', 'requiresTravelFunding'])
    expect(unions.links.before).toEqual(['https://a.dev'])
  })

  it('unions organizations by _ref and gives every entry a unique _key', () => {
    const survivor = speaker({
      organizations: [{ _type: 'reference', _ref: 'org-a', _key: 'k1' }],
    })
    const loser = speaker({
      _id: LOSER,
      organizations: [
        // Same colliding `_key` minted in a different document, plus a duplicate.
        { _type: 'reference', _ref: 'org-b', _key: 'k1' },
        { _type: 'reference', _ref: 'org-a', _key: 'k9' },
      ],
    })
    const orgs = computeSurvivorFieldMerge(survivor, loser).set
      .organizations as Array<{ _ref: string; _key: string }>
    expect(orgs.map((o) => o._ref)).toEqual(['org-a', 'org-b'])
    expect(new Set(orgs.map((o) => o._key)).size).toBe(2)
  })

  it('de-collides derived organization keys (stripping is not injective)', () => {
    // `org.a` and `org-a` are DIFFERENT documents that both strip to `orga`, so
    // a naive derived key would emit two identical `_key`s — an invalid array.
    const survivor = speaker({
      organizations: [{ _type: 'reference', _ref: 'org.a' }],
    })
    const loser = speaker({
      _id: LOSER,
      organizations: [{ _type: 'reference', _ref: 'org-a' }],
    })
    const orgs = computeSurvivorFieldMerge(survivor, loser).set
      .organizations as Array<{ _ref: string; _key: string }>
    expect(orgs.map((o) => o._ref)).toEqual(['org.a', 'org-a'])
    expect(new Set(orgs.map((o) => o._key)).size).toBe(2)
  })

  it('gap-fills gender/country, carrying genderSelfDescribe with gender', () => {
    const survivor = speaker({ gender: undefined, country: 'Norway' })
    const loser = speaker({
      _id: LOSER,
      gender: 'Prefer to self-describe',
      genderSelfDescribe: 'Non-binary',
      country: 'Sweden',
    })
    const { set, filledFromLoser } = computeSurvivorFieldMerge(survivor, loser)
    expect(set.gender).toBe('Prefer to self-describe')
    expect(set.genderSelfDescribe).toBe('Non-binary')
    expect(set.country).toBeUndefined() // survivor already had one
    expect(filledFromLoser).toContain('gender')
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

// --- reconcileDeterministicDoc (M4) ----------------------------------------

describe('reconcileDeterministicDoc', () => {
  it('MERGEs a convpref: more-restrictive mute wins, loser doc deleted', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `convpref.c1.${LOSER}`,
        _type: 'conversationPreference',
        muted: true,
      },
      {
        _id: `convpref.c1.${SURVIVOR}`,
        _type: 'conversationPreference',
        muted: false,
      },
      LOSER,
      SURVIVOR,
    )
    expect(rec.deleteId).toBe(`convpref.c1.${LOSER}`)
    expect(rec.canonicalId).toBe(`convpref.c1.${SURVIVOR}`)
    expect(rec.mergeSet).toEqual({ muted: true })
    expect(rec.createDoc).toBeUndefined()
  })

  it('MERGEs a convpref with no mute change → empty patch', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `convpref.c1.${LOSER}`,
        _type: 'conversationPreference',
        muted: false,
      },
      {
        _id: `convpref.c1.${SURVIVOR}`,
        _type: 'conversationPreference',
        muted: true,
      },
      LOSER,
      SURVIVOR,
    )
    // Survivor already muted (more restrictive) → nothing to change.
    expect(rec.mergeSet).toEqual({})
  })

  it('RECREATEs a convpref when the survivor has no canonical doc, repointing the speaker ref', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `convpref.c1.${LOSER}`,
        _type: 'conversationPreference',
        _rev: 'r1',
        speaker: { _type: 'reference', _ref: LOSER },
        muted: true,
      },
      undefined,
      LOSER,
      SURVIVOR,
    )
    expect(rec.createDoc).toEqual({
      _id: `convpref.c1.${SURVIVOR}`,
      _type: 'conversationPreference',
      speaker: { _type: 'reference', _ref: SURVIVOR },
      muted: true,
    })
    expect(rec.deleteId).toBe(`convpref.c1.${LOSER}`)
  })

  it('MERGEs a message notification: SUMS unread piles, keeps unread', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `notification.message.c1.${LOSER}`,
        _type: 'notification',
        count: 2,
      },
      {
        _id: `notification.message.c1.${SURVIVOR}`,
        _type: 'notification',
        count: 3,
      },
      LOSER,
      SURVIVOR,
    )
    // Both unread (no readAt) → 3 + 2 = 5, still unread.
    expect(rec.mergeSet).toEqual({ count: 5 })
    expect(rec.mergeUnset ?? []).toEqual([])
  })

  it('MERGEs a message notification: a READ survivor + unread loser becomes unread', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `notification.message.c1.${LOSER}`,
        _type: 'notification',
        count: 4,
      },
      {
        _id: `notification.message.c1.${SURVIVOR}`,
        _type: 'notification',
        count: 1,
        readAt: '2026-07-01T00:00:00Z',
      },
      LOSER,
      SURVIVOR,
    )
    // Survivor was read (0 unread) + loser 4 unread → 4, and readAt is cleared.
    expect(rec.mergeSet).toEqual({ count: 4 })
    expect(rec.mergeUnset).toEqual(['readAt'])
  })

  it('MERGEs a message notification: both READ → no count/readAt change', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `notification.message.c1.${LOSER}`,
        _type: 'notification',
        count: 2,
        readAt: '2026-07-01T00:00:00Z',
      },
      {
        _id: `notification.message.c1.${SURVIVOR}`,
        _type: 'notification',
        count: 1,
        readAt: '2026-07-02T00:00:00Z',
      },
      LOSER,
      SURVIVOR,
    )
    expect(rec.mergeSet).toEqual({})
    expect(rec.mergeUnset ?? []).toEqual([])
  })
})

describe('buildMergePlan — deterministic reconciliation (M4)', () => {
  const survivor = speaker({ _id: SURVIVOR })
  const loser = speaker({ _id: LOSER })

  it('pulls convpref/notification collision docs OUT of the generic repoint into reconciliations', () => {
    const referencingDocs = [
      { _id: 'talk-1', _type: 'talk', speakers: [ref(LOSER, 'k1')] },
      {
        _id: `convpref.c1.${LOSER}`,
        _type: 'conversationPreference',
        speaker: ref(LOSER),
        muted: true,
      },
    ]
    const survivorDeterministicDocs = [
      {
        _id: `convpref.c1.${SURVIVOR}`,
        _type: 'conversationPreference',
        speaker: ref(SURVIVOR),
        muted: false,
      },
    ]
    const plan = buildMergePlan(
      survivor,
      loser,
      referencingDocs,
      survivorDeterministicDocs,
    )
    // The convpref is NOT a generic documentPatch.
    expect(plan.documentPatches.map((p) => p.id)).toEqual(['talk-1'])
    // It IS a reconciliation (merge to muted).
    expect(plan.deterministicReconciliations).toHaveLength(1)
    expect(plan.deterministicReconciliations[0].mergeSet).toEqual({
      muted: true,
    })
    expect(plan.summary.reconciledDeterministicDocCount).toBe(1)
  })
})

// --- Issue #1027 (1): talk.issuedSpeakerTickets[].speakerId ----------------

describe('repointReferencesInDocument — issuedSpeakerTickets (#1027 item 1)', () => {
  it('repoints the plain-string speakerId AND the derived _key', () => {
    const doc = {
      _id: 'talk-1',
      _type: 'talk',
      speakers: [ref(LOSER, 'k1')],
      issuedSpeakerTickets: [
        {
          _key: `speaker-ticket-${LOSER}`,
          speakerId: LOSER,
          email: 'ada.l@work.io',
          emailedAt: '2026-05-01T10:00:00Z',
        },
      ],
    }
    const { doc: out, changedKeys } = repointReferencesInDocument(
      doc,
      LOSER,
      SURVIVOR,
    )
    expect(new Set(changedKeys)).toEqual(
      new Set(['speakers', 'issuedSpeakerTickets']),
    )
    expect(out.issuedSpeakerTickets).toEqual([
      {
        _key: `speaker-ticket-${SURVIVOR}`,
        speakerId: SURVIVOR,
        email: 'ada.l@work.io',
        emailedAt: '2026-05-01T10:00:00Z',
      },
    ])
  })

  it('patches a talk whose ONLY loser mention is a ticket marker', () => {
    const doc = {
      _id: 'talk-1',
      _type: 'talk',
      speakers: [ref('other', 'k1')],
      issuedSpeakerTickets: [
        { _key: `speaker-ticket-${LOSER}`, speakerId: LOSER },
      ],
    }
    const { changedKeys, repointed } = repointReferencesInDocument(
      doc,
      LOSER,
      SURVIVOR,
    )
    // Without the string repoint this doc has NOTHING to patch (repointed 0),
    // and buildMergePlan skips the whole patch.
    expect(repointed).toBe(1)
    expect(changedKeys).toEqual(['issuedSpeakerTickets'])
  })

  it('COLLISION: both speakers hold a marker → ONE survivor entry (first wins)', () => {
    const doc = {
      _id: 'talk-1',
      _type: 'talk',
      issuedSpeakerTickets: [
        {
          _key: `speaker-ticket-${LOSER}`,
          speakerId: LOSER,
          email: 'ada.l@work.io',
          emailedAt: '2026-05-01T10:00:00Z',
        },
        {
          _key: `speaker-ticket-${SURVIVOR}`,
          speakerId: SURVIVOR,
          email: 'ada@example.com',
          emailedAt: '2026-06-01T10:00:00Z',
        },
      ],
    }
    const { doc: out } = repointReferencesInDocument(doc, LOSER, SURVIVOR)
    // Exactly one entry with a single valid _key — never two identical keys.
    expect(out.issuedSpeakerTickets).toEqual([
      {
        _key: `speaker-ticket-${SURVIVOR}`,
        speakerId: SURVIVOR,
        email: 'ada.l@work.io',
        emailedAt: '2026-05-01T10:00:00Z',
      },
    ])
  })

  it('COLLISION: normalizes a KEPT survivor entry carrying a legacy _key', () => {
    // `speaker-ticket-legacy` exists in the wild (see erasure.test.ts). Leaving
    // it on the kept entry hides the marker from `recordSpeakerTicketEmailed`'s
    // `_key` lookup, which then appends a SECOND entry for the same speakerId.
    const doc = {
      _id: 'talk-1',
      _type: 'talk',
      issuedSpeakerTickets: [
        { _key: 'speaker-ticket-legacy', speakerId: SURVIVOR },
        { _key: `speaker-ticket-${LOSER}`, speakerId: LOSER },
      ],
    }
    const { doc: out, repointed } = repointReferencesInDocument(
      doc,
      LOSER,
      SURVIVOR,
    )
    expect(repointed).toBe(1)
    expect(out.issuedSpeakerTickets).toEqual([
      { _key: `speaker-ticket-${SURVIVOR}`, speakerId: SURVIVOR },
    ])
  })

  it('leaves markers for other speakers, and a survivor-only talk, untouched', () => {
    const doc = {
      _id: 'talk-1',
      _type: 'talk',
      issuedSpeakerTickets: [
        { _key: 'speaker-ticket-other', speakerId: 'other' },
        { _key: `speaker-ticket-${SURVIVOR}`, speakerId: SURVIVOR },
      ],
    }
    const { doc: out, repointed } = repointReferencesInDocument(
      doc,
      LOSER,
      SURVIVOR,
    )
    expect(repointed).toBe(0)
    expect(out).toBe(doc)
  })
})

// --- Issue #1027 (3): conversation.participants[] --------------------------

describe('repointReferencesInDocument — conversation participants (#1027 item 3)', () => {
  const organizers = { _key: 'g', partyType: 'group', group: 'organizers' }

  it('repoints a wrapped speaker party', () => {
    const doc = {
      _id: 'conv-1',
      _type: 'conversation',
      participants: [
        organizers,
        { _key: 'p1', partyType: 'speaker', speaker: ref(LOSER) },
      ],
    }
    const { doc: out, repointed } = repointReferencesInDocument(
      doc,
      LOSER,
      SURVIVOR,
    )
    expect(repointed).toBe(1)
    expect(out.participants).toEqual([
      organizers,
      { _key: 'p1', partyType: 'speaker', speaker: ref(SURVIVOR) },
    ])
  })

  it('COLLISION: both speakers participated → ONE party, first _key kept', () => {
    const doc = {
      _id: 'conv-1',
      _type: 'conversation',
      participants: [
        { _key: 'p1', partyType: 'speaker', speaker: ref(SURVIVOR) },
        organizers,
        { _key: 'p2', partyType: 'speaker', speaker: ref(LOSER) },
      ],
    }
    const { doc: out } = repointReferencesInDocument(doc, LOSER, SURVIVOR)
    expect(out.participants).toEqual([
      { _key: 'p1', partyType: 'speaker', speaker: ref(SURVIVOR) },
      organizers,
    ])
  })

  it('keeps every OTHER party, including a second distinct speaker', () => {
    const doc = {
      _id: 'conv-1',
      _type: 'conversation',
      participants: [
        { _key: 'p1', partyType: 'speaker', speaker: ref('other') },
        { _key: 'p2', partyType: 'speaker', speaker: ref(LOSER) },
        organizers,
      ],
    }
    const { doc: out } = repointReferencesInDocument(doc, LOSER, SURVIVOR)
    expect(out.participants).toHaveLength(3)
  })
})

// --- Issue #1027 (2): scheduledReminderLog ---------------------------------

describe('reconcileDeterministicDoc — scheduledReminderLog (#1027 item 2)', () => {
  const CONF = 'conf-1'

  it('MERGEs a recurring marker: counts SUM, latest lastSentAt wins', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `reminder.cfp-open.${CONF}.${LOSER}`,
        _type: 'scheduledReminderLog',
        count: 2,
        lastSentAt: '2026-05-10T00:00:00Z',
      },
      {
        _id: `reminder.cfp-open.${CONF}.${SURVIVOR}`,
        _type: 'scheduledReminderLog',
        count: 1,
        lastSentAt: '2026-05-01T00:00:00Z',
      },
      LOSER,
      SURVIVOR,
    )
    expect(rec.deleteId).toBe(`reminder.cfp-open.${CONF}.${LOSER}`)
    expect(rec.canonicalId).toBe(`reminder.cfp-open.${CONF}.${SURVIVOR}`)
    expect(rec.mergeSet).toEqual({
      count: 3,
      lastSentAt: '2026-05-10T00:00:00Z',
    })
  })

  it('MERGE never moves lastSentAt BACKWARDS (that would re-open the spacing window)', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `reminder.cfp-open.${CONF}.${LOSER}`,
        _type: 'scheduledReminderLog',
        count: 1,
        lastSentAt: '2026-01-01T00:00:00Z',
      },
      {
        _id: `reminder.cfp-open.${CONF}.${SURVIVOR}`,
        _type: 'scheduledReminderLog',
        count: 1,
        lastSentAt: '2026-05-01T00:00:00Z',
      },
      LOSER,
      SURVIVOR,
    )
    expect(rec.mergeSet).toEqual({ count: 2 })
  })

  it('RECREATEs the marker under the survivor id when the survivor has none', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `reminder.cfp-open.${CONF}.${LOSER}`,
        _type: 'scheduledReminderLog',
        _rev: 'r1',
        key: 'cfp-open',
        conference: { _type: 'reference', _ref: CONF, _weak: true },
        speaker: { _type: 'reference', _ref: LOSER, _weak: true },
        count: 2,
        lastSentAt: '2026-05-10T00:00:00Z',
      },
      undefined,
      LOSER,
      SURVIVOR,
    )
    expect(rec.createDoc).toEqual({
      _id: `reminder.cfp-open.${CONF}.${SURVIVOR}`,
      _type: 'scheduledReminderLog',
      key: 'cfp-open',
      conference: { _type: 'reference', _ref: CONF, _weak: true },
      speaker: { _type: 'reference', _ref: SURVIVOR, _weak: true },
      count: 2,
      lastSentAt: '2026-05-10T00:00:00Z',
    })
  })

  it('reconciles a DAY-OF marker, whose speaker id is NOT the last segment', () => {
    const rec = reconcileDeterministicDoc(
      {
        _id: `reminder.day-of.${CONF}.${LOSER}.2026-09-01`,
        _type: 'scheduledReminderLog',
        count: 1,
        lastSentAt: '2026-09-01T06:00:00Z',
      },
      undefined,
      LOSER,
      SURVIVOR,
    )
    expect(rec.canonicalId).toBe(
      `reminder.day-of.${CONF}.${SURVIVOR}.2026-09-01`,
    )
    expect(rec.createDoc?._id).toBe(
      `reminder.day-of.${CONF}.${SURVIVOR}.2026-09-01`,
    )
  })

  it('leaves a mid-id speaker segment alone OUTSIDE the day-of prefix', () => {
    // The mid-id rewrite is deliberately bounded to `reminder.day-of.`, whose
    // shape is known. Any other id with the speaker in the middle is not a
    // deterministic collision we can name, so it keeps the generic repoint —
    // observable here as the canonical id falling back to the id itself.
    const deleteId = `reminder.cfp-open.${LOSER}.2026-09-01`
    const rec = reconcileDeterministicDoc(
      { _id: deleteId, _type: 'scheduledReminderLog', count: 1 },
      undefined,
      LOSER,
      SURVIVOR,
    )
    expect(rec.canonicalId).toBe(deleteId)
  })
})

describe('buildMergePlan — reminder markers (#1027 item 2)', () => {
  const survivor = speaker({ _id: SURVIVOR })
  const loser = speaker({ _id: LOSER })

  it('pulls reminder markers OUT of the generic repoint into reconciliations', () => {
    const loserMarker = {
      _id: `reminder.cfp-open.conf-1.${LOSER}`,
      _type: 'scheduledReminderLog',
      speaker: ref(LOSER),
      count: 1,
      lastSentAt: '2026-05-10T00:00:00Z',
    }
    const plan = buildMergePlan(
      survivor,
      loser,
      [loserMarker],
      [
        {
          _id: `reminder.cfp-open.conf-1.${SURVIVOR}`,
          _type: 'scheduledReminderLog',
          speaker: ref(SURVIVOR),
          count: 1,
          lastSentAt: '2026-05-01T00:00:00Z',
        },
      ],
    )
    // NOT a generic patch: a repointed-but-loser-keyed marker is invisible to
    // the cron's survivor-keyed createIfNotExists, which re-sends the reminder.
    expect(plan.documentPatches).toEqual([])
    expect(plan.deterministicReconciliations).toEqual([
      {
        deleteId: `reminder.cfp-open.conf-1.${LOSER}`,
        canonicalId: `reminder.cfp-open.conf-1.${SURVIVOR}`,
        mergeSet: { count: 2, lastSentAt: '2026-05-10T00:00:00Z' },
      },
    ])
    expect(plan.summary.reconciledDeterministicDocCount).toBe(1)
  })

  it('keeps a reminder marker for a THIRD speaker on the generic repoint path', () => {
    const otherMarker = {
      _id: 'reminder.cfp-open.conf-1.speaker-third',
      _type: 'scheduledReminderLog',
      speaker: ref('speaker-third'),
      actor: ref(LOSER),
    }
    const plan = buildMergePlan(survivor, loser, [otherMarker])
    expect(plan.documentPatches.map((p) => p.id)).toEqual([otherMarker._id])
    expect(plan.deterministicReconciliations).toEqual([])
  })
})
