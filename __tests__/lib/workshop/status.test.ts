import { describe, it, expect } from '@jest/globals'
import {
  hasConfirmedSignup,
  isUserOnWaitlist,
  getUserWorkshopSignup,
  shouldShowAsFull,
  getSignupButtonText,
} from '@/lib/workshop/status'
import type {
  ProposalWithWorkshopData,
  WorkshopSignupExisting,
} from '@/lib/workshop/types'
import { WorkshopSignupStatus } from '@/lib/workshop/types'
import { Format, Status, Language, Level } from '@/lib/proposal/types'

describe('Workshop Status Utils', () => {
  const createWorkshop = (
    id: string,
    available: number,
  ): ProposalWithWorkshopData => ({
    _id: id,
    _type: 'proposal',
    _createdAt: '2025-01-01',
    _updatedAt: '2025-01-01',
    _rev: 'v1',
    title: 'Test Workshop',
    description: [],
    outline: 'Workshop outline',
    tos: true,
    language: Language.english,
    level: Level.intermediate,
    audiences: [],
    topics: [],
    capacity: 20,
    signups: 20 - available,
    available,
    speakers: [],
    conference: {} as any,
    format: Format.workshop_120,
    status: Status.accepted,
  })

  const createSignup = (
    workshopId: string,
    status: WorkshopSignupStatus,
  ): WorkshopSignupExisting => ({
    _id: `signup-${workshopId}`,
    _type: 'workshopSignup',
    _createdAt: '2025-01-01',
    _updatedAt: '2025-01-01',
    _rev: 'v1',
    userEmail: 'test@example.com',
    userName: 'Test User',
    userWorkOSId: 'workos-123',
    experienceLevel: Level.intermediate,
    operatingSystem: 'macos',
    workshop: {
      _type: 'reference',
      _ref: workshopId,
      _id: workshopId,
    },
    conference: {
      _type: 'reference',
      _ref: 'conf-123',
    },
    status,
  })

  describe('hasConfirmedSignup', () => {
    it('returns true when user has confirmed signup', () => {
      const signups = [createSignup('w1', WorkshopSignupStatus.CONFIRMED)]
      expect(hasConfirmedSignup('w1', signups)).toBe(true)
    })

    it('returns false when user is on waitlist', () => {
      const signups = [createSignup('w1', WorkshopSignupStatus.WAITLIST)]
      expect(hasConfirmedSignup('w1', signups)).toBe(false)
    })

    it('returns false when user has no signup', () => {
      const signups = [createSignup('w2', WorkshopSignupStatus.CONFIRMED)]
      expect(hasConfirmedSignup('w1', signups)).toBe(false)
    })

    it('works with workshop _id', () => {
      const signup = createSignup('w1', WorkshopSignupStatus.CONFIRMED)
      signup.workshop = {
        _type: 'reference',
        _ref: 'w1',
        _id: 'w1',
      }
      expect(hasConfirmedSignup('w1', [signup])).toBe(true)
    })

    it('returns false for empty signups array', () => {
      expect(hasConfirmedSignup('w1', [])).toBe(false)
    })
  })

  describe('isUserOnWaitlist', () => {
    it('returns true when user is on waitlist', () => {
      const signups = [createSignup('w1', WorkshopSignupStatus.WAITLIST)]
      expect(isUserOnWaitlist('w1', signups)).toBe(true)
    })

    it('returns false when user has confirmed signup', () => {
      const signups = [createSignup('w1', WorkshopSignupStatus.CONFIRMED)]
      expect(isUserOnWaitlist('w1', signups)).toBe(false)
    })

    it('returns false when user has no signup', () => {
      const signups = [createSignup('w2', WorkshopSignupStatus.WAITLIST)]
      expect(isUserOnWaitlist('w1', signups)).toBe(false)
    })

    it('returns false for empty signups array', () => {
      expect(isUserOnWaitlist('w1', [])).toBe(false)
    })
  })

  describe('getUserWorkshopSignup', () => {
    it('returns signup when user is signed up', () => {
      const signup = createSignup('w1', WorkshopSignupStatus.CONFIRMED)
      const signups = [signup]
      expect(getUserWorkshopSignup('w1', signups)).toBe(signup)
    })

    it('returns undefined when user has no signup', () => {
      const signups = [createSignup('w2', WorkshopSignupStatus.CONFIRMED)]
      expect(getUserWorkshopSignup('w1', signups)).toBeUndefined()
    })

    it('works with workshop _id', () => {
      const signup = createSignup('w1', WorkshopSignupStatus.CONFIRMED)
      signup.workshop = {
        _type: 'reference',
        _ref: 'w1',
        _id: 'w1',
      }
      expect(getUserWorkshopSignup('w1', [signup])).toBe(signup)
    })

    it('returns first match if multiple exist', () => {
      const signup1 = createSignup('w1', WorkshopSignupStatus.CONFIRMED)
      const signup2 = createSignup('w1', WorkshopSignupStatus.WAITLIST)
      expect(getUserWorkshopSignup('w1', [signup1, signup2])).toBe(signup1)
    })
  })

  describe('shouldShowAsFull', () => {
    it('returns false when spots available', () => {
      expect(shouldShowAsFull(createWorkshop('w1', 5))).toBe(false)
      expect(shouldShowAsFull(createWorkshop('w1', 1))).toBe(false)
    })

    it('returns true when no spots available', () => {
      expect(shouldShowAsFull(createWorkshop('w1', 0))).toBe(true)
    })

    it('returns true when negative spots (over capacity)', () => {
      expect(shouldShowAsFull(createWorkshop('w1', -5))).toBe(true)
    })
  })

  describe('getSignupButtonText', () => {
    const workshop = createWorkshop('w1', 5)

    it('shows Signed Up when user is signed up', () => {
      expect(getSignupButtonText(workshop, true, false, false)).toBe(
        'Signed Up',
      )
    })

    it('shows On Waitlist when user is on waitlist', () => {
      expect(getSignupButtonText(workshop, false, true, false)).toBe(
        'On Waitlist',
      )
    })

    it('shows Time Conflict when there is a conflict', () => {
      expect(getSignupButtonText(workshop, false, false, true)).toBe(
        'Time Conflict',
      )
    })

    it('shows Workshop Full when full', () => {
      const fullWorkshop = createWorkshop('w1', 0)
      expect(getSignupButtonText(fullWorkshop, false, false, false)).toBe(
        'Workshop Full',
      )
    })

    it('shows Sign Up when available', () => {
      expect(getSignupButtonText(workshop, false, false, false)).toBe('Sign Up')
    })

    it('prioritizes signed up over other states', () => {
      const fullWorkshop = createWorkshop('w1', 0)
      expect(getSignupButtonText(fullWorkshop, true, false, true)).toBe(
        'Signed Up',
      )
    })
  })

})
