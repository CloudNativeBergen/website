import { describe, it, expect } from 'vitest'
import { SendVolunteerEmailSchema } from './volunteer'
import {
  UpdateRegistrationSchema,
  UpdateCommunicationSchema,
} from './conference'

describe('SendVolunteerEmailSchema', () => {
  it('accepts valid input without optional URLs', () => {
    const parsed = SendVolunteerEmailSchema.safeParse({
      volunteerId: 'vol-123',
      subject: 'Welcome!',
      message: 'You have been approved.',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts valid https ticket and slack URLs', () => {
    const parsed = SendVolunteerEmailSchema.safeParse({
      volunteerId: 'vol-123',
      subject: 'Welcome!',
      message: 'You have been approved.',
      ticketUrl: 'https://tickets.example.com/volunteer',
      slackInviteUrl: 'https://slack.example.com/invite',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects non-https URLs for ticketUrl', () => {
    const parsed = SendVolunteerEmailSchema.safeParse({
      volunteerId: 'vol-123',
      subject: 'Welcome!',
      message: 'You have been approved.',
      ticketUrl: 'http://insecure.example.com/volunteer',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects javascript: pseudoprotocol URLs', () => {
    const parsed = SendVolunteerEmailSchema.safeParse({
      volunteerId: 'vol-123',
      subject: 'Welcome!',
      message: 'You have been approved.',
      slackInviteUrl: 'javascript:alert(1)',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('Conference Volunteer Links Validation', () => {
  it('UpdateRegistrationSchema accepts valid volunteerRegistrationLink', () => {
    const parsed = UpdateRegistrationSchema.safeParse({
      registrationEnabled: true,
      volunteerRegistrationLink: 'https://tickets.example.com/volunteers',
    })
    expect(parsed.success).toBe(true)
  })

  it('UpdateRegistrationSchema rejects non-https volunteerRegistrationLink', () => {
    const parsed = UpdateRegistrationSchema.safeParse({
      registrationEnabled: true,
      volunteerRegistrationLink: 'http://tickets.example.com/volunteers',
    })
    expect(parsed.success).toBe(false)
  })

  it('UpdateCommunicationSchema accepts valid volunteerSlackInviteUrl', () => {
    const parsed = UpdateCommunicationSchema.safeParse({
      contactEmail: 'contact@example.com',
      cfpEmail: 'cfp@example.com',
      sponsorEmail: 'sponsor@example.com',
      volunteerSlackInviteUrl: 'https://join.slack.com/t/test/shared_invite/123',
    })
    expect(parsed.success).toBe(true)
  })

  it('UpdateCommunicationSchema rejects non-https volunteerSlackInviteUrl', () => {
    const parsed = UpdateCommunicationSchema.safeParse({
      contactEmail: 'contact@example.com',
      cfpEmail: 'cfp@example.com',
      sponsorEmail: 'sponsor@example.com',
      volunteerSlackInviteUrl: 'http://join.slack.com/t/test/shared_invite/123',
    })
    expect(parsed.success).toBe(false)
  })
})
