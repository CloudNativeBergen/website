/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals'
import {
  validateCoSpeakerEmail,
  isValidInvitationToken,
  canHaveCoSpeakers,
  convertStringToPortableTextBlocks,
} from './validation'
import { Format, ProposalExisting, Status } from './types'
import { Speaker } from '@/lib/speaker/types'

describe('validateCoSpeakerEmail', () => {
  it('should return true for valid email', () => {
    expect(validateCoSpeakerEmail('test@example.com')).toBe(true)
    expect(validateCoSpeakerEmail('user.name+tag@company.co.uk')).toBe(true)
  })

  it('should return false for invalid email', () => {
    expect(validateCoSpeakerEmail('invalid')).toBe(false)
    expect(validateCoSpeakerEmail('test@')).toBe(false)
    expect(validateCoSpeakerEmail('@example.com')).toBe(false)
    expect(validateCoSpeakerEmail('test @example.com')).toBe(false)
  })

  it('should return false for empty email', () => {
    expect(validateCoSpeakerEmail('')).toBe(false)
  })
})

describe('isValidInvitationToken', () => {
  it('should return true for valid UUID format', () => {
    expect(isValidInvitationToken('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isValidInvitationToken('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true)
  })

  it('should return false for invalid UUID format', () => {
    expect(isValidInvitationToken('not-a-uuid')).toBe(false)
    expect(isValidInvitationToken('550e8400-e29b-41d4-a716')).toBe(false)
    expect(isValidInvitationToken('550e8400e29b41d4a716446655440000')).toBe(false)
    expect(isValidInvitationToken('')).toBe(false)
  })
})

describe('canHaveCoSpeakers', () => {
  const baseSpeaker: Speaker = {
    _id: 'speaker-id',
    _rev: 'rev-1',
    _createdAt: '2021-01-01T00:00:00Z',
    _updatedAt: '2021-01-01T00:00:00Z',
    name: 'Test Speaker',
    email: 'speaker@example.com',
    title: 'Developer',
    flags: [],
  }

  const baseProposal: ProposalExisting = {
    _id: 'proposal-id',
    _rev: 'rev-1',
    _type: 'talk',
    _createdAt: '2021-01-01T00:00:00Z',
    _updatedAt: '2021-01-01T00:00:00Z',
    title: 'Test Proposal',
    description: convertStringToPortableTextBlocks('Test description'),
    language: 'english' as any,
    format: Format.presentation_40,
    level: 'intermediate' as any,
    audiences: [],
    outline: 'Test outline',
    tos: true,
    status: Status.draft,
    speaker: baseSpeaker,
    conference: { _type: 'reference', _ref: 'conf-id' },
  }

  it('should return true for non-lightning talk formats', () => {
    const formats = [
      Format.presentation_20,
      Format.presentation_25,
      Format.presentation_40,
      Format.presentation_45,
      Format.workshop_120,
      Format.workshop_240,
    ]

    formats.forEach(format => {
      const proposal = { ...baseProposal, format }
      expect(canHaveCoSpeakers(proposal)).toBe(true)
    })
  })

  it('should return false for lightning talk format', () => {
    const proposal = { ...baseProposal, format: Format.lightning_10 }
    expect(canHaveCoSpeakers(proposal)).toBe(false)
  })

  it('should handle proposals without format', () => {
    const proposal = { ...baseProposal, format: undefined } as any
    expect(canHaveCoSpeakers(proposal)).toBe(false)
  })
})

describe('convertStringToPortableTextBlocks', () => {
  it('should convert simple string to portable text blocks', () => {
    const result = convertStringToPortableTextBlocks('Hello world')
    expect(result).toHaveLength(1)
    expect(result[0]._type).toBe('block')
    expect(result[0].children).toHaveLength(1)
    expect((result[0] as any).children[0].text).toBe('Hello world')
  })

  it('should handle multiline strings', () => {
    const input = 'Line 1\nLine 2\nLine 3'
    const result = convertStringToPortableTextBlocks(input)
    expect(result).toHaveLength(3)
    expect((result[0] as any).children[0].text).toBe('Line 1')
    expect((result[1] as any).children[0].text).toBe('Line 2')
    expect((result[2] as any).children[0].text).toBe('Line 3')
  })

  it('should handle empty string', () => {
    const result = convertStringToPortableTextBlocks('')
    expect(result).toHaveLength(1)
    expect((result[0] as any).children[0].text).toBe('')
  })

  it('should handle strings with only whitespace', () => {
    const result = convertStringToPortableTextBlocks('   ')
    expect(result).toHaveLength(1)
    expect((result[0] as any).children[0].text).toBe('   ')
  })
})