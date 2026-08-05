/**
 * @vitest-environment node
 *
 * The server seam that decides which activation rows are the organizer's to
 * complete (#839). The platform-org contract runs FOR REAL (it is pure env);
 * only the ticketing gate and the check registry are stubbed, because those
 * reach Sanity and the filesystem respectively.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const isTicketingEnabledForOrg = vi.fn(async () => true)

vi.mock('@/lib/features/ticketing', () => ({
  isTicketingEnabledForOrg: (...args: unknown[]) =>
    isTicketingEnabledForOrg(...(args as [])),
}))

vi.mock('@/lib/system-status/checks', () => ({
  collectStaticChecks: () => [],
}))

import { resolveActivationChecklist } from './activation-server'
import type { ConferenceForActivationResolution } from './activation-server'

const PLATFORM_ORG_ID = 'org-platform'
const TENANT_ORG_ID = 'org-tenant'

function conference(
  orgId: string | null = TENANT_ORG_ID,
): ConferenceForActivationResolution {
  return {
    title: 'Conf',
    organizer: 'Org',
    ...(orgId ? { organization: { _ref: orgId } } : {}),
  }
}

function row(
  checklist: Awaited<ReturnType<typeof resolveActivationChecklist>>,
  id: string,
) {
  const found = checklist.rows.find((r) => r.id === id)
  if (!found) throw new Error(`no row ${id}`)
  return found
}

beforeEach(() => {
  vi.clearAllMocks()
  isTicketingEnabledForOrg.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveActivationChecklist — the ticketing row', () => {
  it('keeps it required for an entitled org', async () => {
    isTicketingEnabledForOrg.mockResolvedValue(true)
    const checklist = await resolveActivationChecklist(conference())
    expect(row(checklist, 'ticketing').unavailable).toBeUndefined()
  })

  it('demotes it for an org without the entitlement', async () => {
    isTicketingEnabledForOrg.mockResolvedValue(false)
    const checklist = await resolveActivationChecklist(conference())
    expect(row(checklist, 'ticketing').unavailable).toBe('Not on your plan')
  })

  it('asks the SAME gate the nav and the ticket pages ask', async () => {
    // If this drifts, the checklist can demand a section the shell has hidden.
    await resolveActivationChecklist(conference())
    expect(isTicketingEnabledForOrg).toHaveBeenCalledWith(TENANT_ORG_ID)
  })
})

describe('resolveActivationChecklist — the email-delivery row', () => {
  it('stays the organizer’s job on a single-tenant deployment', async () => {
    // No PLATFORM_ORG_ID: nobody sits above this organizer, so RESEND_API_KEY
    // really is theirs to set and the row stays a real requirement.
    vi.stubEnv('PLATFORM_ORG_ID', '')
    const checklist = await resolveActivationChecklist(conference())
    expect(row(checklist, 'email-delivery').unavailable).toBeUndefined()
    expect(row(checklist, 'email-delivery').hint).toMatch(/Resend API key/i)
  })

  it('stays the organizer’s job for the platform org itself', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
    const checklist = await resolveActivationChecklist(
      conference(PLATFORM_ORG_ID),
    )
    expect(row(checklist, 'email-delivery').unavailable).toBeUndefined()
  })

  it('becomes platform-managed for a shared-tier tenant', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
    const checklist = await resolveActivationChecklist(conference())
    const emailRow = row(checklist, 'email-delivery')
    expect(emailRow.unavailable).toBe('Platform-managed')
    expect(emailRow.hint).not.toMatch(/Resend API key/i)
  })

  it('does not block a shared-tier tenant from going live', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
    const checklist = await resolveActivationChecklist(conference())
    const outstanding = checklist.rows
      .filter((r) => !r.done && !r.optional && !r.unavailable)
      .map((r) => r.id)
    expect(outstanding).not.toContain('email-delivery')
  })
})

describe('resolveActivationChecklist — supplied checks', () => {
  it('reuses an already-built check list rather than collecting a second', async () => {
    // The settings page has the full `buildSystemChecks` result in hand; the
    // resolver must not re-derive email/Slack state beside it.
    vi.stubEnv('PLATFORM_ORG_ID', '')
    const checklist = await resolveActivationChecklist(conference(), [
      {
        id: 'email.resendKey',
        group: 'email',
        label: 'RESEND_API_KEY',
        status: 'ok',
      },
    ])
    expect(row(checklist, 'email-delivery').done).toBe(true)
  })
})
