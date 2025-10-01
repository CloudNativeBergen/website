import { describe, it, expect } from '@jest/globals'
import { validateMultiSpeakerEmailRequest } from '@/lib/email/speaker'

describe('Speaker Email System', () => {
  describe('validateMultiSpeakerEmailRequest', () => {
    it('should validate a complete request with single speaker', () => {
      const request = {
        proposalId: 'proposal1',
        speakerIds: ['speaker1'],
        subject: 'Test Subject',
        message: 'Test message',
      }

      const result = validateMultiSpeakerEmailRequest(request)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should validate a complete request with multiple speakers', () => {
      const request = {
        proposalId: 'proposal1',
        speakerIds: ['speaker1', 'speaker2', 'speaker3'],
        subject: 'Test Subject',
        message: 'Test message',
      }

      const result = validateMultiSpeakerEmailRequest(request)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject request with empty speaker IDs', () => {
      const request = {
        proposalId: 'proposal1',
        speakerIds: [],
        subject: 'Test Subject',
        message: 'Test message',
      }

      const result = validateMultiSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('speakerIds must be a non-empty array')
    })

    it('should reject request with empty subject', () => {
      const request = {
        proposalId: 'proposal1',
        speakerIds: ['speaker1'],
        subject: '   ',
        message: 'Test message',
      }

      const result = validateMultiSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Subject cannot be empty')
    })

    it('should reject request with empty message', () => {
      const request = {
        proposalId: 'proposal1',
        speakerIds: ['speaker1'],
        subject: 'Test Subject',
        message: '   ',
      }

      const result = validateMultiSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Message cannot be empty')
    })

    it('should handle missing proposalId', () => {
      const request = {
        proposalId: '',
        speakerIds: ['speaker1'],
        subject: 'Test Subject',
        message: 'Test message',
      }

      const result = validateMultiSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Missing required fields')
    })

    it('should handle completely empty request', () => {
      const request = {}

      const result = validateMultiSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Missing required fields')
    })
  })
})
