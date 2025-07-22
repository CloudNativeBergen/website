import { describe, it, expect } from '@jest/globals'
import { validateSpeakerEmailRequest } from '@/lib/email/speaker'

describe('Speaker Email System', () => {
  describe('validateSpeakerEmailRequest', () => {
    it('should validate a complete request', () => {
      const request = {
        proposalId: 'proposal1',
        speakerId: 'speaker1',
        subject: 'Test Subject',
        message: 'Test message',
      }

      const result = validateSpeakerEmailRequest(request)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject request with missing fields', () => {
      const request = {
        proposalId: 'proposal1',
        speakerId: '',
        subject: 'Test Subject',
        message: 'Test message',
      }

      const result = validateSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Missing required fields')
    })

    it('should reject request with empty subject', () => {
      const request = {
        proposalId: 'proposal1',
        speakerId: 'speaker1',
        subject: '   ',
        message: 'Test message',
      }

      const result = validateSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Subject cannot be empty')
    })

    it('should reject request with empty message', () => {
      const request = {
        proposalId: 'proposal1',
        speakerId: 'speaker1',
        subject: 'Test Subject',
        message: '   ',
      }

      const result = validateSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Message cannot be empty')
    })

    it('should handle missing proposalId', () => {
      const request = {
        proposalId: '',
        speakerId: 'speaker1',
        subject: 'Test Subject',
        message: 'Test message',
      }

      const result = validateSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Missing required fields')
    })

    it('should handle completely empty request', () => {
      const request = {}

      const result = validateSpeakerEmailRequest(request)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Missing required fields')
    })
  })
})
