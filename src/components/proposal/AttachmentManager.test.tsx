/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AttachmentManager } from './AttachmentManager'
import { Attachment } from '@/lib/attachment/types'

vi.mock('@/lib/trpc/client', () => ({
  api: {
    proposal: {
      uploadAttachment: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
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
    url: 'https://cdn.example.com/slides.pdf',
    uploadedAt: '2025-11-01T10:00:00Z',
  },
  {
    _type: 'urlAttachment',
    _key: 'url-1',
    url: 'https://github.com/example/repo',
    attachmentType: 'resource',
    title: 'Demo Repo',
    uploadedAt: '2025-11-02T14:00:00Z',
  },
]

describe('AttachmentManager', () => {
  it('hides delete buttons when readonly=true and allowDelete=false', () => {
    render(
      <AttachmentManager
        proposalId="prop-1"
        attachments={mockAttachments}
        onAttachmentsChange={vi.fn()}
        onDeleteAttachment={vi.fn()}
        readonly={true}
        allowDelete={false}
      />,
    )

    expect(screen.queryByLabelText('Remove attachment')).toBeNull()
  })

  it('shows delete buttons when readonly=true and allowDelete=true', () => {
    render(
      <AttachmentManager
        proposalId="prop-1"
        attachments={mockAttachments}
        onAttachmentsChange={vi.fn()}
        onDeleteAttachment={vi.fn()}
        readonly={true}
        allowDelete={true}
      />,
    )

    const removeButtons = screen.getAllByLabelText('Remove attachment')
    expect(removeButtons).toHaveLength(2)
  })

  it('triggers inline confirmation and calls onDeleteAttachment on confirm', () => {
    const onDelete = vi.fn()
    render(
      <AttachmentManager
        proposalId="prop-1"
        attachments={mockAttachments}
        onAttachmentsChange={vi.fn()}
        onDeleteAttachment={onDelete}
        readonly={true}
        allowDelete={true}
      />,
    )

    const removeButtons = screen.getAllByLabelText('Remove attachment')
    fireEvent.click(removeButtons[0])

    expect(screen.getByText('Delete this attachment?')).toBeInTheDocument()
    const deleteBtn = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteBtn)

    expect(onDelete).toHaveBeenCalledWith('file-1')
  })

  it('cancels inline delete confirmation without calling onDeleteAttachment', () => {
    const onDelete = vi.fn()
    render(
      <AttachmentManager
        proposalId="prop-1"
        attachments={mockAttachments}
        onAttachmentsChange={vi.fn()}
        onDeleteAttachment={onDelete}
        readonly={true}
        allowDelete={true}
      />,
    )

    const removeButtons = screen.getAllByLabelText('Remove attachment')
    fireEvent.click(removeButtons[0])

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelBtn)

    expect(screen.queryByText('Delete this attachment?')).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('renders "No attachments uploaded" when empty and readonly', () => {
    render(
      <AttachmentManager
        proposalId="prop-1"
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        onDeleteAttachment={vi.fn()}
        readonly={true}
      />,
    )

    expect(screen.getByText('No attachments uploaded')).toBeInTheDocument()
  })

  it('renders Download link for fileAttachment with url', () => {
    render(
      <AttachmentManager
        proposalId="prop-1"
        attachments={mockAttachments}
        onAttachmentsChange={vi.fn()}
        onDeleteAttachment={vi.fn()}
        readonly={true}
      />,
    )

    const downloadLink = screen.getByRole('link', { name: 'Download' })
    expect(downloadLink).toHaveAttribute(
      'href',
      'https://cdn.example.com/slides.pdf',
    )
  })
})
