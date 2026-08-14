/**
 * Pure-core tests for right-to-erasure Phase 1 (RunKonf/platform#52).
 *
 * These exercise {@link buildErasurePlan} with no Sanity involved. The
 * transaction boundary is pinned separately in `erasure.sanity.test.ts`.
 *
 * The three properties the PRD makes load-bearing each get their own describe
 * block, and each is written to fail on a VALUE or on the operation SUCCEEDING —
 * never on an absence.
 */

import { describe, it, expect } from 'vitest'
import {
  buildErasurePlan,
  erasedEmail,
  erasedSlug,
  speakerEmailMatchSet,
  ERASED_SPEAKER_NAME,
  ERASURE_UNSET_FIELDS,
  ErasureValidationError,
  type ErasureInputs,
  type ErasurePlan,
  type ErasureSpeakerDoc,
} from './erasure'

const SPEAKER = 'abcd1234efgh5678ijkl90'
const NOW = '2026-08-14T10:00:00.000Z'

function ref(id: string, key?: string) {
  return key
    ? { _type: 'reference', _ref: id, _key: key }
    : { _type: 'reference', _ref: id }
}

function speakerDoc(
  overrides: Partial<ErasureSpeakerDoc> = {},
): ErasureSpeakerDoc {
  return {
    _id: SPEAKER,
    _type: 'speaker',
    _rev: 'rev-speaker',
    name: 'Ada Lovelace',
    email: 'Ada@Example.com',
    knownEmails: ['ada@example.com', 'ada.l@work.io'],
    slug: { _type: 'slug', current: 'ada-lovelace' },
    title: 'Engineer',
    bio: 'Writes programs.',
    links: ['https://example.com'],
    flags: ['local'],
    gender: 'Woman',
    country: 'NO',
    providers: ['github:1'],
    imageURL: 'https://avatars.githubusercontent.com/u/1',
    image: { asset: ref('image-abc-500x500-png') },
    organizations: [ref('org-1')],
    consent: {
      dataProcessing: {
        granted: true,
        grantedAt: '2025-01-01T00:00:00.000Z',
        ipAddress: '203.0.113.9',
      },
      privacyPolicyVersion: '2025-01',
    },
    messagingEmailDefault: false,
    ...overrides,
  }
}

function inputs(overrides: Partial<ErasureInputs> = {}): ErasureInputs {
  return {
    speaker: speakerDoc(),
    referencingDocs: [],
    ticketTalks: [],
    emailKeyedDocs: [],
    slugConflictIds: [],
    now: NOW,
    ...overrides,
  }
}

/**
 * Apply a plan to an in-memory document store so a SECOND plan can be built
 * from the resulting state. This is how the fixed-point property is proved
 * without a live dataset: it implements Sanity's patch semantics for the ops
 * this module actually emits.
 */
function applyPlan(
  store: Map<string, Record<string, unknown>>,
  plan: ErasurePlan,
): void {
  const applyUnset = (doc: Record<string, unknown>, path: string) => {
    // `field[_key=="x"]` / `field[_ref=="x"]` array-entry selectors.
    const match = path.match(/^([A-Za-z]+)\[(_key|_ref)=="([^"]+)"\]$/)
    if (match) {
      const [, field, attr, value] = match
      const arr = doc[field]
      if (Array.isArray(arr)) {
        doc[field] = arr.filter(
          (item) => (item as Record<string, unknown>)?.[attr] !== value,
        )
      }
      return
    }
    const parts = path.split('.')
    let cursor: Record<string, unknown> | undefined = doc
    for (const part of parts.slice(0, -1)) {
      const next: unknown = cursor?.[part]
      cursor =
        next && typeof next === 'object'
          ? (next as Record<string, unknown>)
          : undefined
    }
    if (cursor) delete cursor[parts[parts.length - 1]]
  }

  for (const patch of plan.documentPatches) {
    const doc = store.get(patch.id)
    if (!doc) continue
    if (patch.setIfMissing) {
      for (const [k, v] of Object.entries(patch.setIfMissing)) {
        if (doc[k] === undefined) doc[k] = v
      }
    }
    if (patch.set) Object.assign(doc, patch.set)
    if (patch.unset) for (const path of patch.unset) applyUnset(doc, path)
    if (patch.append) {
      const arr = doc[patch.append.path]
      doc[patch.append.path] = [
        ...(Array.isArray(arr) ? arr : []),
        ...patch.append.items,
      ]
    }
  }

  const speaker = store.get(plan.speakerId)
  if (speaker) {
    for (const [k, v] of Object.entries(plan.speakerSetIfMissing)) {
      if (speaker[k] === undefined) speaker[k] = v
    }
    Object.assign(speaker, plan.speakerSet)
    for (const path of plan.speakerUnset) applyUnset(speaker, path)
  }

  for (const del of plan.documentDeletes) store.delete(del.id)
}

// ---------------------------------------------------------------------------

describe('the field patch — replace, never unset', () => {
  it('replaces name, slug and email with deterministic values', () => {
    const plan = buildErasurePlan(inputs())

    expect(plan.speakerSet.name).toBe('Deleted speaker')
    expect(plan.speakerSet.slug).toEqual({
      _type: 'slug',
      current: 'deleted-abcd1234',
    })
    expect(plan.speakerSet.email).toBe('deleted-abcd1234@anonymous.invalid')
  })

  it('never UNSETS name, slug or email — the code paths that throw on a null name would break', () => {
    const plan = buildErasurePlan(inputs())
    expect(plan.speakerUnset).not.toContain('name')
    expect(plan.speakerUnset).not.toContain('slug')
    expect(plan.speakerUnset).not.toContain('email')
  })

  it('uses an RFC 2606 .invalid address, which can never be a verified OAuth email', () => {
    expect(erasedEmail(SPEAKER).endsWith('@anonymous.invalid')).toBe(true)
  })

  it('unsets every identifying field that is present', () => {
    const plan = buildErasurePlan(inputs())
    for (const field of [
      'knownEmails',
      'providers',
      'imageURL',
      'image',
      'links',
      'bio',
      'title',
      'flags',
      'gender',
      'country',
      'messagingEmailDefault',
      'consent.dataProcessing.ipAddress',
    ]) {
      expect(plan.speakerUnset, `${field} must be unset`).toContain(field)
    }
  })

  it('carries the speaker _rev so its own patch can be revision-guarded', () => {
    expect(buildErasurePlan(inputs()).speakerRev).toBe('rev-speaker')
  })

  it('KEEPS _id and organizations — tenancy guards read organizations[]._ref', () => {
    const plan = buildErasurePlan(inputs())
    expect(plan.speakerUnset).not.toContain('organizations')
    expect(plan.speakerId).toBe(SPEAKER)
  })

  it('keeps the consent PROOF fields while removing the IP address', () => {
    const plan = buildErasurePlan(inputs())
    expect(plan.speakerUnset).toContain('consent.dataProcessing.ipAddress')
    expect(plan.speakerUnset).not.toContain('consent')
    expect(plan.speakerUnset).not.toContain('consent.dataProcessing.granted')
    expect(plan.speakerUnset).not.toContain('consent.privacyPolicyVersion')
  })

  it('omits an unset for a field that is already absent', () => {
    const plan = buildErasurePlan(
      inputs({
        speaker: speakerDoc({ bio: undefined, links: undefined }),
      }),
    )
    expect(plan.speakerUnset).not.toContain('bio')
    expect(plan.speakerUnset).not.toContain('links')
  })

  it('writes erasedAt with setIfMissing so a repeat preserves the original timestamp', () => {
    expect(buildErasurePlan(inputs()).speakerSetIfMissing).toEqual({
      erasedAt: NOW,
    })

    const alreadyErased = buildErasurePlan(
      inputs({
        speaker: speakerDoc({ erasedAt: '2020-01-01T00:00:00.000Z' }),
        now: '2099-01-01T00:00:00.000Z',
      }),
    )
    expect(alreadyErased.speakerSetIfMissing).toEqual({})
  })

  it('builds the email match-set from email + knownEmails, normalised', () => {
    expect(speakerEmailMatchSet(speakerDoc())).toEqual([
      'ada@example.com',
      'ada.l@work.io',
    ])
  })
})

describe('idempotency — the whole patch is a fixed point', () => {
  function fullInputs(): ErasureInputs {
    return inputs({
      referencingDocs: [
        {
          _id: 'conf-1',
          _type: 'conference',
          _rev: 'r1',
          organizers: [ref('other-organizer', 'k0'), ref(SPEAKER, 'k1')],
          featuredSpeakers: [ref(SPEAKER, 'k2')],
          teams: [
            {
              _key: 't1',
              key: 'cfp',
              members: [ref(SPEAKER, 'm1'), ref('other-organizer', 'm2')],
            },
          ],
        },
        {
          _id: 'img-1',
          _type: 'imageGallery',
          _rev: 'r2',
          speakers: [ref(SPEAKER, 'speaker-' + SPEAKER)],
        },
        {
          _id: 'ts-1',
          _type: 'travelSupport',
          _rev: 'r3',
          speaker: ref(SPEAKER),
          status: 'draft',
          bankingDetails: { beneficiaryName: 'x', swiftCode: 'y' },
        },
        {
          _id: 'notif-1',
          _type: 'notification',
          _rev: 'r4',
          recipient: ref(SPEAKER),
        },
        {
          _id: 'convpref.c1.' + SPEAKER,
          _type: 'conversationPreference',
          _rev: 'r5',
          speaker: ref(SPEAKER),
        },
        {
          _id: 'inv-1',
          _type: 'coSpeakerInvitation',
          _rev: 'r6',
          invitedEmail: 'ADA@example.com',
          invitedBy: ref('other-organizer'),
        },
      ],
      ticketTalks: [
        {
          _id: 'talk-1',
          _rev: 'r7',
          issuedSpeakerTickets: [
            { _key: `speaker-ticket-${SPEAKER}`, speakerId: SPEAKER },
            { _key: 'speaker-ticket-other', speakerId: 'other-speaker' },
          ],
        },
      ],
      emailKeyedDocs: [{ _id: 'token-1', _type: 'emailSignInToken' }],
    })
  }

  function storeFrom(
    source: ErasureInputs,
  ): Map<string, Record<string, unknown>> {
    const store = new Map<string, Record<string, unknown>>()
    store.set(
      SPEAKER,
      structuredClone(source.speaker) as Record<string, unknown>,
    )
    for (const doc of source.referencingDocs) {
      store.set(String(doc._id), structuredClone(doc))
    }
    for (const talk of source.ticketTalks) {
      store.set(
        talk._id,
        structuredClone(talk) as unknown as Record<string, unknown>,
      )
    }
    for (const doc of source.emailKeyedDocs) {
      store.set(doc._id, structuredClone(doc) as Record<string, unknown>)
    }
    return store
  }

  /** Rebuild the plan inputs from a post-run store. */
  function inputsFromStore(
    store: Map<string, Record<string, unknown>>,
  ): ErasureInputs {
    const speaker = store.get(SPEAKER) as ErasureSpeakerDoc
    const emails = speakerEmailMatchSet(speaker)
    const docs = [...store.values()].filter(
      (d) => d._id !== SPEAKER && d._type !== undefined,
    )
    // Re-derive `references($id)` from the surviving store, exactly as the GROQ
    // read would: any document still holding a ref to the subject.
    const referencing = docs.filter((d) =>
      JSON.stringify(d).includes(`"_ref":"${SPEAKER}"`),
    )
    const ticketTalks = [...store.values()]
      .filter((d) => Array.isArray(d.issuedSpeakerTickets))
      .filter((d) =>
        (
          d.issuedSpeakerTickets as Array<{
            speakerId?: string
            email?: string
          }>
        ).some(
          (e) =>
            e.speakerId === SPEAKER ||
            (e.email ? emails.includes(e.email.toLowerCase()) : false),
        ),
      )
      .map((d) => d as { _id: string; _rev?: string })
    return {
      speaker,
      referencingDocs: referencing,
      ticketTalks: ticketTalks as ErasureInputs['ticketTalks'],
      emailKeyedDocs: [],
      slugConflictIds: [SPEAKER],
      now: '2099-12-31T23:59:59.000Z',
    }
  }

  it('run twice: the store converges byte-identically', () => {
    const store = storeFrom(fullInputs())

    applyPlan(store, buildErasurePlan(fullInputs()))
    const afterFirst = JSON.stringify([...store.entries()].sort())

    applyPlan(store, buildErasurePlan(inputsFromStore(store)))
    const afterSecond = JSON.stringify([...store.entries()].sort())

    expect(afterSecond).toBe(afterFirst)
  })

  it('the SECOND plan is a no-op — nothing is even staged', () => {
    const store = storeFrom(fullInputs())
    applyPlan(store, buildErasurePlan(fullInputs()))

    const second = buildErasurePlan(inputsFromStore(store))
    expect(second.noop).toBe(true)
    expect(second.speakerSet).toEqual({})
    expect(second.speakerSetIfMissing).toEqual({})
    expect(second.speakerUnset).toEqual([])
    expect(second.documentPatches).toEqual([])
    expect(second.documentDeletes).toEqual([])
    expect(second.imageAssetId).toBeNull()
  })

  it('the erasedAt written by the first run survives the second', () => {
    const store = storeFrom(fullInputs())
    applyPlan(store, buildErasurePlan(fullInputs()))
    expect(store.get(SPEAKER)?.erasedAt).toBe(NOW)

    applyPlan(store, buildErasurePlan(inputsFromStore(store)))
    expect(store.get(SPEAKER)?.erasedAt).toBe(NOW)
  })

  it('the first run is NOT a no-op (the fixed-point test cannot pass vacuously)', () => {
    expect(buildErasurePlan(fullInputs()).noop).toBe(false)
  })
})

describe('the last-organizer refusal', () => {
  const soleOrganizer = {
    _id: 'conf-solo',
    _type: 'conference',
    _rev: 'r1',
    organizers: [ref(SPEAKER, 'k1')],
  }

  it('REFUSES when the subject is the only organizer of a conference', () => {
    const plan = buildErasurePlan(inputs({ referencingDocs: [soleOrganizer] }))
    expect(plan.refusals).toHaveLength(1)
    expect(plan.refusals[0]).toContain('only organizer of conference conf-solo')
  })

  it('does not stage a patch that would empty organizers[]', () => {
    const plan = buildErasurePlan(inputs({ referencingDocs: [soleOrganizer] }))
    const patch = plan.documentPatches.find((p) => p.id === 'conf-solo')
    expect(patch?.set?.organizers).toBeUndefined()
  })

  it('PROCEEDS, and removes the entry, when another organizer remains', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            ...soleOrganizer,
            organizers: [ref(SPEAKER, 'k1'), ref('other', 'k2')],
          },
        ],
      }),
    )
    expect(plan.refusals).toEqual([])
    const patch = plan.documentPatches.find((p) => p.id === 'conf-solo')
    expect(patch?.set?.organizers).toEqual([ref('other', 'k2')])
  })

  it('refuses on the ONE conference that would be emptied even when others are safe', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          soleOrganizer,
          {
            _id: 'conf-shared',
            _type: 'conference',
            _rev: 'r2',
            organizers: [ref(SPEAKER, 'k1'), ref('other', 'k2')],
          },
        ],
      }),
    )
    expect(plan.refusals).toHaveLength(1)
    expect(plan.refusals[0]).toContain('conf-solo')
  })

  it('removes the subject from featuredSpeakers[] with no min(1) to respect', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'conf-1',
            _type: 'conference',
            _rev: 'r1',
            featuredSpeakers: [ref(SPEAKER, 'k1')],
          },
        ],
      }),
    )
    expect(plan.refusals).toEqual([])
    expect(
      plan.documentPatches.find((p) => p.id === 'conf-1')?.set
        ?.featuredSpeakers,
    ).toEqual([])
  })

  it('removes a team whose ONLY member is the subject rather than leaving members[] empty', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'conf-1',
            _type: 'conference',
            _rev: 'r1',
            organizers: [ref(SPEAKER, 'k1'), ref('other', 'k2')],
            teams: [
              { _key: 't1', key: 'cfp', members: [ref(SPEAKER, 'm1')] },
              { _key: 't2', key: 'sponsors', members: [ref('other', 'm2')] },
            ],
          },
        ],
      }),
    )
    const teams = plan.documentPatches.find((p) => p.id === 'conf-1')?.set
      ?.teams as Array<Record<string, unknown>>
    expect(teams.map((t) => t.key)).toEqual(['sponsors'])
  })

  it('keeps a team that has other members, minus the subject', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'conf-1',
            _type: 'conference',
            _rev: 'r1',
            organizers: [ref(SPEAKER, 'k1'), ref('other', 'k2')],
            teams: [
              {
                _key: 't1',
                key: 'cfp',
                members: [ref(SPEAKER, 'm1'), ref('other', 'm2')],
              },
            ],
          },
        ],
      }),
    )
    const teams = plan.documentPatches.find((p) => p.id === 'conf-1')?.set
      ?.teams as Array<Record<string, unknown>>
    expect(teams[0].members).toEqual([ref('other', 'm2')])
  })
})

describe('the unpaid-only banking condition', () => {
  function travelSupport(status: string, extra: Record<string, unknown> = {}) {
    return {
      _id: `ts-${status || 'missing'}`,
      _type: 'travelSupport',
      _rev: 'r1',
      speaker: ref(SPEAKER),
      status,
      bankingDetails: { beneficiaryName: 'x', swiftCode: 'y' },
      ...extra,
    }
  }

  it.each(['draft', 'submitted', 'approved', 'rejected'])(
    'scrubs bankingDetails on an unpaid record (status=%s)',
    (status) => {
      const plan = buildErasurePlan(
        inputs({ referencingDocs: [travelSupport(status)] }),
      )
      const patch = plan.documentPatches.find((p) => p.id === `ts-${status}`)
      expect(patch?.unset).toEqual(['bankingDetails'])
      expect(plan.retainedBanking).toEqual([])
    },
  )

  it('RETAINS bankingDetails on a PAID record — statutory accounting evidence', () => {
    const plan = buildErasurePlan(
      inputs({ referencingDocs: [travelSupport('paid')] }),
    )
    expect(plan.documentPatches.find((p) => p.id === 'ts-paid')).toBeUndefined()
    expect(plan.retainedBanking).toEqual([
      { id: 'ts-paid', status: 'paid', reason: 'paid' },
    ])
  })

  it('RETAINS on a MISSING status — fails closed rather than guessing', () => {
    const plan = buildErasurePlan(
      inputs({ referencingDocs: [travelSupport('')] }),
    )
    expect(plan.documentPatches).toEqual([])
    expect(plan.retainedBanking).toEqual([
      { id: 'ts-missing', status: '(missing)', reason: 'unrecognised-status' },
    ])
  })

  it('RETAINS on an UNKNOWN status — a future status must not read as unpaid', () => {
    const plan = buildErasurePlan(
      inputs({ referencingDocs: [travelSupport('settled')] }),
    )
    expect(plan.documentPatches).toEqual([])
    expect(plan.retainedBanking[0].reason).toBe('unrecognised-status')
  })

  it('reads the status per record — a paid and an unpaid record are treated differently in one run', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [travelSupport('paid'), travelSupport('draft')],
      }),
    )
    expect(plan.documentPatches.map((p) => p.id)).toEqual(['ts-draft'])
    expect(plan.retainedBanking.map((r) => r.id)).toEqual(['ts-paid'])
  })

  it('ignores a record the subject merely REVIEWED — that is an organizer audit ref', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'ts-other',
            _type: 'travelSupport',
            _rev: 'r1',
            speaker: ref('someone-else'),
            reviewedBy: ref(SPEAKER),
            status: 'draft',
            bankingDetails: { beneficiaryName: 'x' },
          },
        ],
      }),
    )
    expect(plan.documentPatches).toEqual([])
    expect(plan.retainedBanking).toEqual([])
  })

  it('stages nothing when an unpaid record has no bankingDetails at all', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          { ...travelSupport('draft'), bankingDetails: undefined },
        ],
      }),
    )
    expect(plan.documentPatches).toEqual([])
  })
})

describe('the dependent sweep', () => {
  it('deletes the subject’s notifications but NOT one where they are only the actor', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          { _id: 'n-mine', _type: 'notification', recipient: ref(SPEAKER) },
          {
            _id: 'n-theirs',
            _type: 'notification',
            recipient: ref('someone-else'),
            actor: ref(SPEAKER),
          },
        ],
      }),
    )
    expect(plan.documentDeletes.map((d) => d.id)).toEqual(['n-mine'])
  })

  it('deletes preferences, dashboard configs and reminder logs owned by the subject', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'convpref.c1.' + SPEAKER,
            _type: 'conversationPreference',
            speaker: ref(SPEAKER),
          },
          { _id: 'dash-1', _type: 'dashboardConfig', speaker: ref(SPEAKER) },
          {
            _id: 'reminder.x.c1.' + SPEAKER,
            _type: 'scheduledReminderLog',
            speaker: ref(SPEAKER),
          },
          { _id: 'dash-2', _type: 'dashboardConfig', speaker: ref('other') },
        ],
      }),
    )
    expect(plan.documentDeletes.map((d) => d.id).sort()).toEqual(
      ['convpref.c1.' + SPEAKER, 'dash-1', 'reminder.x.c1.' + SPEAKER].sort(),
    )
  })

  it('deletes a co-speaker invitation ADDRESSED to the subject, matched case-insensitively', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'inv-to-me',
            _type: 'coSpeakerInvitation',
            invitedEmail: 'ADA.L@Work.IO',
            invitedBy: ref('other'),
          },
        ],
      }),
    )
    expect(plan.documentDeletes.map((d) => d.id)).toEqual(['inv-to-me'])
  })

  it('leaves an invitation the subject SENT to somebody else', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'inv-from-me',
            _type: 'coSpeakerInvitation',
            invitedEmail: 'stranger@example.org',
            invitedBy: ref(SPEAKER),
          },
        ],
      }),
    )
    expect(plan.documentDeletes).toEqual([])
  })

  it('deletes an UNACCEPTED invitation that holds no reference to the subject at all', () => {
    // The gap `references($speakerId)` cannot see: an invitation that was never
    // accepted points at the INVITER, so the generic reference sweep is blind
    // to it and only the plaintext `invitedEmail` reaches it.
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [],
        emailKeyedDocs: [{ _id: 'inv-pending', _type: 'coSpeakerInvitation' }],
      }),
    )
    expect(plan.documentDeletes.map((d) => d.id)).toEqual(['inv-pending'])
  })

  it('deletes an organizerInvitation addressed to the subject', () => {
    // The SECOND miss of the same class (#880 shipped this type three days
    // before the erasure was written; production count was 0, so nothing else
    // could have caught it). It carries the subject's plaintext address AND a
    // live bearer token gating a magic link to their mailbox.
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [],
        emailKeyedDocs: [{ _id: 'orginv-1', _type: 'organizerInvitation' }],
      }),
    )
    expect(plan.documentDeletes).toEqual([
      {
        id: 'orginv-1',
        type: 'organizerInvitation',
        reason:
          'addressed to the subject by email, with no reference to them ' +
          '(carries their plaintext address and a live bearer token)',
      },
    ])
  })

  it('sweeps both invitation types and a sign-in token in one run', () => {
    const plan = buildErasurePlan(
      inputs({
        emailKeyedDocs: [
          { _id: 'inv-1', _type: 'coSpeakerInvitation' },
          { _id: 'orginv-1', _type: 'organizerInvitation' },
          { _id: 'tok-1', _type: 'emailSignInToken' },
        ],
      }),
    )
    expect(plan.documentDeletes.map((d) => d.type).sort()).toEqual([
      'coSpeakerInvitation',
      'emailSignInToken',
      'organizerInvitation',
    ])
  })

  it('does not delete an accepted invitation twice when both paths find it', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'inv-1',
            _type: 'coSpeakerInvitation',
            invitedEmail: 'ada@example.com',
            invitedBy: ref('other'),
            acceptedSpeaker: ref(SPEAKER),
          },
        ],
        emailKeyedDocs: [{ _id: 'inv-1', _type: 'coSpeakerInvitation' }],
      }),
    )
    expect(plan.documentDeletes.map((d) => d.id)).toEqual(['inv-1'])
  })

  it('deletes sign-in tokens for the subject’s addresses', () => {
    const plan = buildErasurePlan(
      inputs({
        emailKeyedDocs: [{ _id: 'tok-1', _type: 'emailSignInToken' }],
      }),
    )
    expect(plan.documentDeletes.map((d) => d.type)).toContain(
      'emailSignInToken',
    )
  })

  it('unsets the subject’s issued ticket entries and leaves other speakers’ alone', () => {
    const plan = buildErasurePlan(
      inputs({
        ticketTalks: [
          {
            _id: 'talk-1',
            _rev: 'r1',
            issuedSpeakerTickets: [
              { _key: 'speaker-ticket-x', speakerId: SPEAKER },
              { _key: 'speaker-ticket-y', speakerId: 'other' },
            ],
          },
        ],
      }),
    )
    expect(plan.documentPatches[0].unset).toEqual([
      'issuedSpeakerTickets[_key=="speaker-ticket-x"]',
    ])
  })

  it('matches a ticket entry by EMAIL when the speakerId no longer matches', () => {
    const plan = buildErasurePlan(
      inputs({
        ticketTalks: [
          {
            _id: 'talk-1',
            _rev: 'r1',
            issuedSpeakerTickets: [
              {
                _key: 'speaker-ticket-legacy',
                speakerId: 'a-merged-away-id',
                email: 'Ada@example.com',
              },
            ],
          },
        ],
      }),
    )
    expect(plan.documentPatches[0].unset).toEqual([
      'issuedSpeakerTickets[_key=="speaker-ticket-legacy"]',
    ])
  })

  it('untags the subject from a gallery image and leaves a re-tag tombstone', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'img-1',
            _type: 'imageGallery',
            _rev: 'r1',
            speakers: [ref(SPEAKER, 'speaker-' + SPEAKER), ref('other', 'k2')],
          },
        ],
      }),
    )
    const patch = plan.documentPatches[0]
    expect(patch.unset).toEqual([`speakers[_key=="speaker-${SPEAKER}"]`])
    expect(patch.append?.path).toBe('untaggedSpeakers')
    expect(patch.append?.items).toEqual([
      { _type: 'reference', _ref: SPEAKER, _key: `untagged-${SPEAKER}` },
    ])
  })

  it('does NOT delete the photograph — only a patch is staged for the image', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          {
            _id: 'img-1',
            _type: 'imageGallery',
            _rev: 'r1',
            speakers: [ref(SPEAKER, 'k1')],
          },
        ],
      }),
    )
    expect(plan.documentDeletes.map((d) => d.id)).not.toContain('img-1')
  })

  it('surfaces the profile image ASSET id so the CDN copy can be deleted', () => {
    expect(buildErasurePlan(inputs()).imageAssetId).toBe(
      'image-abc-500x500-png',
    )
  })

  it('leaves talks, reviews, messages and badges to anonymise in place', () => {
    const plan = buildErasurePlan(
      inputs({
        referencingDocs: [
          { _id: 'talk-1', _type: 'talk', speakers: [ref(SPEAKER, 'k1')] },
          { _id: 'rev-1', _type: 'review', reviewer: ref(SPEAKER) },
          { _id: 'msg-1', _type: 'message', author: ref(SPEAKER) },
          { _id: 'badge-1', _type: 'speakerBadge', speaker: ref(SPEAKER) },
          {
            _id: 'letter-1',
            _type: 'invitationLetter',
            issuedBy: ref(SPEAKER),
          },
        ],
      }),
    )
    expect(plan.documentPatches).toEqual([])
    expect(plan.documentDeletes).toEqual([])
  })
})

describe('preconditions', () => {
  it('throws when the speaker does not exist', () => {
    expect(() => buildErasurePlan(inputs({ speaker: null }))).toThrow(
      ErasureValidationError,
    )
  })

  it('throws when the id resolves to a different document type', () => {
    expect(() =>
      buildErasurePlan(
        inputs({
          speaker: { _id: SPEAKER, _type: 'talk' } as ErasureSpeakerDoc,
        }),
      ),
    ).toThrow(/not a speaker/)
  })

  it('refuses a draft document', () => {
    expect(() =>
      buildErasurePlan(
        inputs({ speaker: speakerDoc({ _id: 'drafts.' + SPEAKER }) }),
      ),
    ).toThrow(/draft/)
  })

  it('refuses an id with an unexpected shape rather than interpolating it', () => {
    expect(() =>
      buildErasurePlan(
        inputs({ speaker: speakerDoc({ _id: 'evil"]{..}//' }) }),
      ),
    ).toThrow(/unexpected shape/)
  })

  it('refuses when the target slug is already held by ANOTHER speaker', () => {
    const plan = buildErasurePlan(
      inputs({ slugConflictIds: ['some-other-speaker'] }),
    )
    expect(plan.refusals[0]).toContain('already used by some-other-speaker')
  })

  it('does NOT refuse when the target slug is held by the subject (the second run)', () => {
    const plan = buildErasurePlan(inputs({ slugConflictIds: [SPEAKER] }))
    expect(plan.refusals).toEqual([])
  })
})

describe('replace-don’t-unset keeps the null-crash paths alive', () => {
  /**
   * The whole reason `name`/`slug`/`email` are REPLACED rather than unset. Each
   * test first proves the consumer really does throw on the missing value (so it
   * cannot pass vacuously), then feeds it the erased document and shows it does
   * not.
   */

  /** Apply the plan to a copy of the speaker and hand back the result. */
  function erased(): Record<string, unknown> {
    const doc = structuredClone(speakerDoc()) as Record<string, unknown>
    const plan = buildErasurePlan(inputs())
    Object.assign(doc, plan.speakerSetIfMissing, plan.speakerSet)
    for (const path of plan.speakerUnset) {
      const parts = path.split('.')
      let cursor: Record<string, unknown> | undefined = doc
      for (const part of parts.slice(0, -1)) {
        const next: unknown = cursor?.[part]
        cursor =
          next && typeof next === 'object'
            ? (next as Record<string, unknown>)
            : undefined
      }
      if (cursor) delete cursor[parts[parts.length - 1]]
    }
    return doc
  }

  it('formatSpeakerNames throws on a speaker with no name (the path being defended)', async () => {
    const { formatSpeakerNames } = await import('./formatSpeakerNames')
    expect(() =>
      formatSpeakerNames([
        { name: 'Grace' },
        { name: undefined },
      ] as unknown as Parameters<typeof formatSpeakerNames>[0]),
    ).toThrow(TypeError)
  })

  it('formatSpeakerNames renders the ERASED speaker without throwing', async () => {
    const { formatSpeakerNames } = await import('./formatSpeakerNames')
    const out = formatSpeakerNames([
      erased(),
      { name: 'Grace Hopper' },
    ] as unknown as Parameters<typeof formatSpeakerNames>[0])
    expect(out).toBe('Deleted and Grace')
  })

  it('a single erased speaker formats to the placeholder', async () => {
    const { formatSpeakerNames } = await import('./formatSpeakerNames')
    expect(
      formatSpeakerNames([erased()] as unknown as Parameters<
        typeof formatSpeakerNames
      >[0]),
    ).toBe('Deleted speaker')
  })

  it('the admin-table search filter (`speaker.name.toLowerCase()`) survives erasure', () => {
    // Verbatim shape of the expression at SpeakerTable.tsx — it throws on null.
    const search = (s: { name?: string | null }) =>
      (s.name as string).toLowerCase().includes('deleted')

    expect(() => search({ name: null })).toThrow(TypeError)
    expect(search(erased() as { name?: string })).toBe(true)
  })

  it('an unguarded `/speaker/${slug}` link never renders /speaker/undefined', () => {
    const doc = erased() as { slug?: { current?: string } }
    expect(`/speaker/${doc.slug?.current}`).toBe('/speaker/deleted-abcd1234')
    expect(doc.slug?.current).not.toBeUndefined()
  })

  it('email stays a string, so `speaker.email.toLowerCase()` cannot throw', () => {
    const doc = erased() as { email?: string }
    expect(typeof doc.email).toBe('string')
    expect(doc.email?.toLowerCase()).toBe('deleted-abcd1234@anonymous.invalid')
  })
})

describe('the field list is checked against the schema, not the PRD', () => {
  it('every unset path exists in sanity/schemaTypes/speaker.ts', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const schema = readFileSync(
      join(__dirname, '..', '..', '..', 'sanity', 'schemaTypes', 'speaker.ts'),
      'utf8',
    )
    for (const path of ERASURE_UNSET_FIELDS) {
      const top = path.split('.')[0]
      expect(schema, `${top} is not a field on the speaker schema`).toContain(
        `name: '${top}'`,
      )
    }
  })

  it('erasedAt is declared on the schema', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const schema = readFileSync(
      join(__dirname, '..', '..', '..', 'sanity', 'schemaTypes', 'speaker.ts'),
      'utf8',
    )
    expect(schema).toContain("name: 'erasedAt'")
  })

  it('the deterministic values depend only on _id', () => {
    expect(erasedSlug('zzzz9999aaaa')).toBe('deleted-zzzz9999')
    expect(erasedEmail('zzzz9999aaaa')).toBe(
      'deleted-zzzz9999@anonymous.invalid',
    )
    expect(ERASED_SPEAKER_NAME).toBe('Deleted speaker')
  })
})
