import { describe, it, expect } from '@jest/globals'
import {
  validateAttachmentFile,
  formatFileSize,
} from '@/lib/attachment/validation'

describe('attachment/validation', () => {
  describe('validateAttachmentFile', () => {
    it('should accept valid PDF file', () => {
      const file = new File(['content'], 'presentation.pdf', {
        type: 'application/pdf',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should accept valid PPTX file', () => {
      const file = new File(['content'], 'presentation.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should accept valid PPT file', () => {
      const file = new File(['content'], 'presentation.ppt', {
        type: 'application/vnd.ms-powerpoint',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should accept valid ODP file', () => {
      const file = new File(['content'], 'presentation.odp', {
        type: 'application/vnd.oasis.opendocument.presentation',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should accept valid KEY file', () => {
      const file = new File(['content'], 'presentation.key', {
        type: 'application/x-iwork-keynote-sffkey',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should accept file with empty mime type but valid extension', () => {
      const file = new File(['content'], 'presentation.pdf', { type: '' })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(true)
    })

    it('should reject file exceeding size limit', () => {
      const largeContent = new Array(51 * 1024 * 1024).fill('a').join('')
      const file = new File([largeContent], 'large.pdf', {
        type: 'application/pdf',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('File size exceeds 50MB limit')
    })

    it('should reject file without extension', () => {
      const file = new File(['content'], 'presentation', {
        type: 'application/pdf',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('File must have an extension')
    })

    it('should reject file with disallowed extension', () => {
      const file = new File(['content'], 'document.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'File type not allowed. Accepted formats: PDF, PPTX, PPT, ODP, KEY',
      )
    })

    it('should reject file with disallowed mime type', () => {
      const file = new File(['content'], 'image.pdf', {
        type: 'image/png',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'Invalid file type. Accepted formats: PDF, PPTX, PPT, ODP, KEY',
      )
    })

    it('should handle case-insensitive extensions', () => {
      const file = new File(['content'], 'presentation.PDF', {
        type: 'application/pdf',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(true)
    })

    it('should accept file at exact size limit (50MB)', () => {
      const exactContent = new Array(50 * 1024 * 1024).fill('a').join('')
      const file = new File([exactContent], 'exact.pdf', {
        type: 'application/pdf',
      })
      const result = validateAttachmentFile(file)
      expect(result.valid).toBe(true)
    })
  })

  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes')
    })

    it('should format bytes', () => {
      expect(formatFileSize(512)).toBe('512 Bytes')
    })

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
    })

    it('should format megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB')
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB')
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
    })

    it('should format gigabytes', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
    })

    it('should round to 2 decimal places', () => {
      expect(formatFileSize(1234567)).toBe('1.18 MB')
    })
  })
})
