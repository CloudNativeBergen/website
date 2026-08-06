/**
 * @vitest-environment node
 *
 * CROSS-TENANT WRITE ISOLATION, part two (#730) — the routers beyond the five
 * named in the issue, found by sweeping for the same shape.
 *
 * - `registration.generateToken` is the worst of them: it MINTS a bearer token
 *   for the sponsor portal from a client-supplied id, so an unguarded call gave
 *   an organizer of tenant A full read/write of tenant B's sponsor record
 *   through the public portal endpoints.
 * - `registration.sendPortalInvite` patched a foreign sponsor record and emailed
 *   that sponsor's contacts.
 * - the `workshop.admin.*` signup mutations passed `signupIds` to a helper that
 *   only constrains the conference when the filter is PASSED, and
 *   `deleteSignup` / `updateCapacity` did no lookup at all.
 * - the `volunteer.admin.*` mutations looked the id up with
 *   `*[_type == "volunteer" && _id == $id][0]` — an EXISTENCE check wearing an
 *   ownership check's clothes.
 *
 * Each test asserts the refusal AND that no write reached the data layer.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  /** The tenant the ownership probe reports, or null for "no such document". */
  tenant: null as Record<string, unknown> | null,
  /** How many of a bulk request's ids the scoped count reports as ours. */
  ownedCount: 0,
  writes: [] as string[],
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))

vi.mock('@/lib/sanity/client', () => {
  const fetch = async (query: string) => {
    if (query.includes('"memberOrgIds"')) return h.tenant
    if (query.startsWith('count(')) return h.ownedCount
    return null
  }
  const patchChain = (id: string) => {
    h.writes.push(`patch:${id}`)
    const chain = {
      set: () => chain,
      unset: () => chain,
      commit: async () => ({ _id: id }),
    }
    return chain
  }
  const client = {
    fetch,
    patch: patchChain,
    delete: async (id: string) => {
      h.writes.push(`delete:${id}`)
      return { results: [] }
    },
    create: async () => ({ _id: 'new' }),
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

// --- registration -----------------------------------------------------------
const reg = vi.hoisted(() => ({
  generateRegistrationToken: vi.fn(),
  getSfcForPortalInvite: vi.fn(),
}))
vi.mock('@/lib/sponsor-crm/registration', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  generateRegistrationToken: reg.generateRegistrationToken,
  getSfcForPortalInvite: reg.getSfcForPortalInvite,
}))
vi.mock('@/lib/sponsor-crm/activity', () => ({
  logRegistrationComplete: vi.fn(),
  logEmailSent: vi.fn(),
  logContractStatusChange: vi.fn(),
}))

// --- workshop ---------------------------------------------------------------
const ws = vi.hoisted(() => ({
  getAllWorkshopSignups: vi.fn(),
  confirmWorkshopSignup: vi.fn(),
  cancelWorkshopSignup: vi.fn(),
  deleteWorkshopSignup: vi.fn(),
  updateWorkshopCapacity: vi.fn(),
  verifyWorkshopBelongsToConference: vi.fn(),
  checkWorkshopCapacity: vi.fn(),
  getWorkshopSignupsByWorkshop: vi.fn(),
}))
// The workshop admin surface is additionally gated on the `workshops` feature
// (#689). That gate is a FEATURE decision and has its own tests; these cases are
// about TENANCY, so grant it — otherwise every case below would stop at
// FORBIDDEN and assert nothing about scoping.
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForOrg: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/lib/workshop/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getAllWorkshopSignups: ws.getAllWorkshopSignups,
  confirmWorkshopSignup: ws.confirmWorkshopSignup,
  cancelWorkshopSignup: ws.cancelWorkshopSignup,
  deleteWorkshopSignup: ws.deleteWorkshopSignup,
  updateWorkshopCapacity: ws.updateWorkshopCapacity,
  verifyWorkshopBelongsToConference: ws.verifyWorkshopBelongsToConference,
  checkWorkshopCapacity: ws.checkWorkshopCapacity,
  getWorkshopSignupsByWorkshop: ws.getWorkshopSignupsByWorkshop,
}))

// --- volunteer --------------------------------------------------------------
const vol = vi.hoisted(() => ({
  getVolunteerById: vi.fn(),
  updateVolunteerStatus: vi.fn(),
  updateVolunteerDetails: vi.fn(),
  deleteVolunteer: vi.fn(),
  sendVolunteerApprovalEmail: vi.fn(),
}))
vi.mock('@/lib/email/volunteer', () => ({
  sendVolunteerApprovalEmail: vol.sendVolunteerApprovalEmail,
}))
vi.mock('@/lib/volunteer/sanity', () => ({
  getVolunteersByConference: vi.fn(),
  getVolunteerById: vol.getVolunteerById,
  updateVolunteerStatus: vol.updateVolunteerStatus,
  updateVolunteerDetails: vol.updateVolunteerDetails,
  deleteVolunteer: vol.deleteVolunteer,
  createVolunteer: vi.fn(),
}))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn(),
  getOrganizerSpeakerIds: vi.fn().mockResolvedValue([]),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { registrationRouter } from './registration'
import { workshopRouter } from './workshop'
import { volunteerRouter } from './volunteer'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const registration = () => t.createCallerFactory(registrationRouter)(ctx())
const workshop = () => t.createCallerFactory(workshopRouter)(ctx())
const volunteer = () => t.createCallerFactory(volunteerRouter)(ctx())

/** The probe reports the target as belonging to ANOTHER conference. */
function foreign(type: string) {
  h.tenant = {
    _type: type,
    orgId: 'org-B',
    conferenceId: 'conf-OTHER',
    conferenceOrgId: 'org-B',
    memberOrgIds: [],
  }
}
/** The probe reports the target as ours. */
function owned(type: string) {
  h.tenant = {
    _type: type,
    orgId: ORG_A,
    conferenceId: CONF_A,
    conferenceOrgId: ORG_A,
    memberOrgIds: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.writes.length = 0
  h.tenant = null
  h.ownedCount = 0
  h.getConference.mockResolvedValue({
    conference: { _id: CONF_A, organization: { _ref: ORG_A } },
    domain: 'localhost',
    error: null,
  })
  reg.generateRegistrationToken.mockResolvedValue({ token: 'tok' })
  reg.getSfcForPortalInvite.mockResolvedValue({
    _id: 'sfc-B',
    conference: { title: 'B' },
    contactPersons: [],
  })
  ws.getAllWorkshopSignups.mockResolvedValue([])
  ws.confirmWorkshopSignup.mockResolvedValue(undefined)
  ws.cancelWorkshopSignup.mockResolvedValue(undefined)
  ws.deleteWorkshopSignup.mockResolvedValue(undefined)
  ws.updateWorkshopCapacity.mockResolvedValue({ _id: 'w-1' })
  ws.verifyWorkshopBelongsToConference.mockResolvedValue(false)
  ws.checkWorkshopCapacity.mockResolvedValue({ capacity: 10, signups: 0 })
  ws.getWorkshopSignupsByWorkshop.mockResolvedValue([])
  vol.getVolunteerById.mockResolvedValue({
    volunteer: { _id: 'vol-B', name: 'X' },
    error: null,
  })
  vol.updateVolunteerStatus.mockResolvedValue({ success: true, error: null })
  vol.updateVolunteerDetails.mockResolvedValue({ success: true, error: null })
  vol.deleteVolunteer.mockResolvedValue({ success: true, error: null })
  vol.sendVolunteerApprovalEmail.mockResolvedValue({
    data: { emailId: 'email-1' },
    error: null,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('registration: a sponsor-portal token is never minted for another tenant (#730)', () => {
  it('generateToken refuses a foreign sponsorForConference, and mints nothing', async () => {
    foreign('sponsorForConference')
    await expect(
      registration().generateToken({ sponsorForConferenceId: 'sfc-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(reg.generateRegistrationToken).not.toHaveBeenCalled()
  })

  it('generateToken refuses a wrong-typed id', async () => {
    h.tenant = { _type: 'conference', conferenceId: CONF_A }
    await expect(
      registration().generateToken({ sponsorForConferenceId: CONF_A }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(reg.generateRegistrationToken).not.toHaveBeenCalled()
  })

  it('generateToken still works for our own sponsor record', async () => {
    owned('sponsorForConference')
    await expect(
      registration().generateToken({ sponsorForConferenceId: 'sfc-A' }),
    ).resolves.toMatchObject({ token: 'tok' })
    expect(reg.generateRegistrationToken).toHaveBeenCalledWith('sfc-A')
  })

  it('sendPortalInvite refuses a foreign record — nothing patched, nothing emailed', async () => {
    foreign('sponsorForConference')
    await expect(
      registration().sendPortalInvite({ sponsorForConferenceId: 'sfc-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(reg.getSfcForPortalInvite).not.toHaveBeenCalled()
    expect(h.writes).toEqual([])
  })
})

describe('workshop admin signup mutations are conference-scoped (#730)', () => {
  it('confirmSignup passes the conference to the lookup, so a foreign id is NOT_FOUND', async () => {
    await expect(
      workshop().admin.confirmSignup({ signupId: 'sg-B', sendEmail: false }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(ws.getAllWorkshopSignups).toHaveBeenCalledWith(
      expect.objectContaining({ conferenceId: CONF_A, signupIds: ['sg-B'] }),
    )
    expect(ws.confirmWorkshopSignup).not.toHaveBeenCalled()
  })

  /**
   * #731 F3. Filtering alone is not enough: the scoped lookup silently DROPPED
   * foreign ids and still reported `success: true` (and, with the default page
   * size, quietly dropped everything past the 50th id). The batch is now
   * all-or-nothing, like `requireDocumentsInCurrentConference`.
   */
  it('batchConfirmSignups refuses the WHOLE batch when an id is not ours', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([{ _id: 'sg-A' }])
    await expect(
      workshop().admin.batchConfirmSignups({
        signupIds: ['sg-A', 'sg-B'],
        sendEmails: false,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(ws.getAllWorkshopSignups).toHaveBeenCalledWith(
      expect.objectContaining({ conferenceId: CONF_A }),
    )
    expect(ws.confirmWorkshopSignup).not.toHaveBeenCalled()
  })

  it('batchConfirmSignups asks for a page big enough to hold the whole batch', async () => {
    // A batch larger than the default page size must not silently truncate.
    const ids = Array.from({ length: 60 }, (_, i) => `sg-${i}`)
    ws.getAllWorkshopSignups.mockResolvedValue(ids.map((_id) => ({ _id })))
    await workshop().admin.batchConfirmSignups({
      signupIds: ids,
      sendEmails: false,
    })
    expect(ws.getAllWorkshopSignups).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 60 }),
    )
    expect(ws.confirmWorkshopSignup).toHaveBeenCalledTimes(60)
  })

  it('batchConfirmSignups confirms when every id is ours', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([
      { _id: 'sg-A' },
      { _id: 'sg-B' },
    ])
    await workshop().admin.batchConfirmSignups({
      signupIds: ['sg-A', 'sg-B'],
      sendEmails: false,
    })
    expect(ws.confirmWorkshopSignup).toHaveBeenCalledTimes(2)
  })

  it('listSignups scopes the lookup to the request conference', async () => {
    // #731 F3: the helper had NO tenant predicate, so any workshop id read that
    // tenant's signup list — attendee names and email addresses included.
    await workshop().admin.listSignups({ workshopId: 'w-B' })
    expect(ws.getWorkshopSignupsByWorkshop).toHaveBeenCalledWith(
      'w-B',
      CONF_A,
      undefined,
    )
  })

  it('batchCancelSignups refuses the WHOLE batch when an id is not ours', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([{ _id: 'sg-A' }])
    await expect(
      workshop().admin.batchCancelSignups({ signupIds: ['sg-A', 'sg-B'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(ws.cancelWorkshopSignup).not.toHaveBeenCalled()
  })

  it('batchCancelSignups cancels when every id is ours', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([
      { _id: 'sg-A' },
      { _id: 'sg-B' },
    ])
    await workshop().admin.batchCancelSignups({ signupIds: ['sg-A', 'sg-B'] })
    expect(ws.cancelWorkshopSignup).toHaveBeenCalledTimes(2)
  })

  it('deleteSignup refuses a foreign signup id', async () => {
    foreign('workshopSignup')
    await expect(
      workshop().admin.deleteSignup({ signupId: 'sg-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(ws.deleteWorkshopSignup).not.toHaveBeenCalled()
  })

  it('deleteSignup deletes our own signup', async () => {
    owned('workshopSignup')
    await expect(
      workshop().admin.deleteSignup({ signupId: 'sg-A' }),
    ).resolves.toMatchObject({ success: true })
    expect(ws.deleteWorkshopSignup).toHaveBeenCalledWith('sg-A')
  })

  it('updateCapacity refuses a workshop outside the conference', async () => {
    await expect(
      workshop().admin.updateCapacity({ workshopId: 'w-B', capacity: 50 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(ws.updateWorkshopCapacity).not.toHaveBeenCalled()
  })

  it('updateCapacity still works for a workshop in the conference', async () => {
    ws.verifyWorkshopBelongsToConference.mockResolvedValue(true)
    await workshop().admin.updateCapacity({ workshopId: 'w-A', capacity: 50 })
    expect(ws.updateWorkshopCapacity).toHaveBeenCalledWith('w-A', 50)
  })
})

describe('volunteer mutations are conference-scoped (#730)', () => {
  it('updateStatus refuses another conference’s volunteer', async () => {
    foreign('volunteer')
    await expect(
      volunteer().admin.updateStatus({
        volunteerId: 'vol-B',
        status: 'approved',
      } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(vol.updateVolunteerStatus).not.toHaveBeenCalled()
  })

  it('update refuses another conference’s volunteer', async () => {
    foreign('volunteer')
    await expect(
      volunteer().admin.update({
        volunteerId: 'vol-B',
        name: 'X',
        email: 'x@example.com',
        phone: '+4712345678',
        occupation: 'working',
      } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(vol.updateVolunteerDetails).not.toHaveBeenCalled()
  })

  it('delete refuses another conference’s volunteer', async () => {
    foreign('volunteer')
    await expect(
      volunteer().admin.delete({ volunteerId: 'vol-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(vol.deleteVolunteer).not.toHaveBeenCalled()
  })

  it('getById refuses another conference’s volunteer (contact details)', async () => {
    foreign('volunteer')
    await expect(
      volunteer().admin.getById({ id: 'vol-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(vol.getVolunteerById).not.toHaveBeenCalled()
  })

  it('our own volunteer still updates and deletes', async () => {
    owned('volunteer')
    await expect(
      volunteer().admin.delete({ volunteerId: 'vol-A' }),
    ).resolves.toBeTruthy()
    expect(vol.deleteVolunteer).toHaveBeenCalledWith('vol-A')
  })
})

/**
 * `sendEmail` was the ONE volunteer procedure the #730 sweep skipped (#858) —
 * its four siblings above all carry the guard.
 *
 * Every case here hands the procedure a volunteer that would otherwise sail
 * through: APPROVED (so the status check cannot be what refuses) and carrying a
 * complete conference (so the conference lookup cannot be what refuses). The
 * refusal asserted is therefore the guard's own MESSAGE, not merely its code —
 * `NOT_FOUND` alone is ambiguous here, because 'Volunteer not found' and the
 * authz waist both use it. Only `requireDocumentInCurrentConference` says
 * "No volunteer with that id for this request".
 */
describe('volunteer.sendEmail is conference-scoped (#858)', () => {
  const GUARD_REFUSAL = 'No volunteer with that id for this request'

  /** A volunteer that nothing BUT the ownership guard could refuse. */
  function approvedVolunteer(conference: Record<string, unknown> | null) {
    vol.getVolunteerById.mockResolvedValue({
      volunteer: {
        _id: 'vol-B',
        name: 'Foreign Volunteer',
        email: 'foreign@example.com',
        status: 'approved',
        conference,
      },
      error: null,
    })
  }

  const send = () =>
    volunteer().admin.sendEmail({
      volunteerId: 'vol-B',
      subject: 'Hello',
      message: 'You are in',
    })

  it('refuses another tenant’s volunteer, reads nothing and sends nothing', async () => {
    foreign('volunteer')
    approvedVolunteer({
      _id: 'conf-OTHER',
      title: 'Their Conference',
      contactEmail: 'them@example.com',
    })
    await expect(send()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: GUARD_REFUSAL,
    })
    // The guard runs BEFORE the lookup, so the foreign volunteer's name and
    // email address never enter this request at all.
    expect(vol.getVolunteerById).not.toHaveBeenCalled()
    expect(vol.sendVolunteerApprovalEmail).not.toHaveBeenCalled()
  })

  it('refuses ANOTHER EDITION OF OUR OWN ORG — the boundary is the conference', async () => {
    // Same organization, different conference. An org-level guard would admit
    // this; only the conference-level one refuses it. This is the case that
    // produced the identity hybrid without needing a second tenant at all.
    h.tenant = {
      _type: 'volunteer',
      orgId: ORG_A,
      conferenceId: 'conf-A-2024',
      conferenceOrgId: ORG_A,
      memberOrgIds: [],
    }
    approvedVolunteer({
      _id: 'conf-A-2024',
      title: 'Our 2024 Edition',
      contactEmail: 'hello@example.com',
    })
    await expect(send()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: GUARD_REFUSAL,
    })
    expect(vol.sendVolunteerApprovalEmail).not.toHaveBeenCalled()
  })

  it('refuses on the exact input that used to build the identity hybrid', async () => {
    // A foreign volunteer whose conference has NO `contactEmail` is what took
    // the `currentConf` rebuild branch: conference A's `_id`/`title` paired with
    // the request domain's venue, dates, reply address and links. The guard
    // makes that branch unreachable with mismatched conferences.
    foreign('volunteer')
    approvedVolunteer({ _id: 'conf-OTHER', title: 'Their Conference' })
    h.getConference.mockResolvedValue({
      conference: {
        _id: CONF_A,
        title: 'Our Conference',
        organization: { _ref: ORG_A },
        contactEmail: 'us@example.com',
        city: 'Bergen',
        country: 'Norway',
      },
      domain: 'localhost',
      error: null,
    })
    await expect(send()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: GUARD_REFUSAL,
    })
    expect(vol.sendVolunteerApprovalEmail).not.toHaveBeenCalled()
  })

  it('still emails OUR OWN volunteer — the guard is not a blanket deny', async () => {
    owned('volunteer')
    approvedVolunteer({
      _id: CONF_A,
      title: 'Our Conference',
      contactEmail: 'us@example.com',
    })
    await expect(send()).resolves.toMatchObject({
      success: true,
      emailId: 'email-1',
    })
    expect(vol.sendVolunteerApprovalEmail).toHaveBeenCalledTimes(1)
  })

  it('the rebuild branch, now that it can only fire in-conference, agrees with itself', async () => {
    // Our own volunteer, our own conference, but no `contactEmail` on it — so
    // the rebuild still runs. With the guard, both sides are the SAME document,
    // so the email's identity and its venue/reply address cannot disagree.
    owned('volunteer')
    approvedVolunteer({ _id: CONF_A, title: 'Our Conference' })
    h.getConference.mockResolvedValue({
      conference: {
        _id: CONF_A,
        title: 'Our Conference',
        organization: { _ref: ORG_A },
        contactEmail: 'us@example.com',
        city: 'Bergen',
        country: 'Norway',
      },
      domain: 'localhost',
      error: null,
    })
    await expect(send()).resolves.toMatchObject({ success: true })
    const conferenceForEmail = vol.sendVolunteerApprovalEmail.mock.calls[0][1]
    expect(conferenceForEmail).toMatchObject({
      _id: CONF_A,
      title: 'Our Conference',
      contactEmail: 'us@example.com',
      city: 'Bergen',
      country: 'Norway',
    })
  })
})

/**
 * SURFACE TRIPWIRE for the volunteer router, the mechanism that would have
 * caught #858 four months earlier. `tenancy.writes.test.ts` pins `topic`,
 * `staff` and `speaker` this way; volunteer had no such pin, so `sendEmail`
 * could sit unguarded next to four guarded siblings without anything noticing.
 * Adding a procedure here forces an explicit decision about its ownership guard.
 */
describe('the volunteer procedure surface is pinned (#858)', () => {
  it('lists every procedure that takes a client-supplied id', () => {
    const procedures = (
      volunteerRouter as unknown as {
        _def: { procedures: Record<string, unknown> }
      }
    )._def.procedures
    expect(Object.keys(procedures).sort()).toEqual([
      'admin.delete',
      'admin.getById',
      'admin.list',
      'admin.sendEmail',
      'admin.update',
      'admin.updateStatus',
      'create',
    ])
  })
})
