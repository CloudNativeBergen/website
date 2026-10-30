/**
 * @vitest-environment jsdom
 *
 * "Update Profile" must say so when the save fails, and a profile refetch
 * (e.g. after the message-emails autosave) must not wipe unsaved edits.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Speaker } from '@/lib/speaker/types'

let profile = { _id: 'sp-1', name: 'Kari', bio: 'old' } as unknown as Speaker

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      getCurrent: {
        useQuery: () => ({ data: profile, error: null, refetch: vi.fn() }),
      },
      getEmails: { useQuery: () => ({ data: [] }) },
      update: {
        useMutation: (opts: { onError: (e: Error) => void }) => ({
          isPending: false,
          mutate: () => opts.onError(new Error('Session expired')),
        }),
      },
      setTalkPhotosOptOut: {
        useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
      },
      setMessagingEmailDefault: {
        useMutation: () => ({ isPending: false, mutate: vi.fn() }),
      },
    },
  },
}))

// Stand-in form: shows and edits the bio the page holds.
vi.mock('@/components/cfp/SpeakerDetailsForm', () => ({
  SpeakerDetailsForm: ({
    speaker,
    setSpeaker,
  }: {
    speaker: { bio?: string }
    setSpeaker: (s: { bio: string }) => void
  }) => (
    <input
      aria-label="bio"
      value={speaker.bio ?? ''}
      onChange={(e) => setSpeaker({ bio: e.target.value })}
    />
  ),
}))
vi.mock('@/components/pwa', () => ({ PushNotificationSettings: () => null }))
vi.mock('@/components/cfp/LinkedProviders', () => ({
  LinkedProviders: () => null,
}))
vi.mock('@/hooks/useSpeakerImageUpload', () => ({
  useSpeakerImageUpload: () => ({ uploadImage: vi.fn(), error: null }),
}))
vi.mock('@/app/(cfp)/cfp/profile/link-actions', () => ({
  startProviderLink: vi.fn(),
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ update: vi.fn() }) }))

import { CFPProfilePage } from '@/components/cfp/CFPProfilePage'

describe('CFPProfilePage save errors and edits', () => {
  it('shows the error when saving the profile fails', () => {
    render(<CFPProfilePage initialSpeaker={profile} />)
    fireEvent.click(screen.getByRole('button', { name: 'Update Profile' }))
    expect(screen.getByText('Session expired')).toBeInTheDocument()
  })

  it('keeps unsaved edits when the profile is refetched', () => {
    const initial = profile
    const { rerender } = render(<CFPProfilePage initialSpeaker={initial} />)
    fireEvent.change(screen.getByLabelText('bio'), {
      target: { value: 'new bio' },
    })

    profile = { ...profile, messagingEmailDefault: false } as Speaker
    rerender(<CFPProfilePage initialSpeaker={initial} />)

    expect(screen.getByLabelText('bio')).toHaveValue('new bio')
  })
})
