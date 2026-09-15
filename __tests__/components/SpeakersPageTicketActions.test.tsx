/**
 * @vitest-environment jsdom
 *
 * Row actions stay held until the ticket-status refetch that FOLLOWS a sweep
 * has landed — not merely until the sweep mutation resolves.
 *
 * In that gap the mutation is done, so a guard keyed on `isPending` alone
 * releases the rows, while `ticketStatusesLoading` (`isPending`, false during a
 * refetch) still renders the pre-sweep answer: a freshly invited speaker reads
 * "Not invited" and their button is live. Clicking it calls the row action,
 * which passes `resend: true`, finds the marker under that speaker's own id,
 * and honours the re-send — a second provider invitation and a second email to
 * someone invited seconds earlier.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

const tableProps: Record<string, unknown>[] = []
const modalProps: Record<string, unknown>[] = []

vi.mock('@/components/admin/SpeakerTable', () => ({
  SpeakerTable: (props: Record<string, unknown>) => {
    tableProps.push(props)
    return <div data-testid="speaker-table" />
  },
}))
vi.mock('@/components/admin/ConfirmationModal', () => ({
  ConfirmationModal: (props: Record<string, unknown>) => {
    modalProps.push(props)
    return null
  },
}))
vi.mock('@/components/admin/SpeakerManagementModal', () => ({
  SpeakerManagementModal: () => null,
}))
vi.mock('@/components/admin/SpeakerActions', () => ({
  SpeakerActions: () => null,
}))
vi.mock('@/components/SpeakerProfilePreview', () => ({ default: () => null }))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const statusQuery = {
  data: { statuses: [] },
  isError: false,
  isPending: false,
  isFetching: false,
}
const sweepMutation = { mutateAsync: vi.fn(), isPending: false }
const previewQuery = {
  data: undefined as unknown,
  isError: false,
  isFetching: false,
}

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      tickets: { admin: { speakerTicketStatus: { invalidate: vi.fn() } } },
    }),
    speaker: {
      admin: {
        sendTicketInvitations: { useMutation: () => sweepMutation },
        sendTicketInvitation: {
          useMutation: () => ({ mutateAsync: vi.fn() }),
        },
        ticketInvitationPreview: { useQuery: () => previewQuery },
      },
    },
    tickets: {
      admin: { speakerTicketStatus: { useQuery: () => statusQuery } },
    },
  },
}))

import { render, cleanup } from '@testing-library/react'
import SpeakersPageClient from '@/components/admin/SpeakersPageClient'
import type { Conference } from '@/lib/conference/types'

afterEach(() => {
  cleanup()
  tableProps.length = 0
  modalProps.length = 0
  statusQuery.isFetching = false
  sweepMutation.isPending = false
  previewQuery.data = undefined
  previewQuery.isError = false
  previewQuery.isFetching = false
})

const FRESH_PREVIEW = {
  conferenceTitle: 'Cloud Native Day 2026',
  toSend: 12,
  alreadyInvited: 3,
  sweptProposals: 15,
  blocked: false,
  hasRegistrationLink: true,
}

function renderPage() {
  render(
    <SpeakersPageClient
      speakers={[]}
      currentConferenceId="conf-1"
      conference={{ title: 'Cloud Native Day 2026' } as Conference}
      stats={{
        totalSpeakers: 0,
        confirmedSpeakers: 0,
        localSpeakers: 0,
        newSpeakers: 0,
        diverseSpeakers: 0,
        speakersNeedingTravel: 0,
      }}
      confirmedSpeakersCount={3}
      conferenceEmail="cfp@example.com"
    />,
  )
  return tableProps.at(-1)!
}

/** The confirmation's props on the latest render. */
function confirmation() {
  return modalProps.at(-1)!
}

describe('SpeakersPageClient ticket row actions', () => {
  it('leaves rows live when nothing is in flight', () => {
    expect(renderPage().ticketActionsDisabled).toBe(false)
  })

  it('holds rows while the sweep mutation runs', () => {
    sweepMutation.isPending = true

    expect(renderPage().ticketActionsDisabled).toBe(true)
  })

  it('keeps holding rows through the status refetch that follows the sweep', () => {
    // The mutation has resolved; the invalidation it triggered has not landed.
    sweepMutation.isPending = false
    statusQuery.isFetching = true

    expect(renderPage().ticketActionsDisabled).toBe(true)
  })
})

describe('the confirmation never offers stale counts', () => {
  it('enables Send once a preview has landed', () => {
    previewQuery.data = FRESH_PREVIEW

    renderPage()

    expect(confirmation().confirmDisabled).toBe(false)
    expect(confirmation().message).toContain('12 speakers')
  })

  /**
   * `retry: false` means a failed refetch settles with `isFetching` false and
   * `isError` true — while react-query still holds the PREVIOUS result. Gating
   * on `isFetching` alone would re-enable Send against the last run's counts,
   * under a message saying the numbers could not be worked out.
   */
  it('refuses Send when the refetch failed, stale data and all', () => {
    previewQuery.data = FRESH_PREVIEW
    previewQuery.isError = true

    renderPage()

    expect(confirmation().confirmDisabled).toBe(true)
    expect(confirmation().message).not.toContain('12 speakers')
  })

  it('refuses Send while the preview is still in flight', () => {
    previewQuery.data = FRESH_PREVIEW
    previewQuery.isFetching = true

    renderPage()

    expect(confirmation().confirmDisabled).toBe(true)
  })
})
