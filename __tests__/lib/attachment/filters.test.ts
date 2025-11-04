import { describe, it, expect } from '@jest/globals'
import { getNonRecordingAttachments } from '@/lib/attachment/filters'
import type { Attachment } from '@/lib/attachment/types'

describe('attachment/filters', () => {
  describe('getNonRecordingAttachments', () => {
    it('should return empty array for undefined attachments', () => {
      const result = getNonRecordingAttachments(undefined)
      expect(result).toEqual([])
    })

    it('should return empty array for empty attachments', () => {
      const result = getNonRecordingAttachments([])
      expect(result).toEqual([])
    })

    it('should filter out recording attachments', () => {
      const attachments: Attachment[] = [
        {
          _type: 'fileAttachment',
          _key: 'attachment-1',
          file: {
            _type: 'file',
            asset: { _ref: 'file-1', _type: 'reference' },
          },
          attachmentType: 'slides',
          filename: 'slides.pdf',
          uploadedAt: '2025-01-01T00:00:00Z',
        },
        {
          _type: 'fileAttachment',
          _key: 'attachment-2',
          file: {
            _type: 'file',
            asset: { _ref: 'file-2', _type: 'reference' },
          },
          attachmentType: 'recording',
          filename: 'recording.mp4',
          uploadedAt: '2025-01-01T00:00:00Z',
        },
        {
          _type: 'fileAttachment',
          _key: 'attachment-3',
          file: {
            _type: 'file',
            asset: { _ref: 'file-3', _type: 'reference' },
          },
          attachmentType: 'resource',
          filename: 'resource.pdf',
          uploadedAt: '2025-01-01T00:00:00Z',
        },
      ]

      const result = getNonRecordingAttachments(attachments)

      expect(result).toHaveLength(2)
      expect(result[0].attachmentType).toBe('slides')
      expect(result[1].attachmentType).toBe('resource')
    })

    it('should keep URL attachments', () => {
      const attachments: Attachment[] = [
        {
          _type: 'urlAttachment',
          _key: 'attachment-1',
          url: 'https://example.com/slides',
          attachmentType: 'slides',
          title: 'Slides',
          uploadedAt: '2025-01-01T00:00:00Z',
        },
      ]

      const result = getNonRecordingAttachments(attachments)

      expect(result).toHaveLength(1)
      expect(result[0]._type).toBe('urlAttachment')
    })

    it('should filter out URL recording attachments', () => {
      const attachments: Attachment[] = [
        {
          _type: 'urlAttachment',
          _key: 'attachment-1',
          url: 'https://youtube.com/watch?v=123',
          attachmentType: 'recording',
          title: 'Recording',
          uploadedAt: '2025-01-01T00:00:00Z',
        },
        {
          _type: 'urlAttachment',
          _key: 'attachment-2',
          url: 'https://example.com/slides',
          attachmentType: 'slides',
          title: 'Slides',
          uploadedAt: '2025-01-01T00:00:00Z',
        },
      ]

      const result = getNonRecordingAttachments(attachments)

      expect(result).toHaveLength(1)
      expect(result[0].attachmentType).toBe('slides')
    })

    it('should handle attachments without attachmentType field', () => {
      const attachments: Attachment[] = [
        {
          _type: 'fileAttachment',
          _key: 'attachment-1',
          file: {
            _type: 'file',
            asset: { _ref: 'file-1', _type: 'reference' },
          },
          filename: 'slides.pdf',
          uploadedAt: '2025-01-01T00:00:00Z',
        } as Attachment,
      ]

      const result = getNonRecordingAttachments(attachments)

      expect(result).toHaveLength(1)
    })

    it('should return all non-recording attachments', () => {
      const attachments: Attachment[] = [
        {
          _type: 'fileAttachment',
          _key: 'attachment-1',
          file: {
            _type: 'file',
            asset: { _ref: 'file-1', _type: 'reference' },
          },
          attachmentType: 'slides',
          filename: 'slides.pdf',
          uploadedAt: '2025-01-01T00:00:00Z',
        },
        {
          _type: 'fileAttachment',
          _key: 'attachment-2',
          file: {
            _type: 'file',
            asset: { _ref: 'file-2', _type: 'reference' },
          },
          attachmentType: 'resource',
          filename: 'resource.pdf',
          uploadedAt: '2025-01-01T00:00:00Z',
        },
      ]

      const result = getNonRecordingAttachments(attachments)

      expect(result).toHaveLength(2)
    })
  })
})
