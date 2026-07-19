/**
 * @vitest-environment jsdom
 *
 * V2a: the "Message emails" toggle on /cfp/profile#notification-settings must
 * SAVE ON CHANGE (a narrow speaker.update with just `messagingEmailDefault`),
 * independent of the distant "Update Profile" button, with optimistic UI and
 * inline saved/error feedback. Previously it only mutated local state, so the
 * setting silently didn't stick.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Speaker } from '@/lib/speaker/types'

// Behaviour switch + spy, mutated per test before rendering.
let mutateBehavior: 'success' | 'error' = 'success'
const narrowUpdateSpy = vi.fn<(input: unknown) => void>()

const mockSpeaker = {
  _id: 'sp-1',
  name: 'Kari Nordmann',
  email: 'kari@example.com',
  // messagingEmailDefault absent ⇒ ON (absent-means-enabled).
} as unknown as Speaker

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      getCurrent: {
        useQuery: () => ({
          data: mockSpeaker,
          error: null,
          refetch: vi.fn(),
        }),
      },
      getEmails: {
        useQuery: () => ({ data: [{ email: 'kari@example.com' }] }),
      },
      update: {
        useMutation: () => ({ isPending: false, mutate: vi.fn() }),
      },
      setMessagingEmailDefault: {
        useMutation: () => ({
          isPending: false,
          mutate: (
            input: unknown,
            opts?: { onSuccess?: () => void; onError?: () => void },
          ) => {
            narrowUpdateSpy(input)
            if (mutateBehavior === 'success') opts?.onSuccess?.()
            else opts?.onError?.()
          },
        }),
      },
    },
  },
}))

// Heavy children are irrelevant to the toggle; stub them out.
vi.mock('@/components/pwa', () => ({
  PushNotificationSettings: () => null,
}))
vi.mock('@/components/cfp/SpeakerDetailsForm', () => ({
  SpeakerDetailsForm: () => null,
}))
vi.mock('@/components/cfp/LinkedProviders', () => ({
  LinkedProviders: () => null,
}))
vi.mock('@/hooks/useSpeakerImageUpload', () => ({
  useSpeakerImageUpload: () => ({ uploadImage: vi.fn(), error: null }),
}))
vi.mock('@/app/(cfp)/cfp/profile/link-actions', () => ({
  startProviderLink: vi.fn(),
}))

import { CFPProfilePage } from '@/components/cfp/CFPProfilePage'

beforeEach(() => {
  mutateBehavior = 'success'
  narrowUpdateSpy.mockClear()
})

function getToggle() {
  return screen.getByRole('switch', { name: /email me about new messages/i })
}

describe('CFPProfilePage — message-emails autosave (V2a)', () => {
  it('saves the narrow field on toggle without pressing Update Profile', async () => {
    render(<CFPProfilePage initialSpeaker={mockSpeaker} />)

    const toggle = getToggle()
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(toggle)

    // Saved ONLY the messaging field (turning it off), on click.
    expect(narrowUpdateSpy).toHaveBeenCalledTimes(1)
    expect(narrowUpdateSpy).toHaveBeenCalledWith({
      messagingEmailDefault: false,
    })
    // Optimistic flip + success feedback.
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('reverts the optimistic flip and shows an error when the save fails', async () => {
    mutateBehavior = 'error'
    render(<CFPProfilePage initialSpeaker={mockSpeaker} />)

    const toggle = getToggle()
    fireEvent.click(toggle)

    // Reverted back to ON, with an inline error.
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByText(/couldn’t save that change/i)).toBeInTheDocument()
  })
})
