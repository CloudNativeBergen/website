/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  render,
  fireEvent,
  cleanup,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SpeakerManagementModal } from '@/components/admin/SpeakerManagementModal'
import type { Speaker } from '@/lib/speaker/types'

const { updateAsync, emailAsync, onErrors } = vi.hoisted(() => ({
  updateAsync: vi.fn(),
  emailAsync: vi.fn(),
  onErrors: {} as Record<string, (e: Error) => void>,
}))

// mutateAsync rejects AND calls the hook-level onError, as TanStack does.
const { mutation } = vi.hoisted(() => ({
  mutation:
    (name: string, fn: (input: unknown) => unknown) =>
    (opts: { onError?: (e: Error) => void }) => {
      if (opts?.onError) onErrors[name] = opts.onError
      return {
        isPending: false,
        mutate: vi.fn(),
        mutateAsync: async (input: unknown) => {
          try {
            return await fn(input)
          } catch (e) {
            onErrors[name]?.(e as Error)
            throw e
          }
        },
      }
    },
}))

vi.mock('@/components/cfp/SpeakerDetailsForm', () => ({
  SpeakerDetailsForm: () => null,
}))
vi.mock('@/components/photo-wall/talk/TalkPhotosOptOutSwitch', () => ({
  TalkPhotosOptOutSwitch: () => null,
}))
vi.mock('@/lib/speaker/validation', () => ({
  validateSpeakerForAdmin: () => ({}),
}))
vi.mock('@/hooks/useSpeakerImageUpload', () => ({
  useSpeakerImageUpload: () => ({ uploadImage: vi.fn(), isUploading: false }),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      admin: {
        create: { useMutation: mutation('create', vi.fn()) },
        update: { useMutation: mutation('update', updateAsync) },
        updateEmail: { useMutation: mutation('email', emailAsync) },
      },
    },
  },
}))

const speaker = {
  _id: 'sp-1',
  name: 'Ada',
  email: 'old@example.com',
} as unknown as Speaker

function setup() {
  const queryClient = new QueryClient()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const onClose = vi.fn()
  const onSpeakerUpdated = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <SpeakerManagementModal
        isOpen
        onClose={onClose}
        editingSpeaker={speaker}
        onSpeakerUpdated={onSpeakerUpdated}
      />
    </QueryClientProvider>,
  )
  fireEvent.change(screen.getByLabelText(/Email Address/), {
    target: { value: 'new@example.com' },
  })
  fireEvent.submit(screen.getByLabelText(/Email Address/).closest('form')!)
  return { invalidate, onClose, onSpeakerUpdated }
}

afterEach(() => {
  cleanup()
  updateAsync.mockReset()
  emailAsync.mockReset()
})

describe('SpeakerManagementModal email change', () => {
  it('waits for the email update, then invalidates and closes', async () => {
    updateAsync.mockResolvedValue(speaker)
    emailAsync.mockResolvedValue({})
    const { invalidate, onClose, onSpeakerUpdated } = setup()

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(emailAsync).toHaveBeenCalledWith({
      id: 'sp-1',
      email: 'new@example.com',
    })
    expect(invalidate).toHaveBeenCalled()
    expect(onSpeakerUpdated).toHaveBeenCalledWith(speaker)
  })

  it('stays open and shows the error when the email update fails', async () => {
    updateAsync.mockResolvedValue(speaker)
    emailAsync.mockRejectedValue(new Error('Email already in use'))
    const { onClose } = setup()

    expect(await screen.findByText('Email already in use')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})
