/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProposalAttachmentsPanel } from './ProposalAttachmentsPanel'
import { Attachment } from '@/lib/attachment/types'

const refreshSpy = vi.fn()
const getByIdInvalidate = vi.fn()
const adminGetByIdInvalidate = vi.fn()
const userDeleteMutation = vi.fn()
const adminDeleteMutation = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy }),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      proposal: {
        getById: { invalidate: getByIdInvalidate },
        admin: {
          getById: { invalidate: adminGetByIdInvalidate },
        },
      },
    }),
    proposal: {
      uploadAttachment: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      updateAttachments: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      deleteAttachment: {
        useMutation: (opts?: { onSuccess?: () => void }) => {
          return {
            mutateAsync: userDeleteMutation.mockImplementation(async () => {
              opts?.onSuccess?.()
            }),
            isPending: false,
          }
        },
      },
      admin: {
        deleteAttachment: {
          useMutation: (opts?: { onSuccess?: () => void }) => {
            return {
              mutateAsync: adminDeleteMutation.mockImplementation(async () => {
                opts?.onSuccess?.()
              }),
              isPending: false,
            }
          },
        },
      },
    },
  },
}))

const mockAttachments: Attachment[] = [
  {
    _type: 'fileAttachment',
    _key: 'file-1',
    file: {
      _type: 'file',
      asset: { _ref: 'file-asset-1', _type: 'reference' },
    },
    attachmentType: 'slides',
    title: 'Talk Slides',
    filename: 'slides.pdf',
    uploadedAt: '2025-11-01T10:00:00Z',
  },
]

describe('ProposalAttachmentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls admin.deleteAttachment and refreshes when isAdmin=true', async () => {
    render(
      <ProposalAttachmentsPanel
        proposalId="prop-123"
        initialAttachments={mockAttachments}
        readonly={true}
        allowDelete={true}
        isAdmin={true}
      />,
    )

    // Delete button should be present
    const removeBtn = screen.getByLabelText('Remove attachment')
    fireEvent.click(removeBtn)

    // Confirm deletion
    const confirmBtn = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(adminDeleteMutation).toHaveBeenCalledWith({
        id: 'prop-123',
        attachmentKey: 'file-1',
      })
    })

    expect(userDeleteMutation).not.toHaveBeenCalled()
    expect(adminGetByIdInvalidate).toHaveBeenCalledWith({ id: 'prop-123' })
    expect(getByIdInvalidate).toHaveBeenCalledWith({ id: 'prop-123' })
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('calls user proposal.deleteAttachment when isAdmin=false', async () => {
    render(
      <ProposalAttachmentsPanel
        proposalId="prop-123"
        initialAttachments={mockAttachments}
        readonly={false}
      />,
    )

    const removeBtn = screen.getByLabelText('Remove attachment')
    fireEvent.click(removeBtn)

    const confirmBtn = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(userDeleteMutation).toHaveBeenCalledWith({
        id: 'prop-123',
        attachmentKey: 'file-1',
      })
    })

    expect(adminDeleteMutation).not.toHaveBeenCalled()
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('reverts optimistic removal if deletion fails', async () => {
    adminDeleteMutation.mockRejectedValueOnce(new Error('Network error'))

    render(
      <ProposalAttachmentsPanel
        proposalId="prop-123"
        initialAttachments={mockAttachments}
        readonly={true}
        allowDelete={true}
        isAdmin={true}
      />,
    )

    const removeBtn = screen.getByLabelText('Remove attachment')
    fireEvent.click(removeBtn)

    const confirmBtn = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(
        screen.getByText('Failed to delete attachment'),
      ).toBeInTheDocument()
      // Attachment is restored back to the UI
      expect(screen.getByText('Talk Slides')).toBeInTheDocument()
    })
  })
})
