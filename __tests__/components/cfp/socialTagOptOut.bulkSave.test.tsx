/**
 * @vitest-environment jsdom
 *
 * #1148 — THE BULK SAVE MUST NOT RESURRECT A WITHDRAWN OPT-OUT.
 *
 * The speaker's checkbox autosaves through a narrow mutation, so it survives a
 * Save Draft that never writes the speaker. That fix is not enough on its own:
 * all three parents keep a `speakerData`/`speaker` object that was seeded from
 * the loaded profile and MERGE the form's partial updates into it, then submit
 * the whole thing. So a value the form carefully declines to emit is still
 * sitting in the parent's state, and the bulk mutation sends it anyway.
 *
 * The sequence that matters, and the reason this is not cosmetic: load an
 * opted-out profile, untick the box, watch it save, then press Update Profile —
 * and the opt-out comes back. "Only the speaker can clear it" becomes "nobody
 * can."
 *
 * WHAT THESE ASSERT: the VALUE a server would be left holding, not the shape of
 * a payload and not an absence. The fake store below parses every bulk payload
 * with the REAL `SpeakerInputSchema`/`SpeakerUpdateSchema` and then applies the
 * REAL writer rule, so a test goes green only because the server genuinely
 * ignores the stale field — never because a client happened not to send it.
 *
 * These drive the REAL parent components. Every earlier story passed
 * `setSpeaker: fn()`, a no-op, which is precisely why the last regression of
 * this class reached main.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Speaker } from '@/lib/speaker/types'
import {
  SpeakerInputSchema,
  SpeakerUpdateSchema,
} from '@/server/schemas/speaker'
import { resolveSocialTagOptOut } from '@/lib/speaker/socialTag'

/** What Sanity would hold for our speaker. */
const store: { socialTagOptOut?: boolean; socialTagOptOutAt?: string } = {}

const h = vi.hoisted(() => ({
  bulkPayloads: [] as unknown[],
  adminPayloads: [] as unknown[],
}))

/**
 * Apply a SELF bulk profile save the way the server would: through the real
 * input schema, then the real writer rule.
 */
function applySelfBulk(payload: unknown) {
  const parsed = SpeakerInputSchema.parse(payload) as {
    socialTagOptOut?: boolean
  }
  if (typeof parsed.socialTagOptOut !== 'boolean') return // no opinion
  const patch = resolveSocialTagOptOut({
    actor: 'self',
    requested: parsed.socialTagOptOut,
    stored: store.socialTagOptOut === true,
    now: '2026-09-22T12:00:00.000Z',
  })
  applyPatch(patch)
}

/** The same for an ORGANIZER save, through the admin schema. */
function applyAdminBulk(payload: unknown) {
  const parsed = SpeakerUpdateSchema.parse(payload) as {
    socialTagOptOut?: boolean
  }
  if (typeof parsed.socialTagOptOut !== 'boolean') return
  const patch = resolveSocialTagOptOut({
    actor: 'organizer',
    requested: parsed.socialTagOptOut,
    stored: store.socialTagOptOut === true,
    now: '2026-09-22T12:00:00.000Z',
  })
  applyPatch(patch)
}

function applyPatch(patch: {
  set: { socialTagOptOut?: boolean }
  setIfMissing: { socialTagOptOutAt?: string }
  unset: string[]
}) {
  if (patch.set.socialTagOptOut !== undefined) {
    store.socialTagOptOut = patch.set.socialTagOptOut
  }
  if (
    patch.setIfMissing.socialTagOptOutAt !== undefined &&
    store.socialTagOptOutAt === undefined
  ) {
    store.socialTagOptOutAt = patch.setIfMissing.socialTagOptOutAt
  }
  for (const key of patch.unset) {
    delete store[key as 'socialTagOptOut' | 'socialTagOptOutAt']
  }
}

const OPTED_OUT_SPEAKER = {
  _id: 'sp-1',
  name: 'Kari Nordmann',
  email: 'kari@example.com',
  bio: 'Speaks about things.',
  title: 'Engineer',
  links: ['https://bsky.app/profile/kari.dev'],
  socialTagOptOut: true,
  socialTagOptOutAt: '2026-01-01T00:00:00.000Z',
  // The admin editor validates with `requireConsent`, so a fixture without
  // these never reaches the mutation and the organizer case would pass for an
  // entirely unrelated reason.
  consent: {
    dataProcessing: { granted: true, grantedAt: '2026-01-01T00:00:00.000Z' },
    publicProfile: { granted: true, grantedAt: '2026-01-01T00:00:00.000Z' },
  },
} as unknown as Speaker

vi.mock('@/lib/trpc/client', () => {
  const noopMutation = () => ({ isPending: false, mutate: vi.fn() })
  return {
    api: {
      proposal: {
        create: { useMutation: noopMutation },
        update: { useMutation: noopMutation },
        action: { useMutation: noopMutation },
        removeCoSpeaker: { useMutation: noopMutation },
      },
      useUtils: () => ({
        tickets: { admin: { speakerTicketStatus: { invalidate: vi.fn() } } },
      }),
      speaker: {
        getCurrent: {
          useQuery: () => ({
            data: OPTED_OUT_SPEAKER,
            error: null,
            refetch: vi.fn(),
          }),
        },
        getEmails: { useQuery: () => ({ data: [] }) },
        updateEmail: { useMutation: noopMutation },
        setMessagingEmailDefault: { useMutation: noopMutation },
        update: {
          useMutation: () => ({
            isPending: false,
            mutate: (input: unknown) => {
              h.bulkPayloads.push(input)
              applySelfBulk(input)
            },
            mutateAsync: async (input: unknown) => {
              h.bulkPayloads.push(input)
              applySelfBulk(input)
              return OPTED_OUT_SPEAKER
            },
          }),
        },
        setSocialTagOptOut: {
          useMutation: () => ({
            isPending: false,
            mutateAsync: async (input: { socialTagOptOut: boolean }) => {
              // The narrow endpoint, applied exactly as the router does.
              applyPatch(
                resolveSocialTagOptOut({
                  actor: 'self',
                  requested: input.socialTagOptOut,
                  stored: store.socialTagOptOut === true,
                  now: '2026-09-22T12:00:00.000Z',
                }),
              )
              return { socialTagOptOut: input.socialTagOptOut }
            },
          }),
        },
        admin: {
          create: { useMutation: noopMutation },
          updateEmail: { useMutation: noopMutation },
          update: {
            useMutation: () => ({
              isPending: false,
              mutate: (input: { id: string; data: unknown }) => {
                h.adminPayloads.push(input.data)
                applyAdminBulk(input.data)
              },
            }),
          },
        },
      },
    },
  }
})

vi.mock('@/components/pwa', () => ({ PushNotificationSettings: () => null }))
// Heavy siblings with their own tRPC surfaces; irrelevant to the opt-out.
vi.mock('@/components/cfp/ProposalCoSpeaker', () => ({
  ProposalCoSpeaker: () => null,
}))
vi.mock('@/components/cfp/LinkedProviders', () => ({
  LinkedProviders: () => null,
}))
vi.mock('@/hooks/useSpeakerImageUpload', () => ({
  useSpeakerImageUpload: () => ({
    uploadImage: vi.fn(),
    isUploading: false,
    error: null,
  }),
}))
vi.mock('@/app/(cfp)/cfp/profile/link-actions', () => ({
  startProviderLink: vi.fn(),
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ update: vi.fn() }) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/cfp/proposal',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<object>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import { CFPProfilePage } from '@/components/cfp/CFPProfilePage'
import { SpeakerManagementModal } from '@/components/admin/SpeakerManagementModal'
import { ProposalForm } from '@/components/cfp/ProposalForm'
import { Status } from '@/lib/proposal/types'

const optOutBox = () =>
  screen.getByRole('checkbox', { name: /don.t tag me in social posts/i })

beforeEach(() => {
  h.bulkPayloads = []
  h.adminPayloads = []
  store.socialTagOptOut = true
  store.socialTagOptOutAt = '2026-01-01T00:00:00.000Z'
})

describe('the speaker withdraws, then saves their profile (#1148)', () => {
  it('leaves the opt-out WITHDRAWN — the bulk save must not resurrect it', async () => {
    render(<CFPProfilePage initialSpeaker={OPTED_OUT_SPEAKER} />)

    // It is on, as the server holds it.
    await waitFor(() => expect(optOutBox()).toBeChecked())

    // Untick: the narrow mutation clears it.
    fireEvent.click(optOutBox())
    await waitFor(() => expect(store.socialTagOptOut).toBeUndefined())

    // Now press the distant bulk button, as anyone editing their bio would.
    fireEvent.click(screen.getByRole('button', { name: /update profile/i }))
    await waitFor(() => expect(h.bulkPayloads.length).toBeGreaterThan(0))

    // THE VALUE. Before the fix the parent's retained `true` rode this payload
    // and the withdrawal was undone with a success message on screen.
    // Asserted DIRECTLY, not through `waitFor`: the fake server applies
    // synchronously, and a `waitFor` would pass on its first tick whether or
    // not the write had happened.
    expect(store.socialTagOptOut).toBeUndefined()
  })

  it('and the box still reads as withdrawn afterwards', async () => {
    render(<CFPProfilePage initialSpeaker={OPTED_OUT_SPEAKER} />)

    await waitFor(() => expect(optOutBox()).toBeChecked())
    fireEvent.click(optOutBox())
    fireEvent.click(screen.getByRole('button', { name: /update profile/i }))

    await waitFor(() => expect(optOutBox()).not.toBeChecked())
  })
})

describe('the speaker withdraws, then SUBMITS a proposal (#1148)', () => {
  it('leaves the opt-out WITHDRAWN — the proposal’s speaker save must not resurrect it', async () => {
    render(
      <ProposalForm
        initialProposal={
          {
            title: 'A talk',
            description: [],
            format: 'presentation_25',
            language: 'en',
            level: 'intermediate',
            audiences: [],
            topics: [],
            outline: 'x',
            tos: true,
          } as never
        }
        initialSpeaker={OPTED_OUT_SPEAKER as never}
        userEmail="kari@example.com"
        conference={{ _id: 'conf-A', formats: [] } as never}
        currentUserSpeaker={OPTED_OUT_SPEAKER}
        initialStatus={Status.draft}
      />,
    )

    await waitFor(() => expect(optOutBox()).toBeChecked())
    fireEvent.click(optOutBox())
    await waitFor(() => expect(store.socialTagOptOut).toBeUndefined())

    // The proposal's own submit is the only path that writes the speaker here.
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(h.bulkPayloads.length).toBeGreaterThan(0))

    expect(store.socialTagOptOut).toBeUndefined()
  })
})

describe('an untouched ORGANIZER save (#1148)', () => {
  it('does not restore an opt-out withdrawn since the cached row loaded', async () => {
    // The admin list row is hourly-cached and still says `true`…
    render(
      <SpeakerManagementModal
        isOpen
        onClose={vi.fn()}
        editingSpeaker={OPTED_OUT_SPEAKER}
      />,
    )
    // …but the speaker has since withdrawn it.
    store.socialTagOptOut = undefined
    store.socialTagOptOutAt = undefined

    // The organizer fixes a typo in the bio and saves. They never touch the
    // opt-out.
    const bio = screen.getByLabelText(/bio/i)
    fireEvent.change(bio, { target: { value: 'Speaks about things!!' } })
    fireEvent.click(screen.getByRole('button', { name: /update speaker/i }))
    await waitFor(() => expect(h.adminPayloads.length).toBeGreaterThan(0))

    // THE VALUE: the withdrawal stands. An organizer may SET this preference,
    // so a stale `true` would be accepted by the server and silently restore
    // something only the speaker may undo.
    expect(store.socialTagOptOut).toBeUndefined()
  })
})
