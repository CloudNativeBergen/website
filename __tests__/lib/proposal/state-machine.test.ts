import { describe, it, expect } from '@jest/globals'
import { actionStateMachine } from '@/lib/proposal/business/state-machine'
import { Action, Status } from '@/lib/proposal/types'

describe('actionStateMachine', () => {
  describe('draft status', () => {
    it('allows submit action', () => {
      const result = actionStateMachine(Status.draft, Action.submit, false)
      expect(result).toEqual({ status: Status.submitted, isValidAction: true })
    })

    it('allows delete action', () => {
      const result = actionStateMachine(Status.draft, Action.delete, false)
      expect(result).toEqual({ status: Status.deleted, isValidAction: true })
    })

    it('rejects accept action', () => {
      const result = actionStateMachine(Status.draft, Action.accept, false)
      expect(result.isValidAction).toBe(false)
    })

    it('rejects withdraw action', () => {
      const result = actionStateMachine(Status.draft, Action.withdraw, false)
      expect(result.isValidAction).toBe(false)
    })

    it('defaults to draft when currentStatus is undefined', () => {
      const result = actionStateMachine(undefined, Action.submit, false)
      expect(result).toEqual({ status: Status.submitted, isValidAction: true })
    })
  })

  describe('submitted status', () => {
    it('allows unsubmit back to draft', () => {
      const result = actionStateMachine(
        Status.submitted,
        Action.unsubmit,
        false,
      )
      expect(result).toEqual({ status: Status.draft, isValidAction: true })
    })

    it('allows organizer to accept', () => {
      const result = actionStateMachine(Status.submitted, Action.accept, true)
      expect(result).toEqual({ status: Status.accepted, isValidAction: true })
    })

    it('allows organizer to waitlist', () => {
      const result = actionStateMachine(Status.submitted, Action.waitlist, true)
      expect(result).toEqual({ status: Status.waitlisted, isValidAction: true })
    })

    it('allows organizer to reject', () => {
      const result = actionStateMachine(Status.submitted, Action.reject, true)
      expect(result).toEqual({ status: Status.rejected, isValidAction: true })
    })

    it('prevents non-organizer from accepting', () => {
      const result = actionStateMachine(Status.submitted, Action.accept, false)
      expect(result.isValidAction).toBe(false)
    })

    it('prevents non-organizer from waitlisting', () => {
      const result = actionStateMachine(
        Status.submitted,
        Action.waitlist,
        false,
      )
      expect(result.isValidAction).toBe(false)
    })

    it('prevents non-organizer from rejecting', () => {
      const result = actionStateMachine(Status.submitted, Action.reject, false)
      expect(result.isValidAction).toBe(false)
    })
  })

  describe('accepted status', () => {
    it('allows confirm action', () => {
      const result = actionStateMachine(Status.accepted, Action.confirm, false)
      expect(result).toEqual({ status: Status.confirmed, isValidAction: true })
    })

    it('allows withdraw action', () => {
      const result = actionStateMachine(Status.accepted, Action.withdraw, false)
      expect(result).toEqual({ status: Status.withdrawn, isValidAction: true })
    })

    it('allows organizer to reject', () => {
      const result = actionStateMachine(Status.accepted, Action.reject, true)
      expect(result).toEqual({ status: Status.rejected, isValidAction: true })
    })

    it('allows organizer remind without changing status', () => {
      const result = actionStateMachine(Status.accepted, Action.remind, true)
      expect(result).toEqual({ status: Status.accepted, isValidAction: true })
    })
  })

  describe('rejected status', () => {
    it('allows organizer to re-accept', () => {
      const result = actionStateMachine(Status.rejected, Action.accept, true)
      expect(result).toEqual({ status: Status.accepted, isValidAction: true })
    })

    it('prevents non-organizer actions', () => {
      const result = actionStateMachine(Status.rejected, Action.accept, false)
      expect(result.isValidAction).toBe(false)
    })
  })

  describe('confirmed status', () => {
    it('allows withdraw action', () => {
      const result = actionStateMachine(
        Status.confirmed,
        Action.withdraw,
        false,
      )
      expect(result).toEqual({ status: Status.withdrawn, isValidAction: true })
    })

    it('rejects other actions', () => {
      const result = actionStateMachine(Status.confirmed, Action.accept, true)
      expect(result.isValidAction).toBe(false)
    })
  })

  describe('waitlisted status', () => {
    it('allows organizer to accept', () => {
      const result = actionStateMachine(
        Status.waitlisted,
        Action.accept,
        true,
      )
      expect(result).toEqual({ status: Status.accepted, isValidAction: true })
    })

    it('allows organizer to reject', () => {
      const result = actionStateMachine(
        Status.waitlisted,
        Action.reject,
        true,
      )
      expect(result).toEqual({ status: Status.rejected, isValidAction: true })
    })

    it('allows speaker to withdraw', () => {
      const result = actionStateMachine(
        Status.waitlisted,
        Action.withdraw,
        false,
      )
      expect(result).toEqual({ status: Status.withdrawn, isValidAction: true })
    })

    it('prevents non-organizer from accepting', () => {
      const result = actionStateMachine(
        Status.waitlisted,
        Action.accept,
        false,
      )
      expect(result.isValidAction).toBe(false)
    })

    it('prevents non-organizer from rejecting', () => {
      const result = actionStateMachine(
        Status.waitlisted,
        Action.reject,
        false,
      )
      expect(result.isValidAction).toBe(false)
    })
  })

  describe('full lifecycle: draft → submitted → accepted → confirmed', () => {
    it('transitions through the complete happy path', () => {
      let { status } = actionStateMachine(Status.draft, Action.submit, false)
      expect(status).toBe(Status.submitted)
      ;({ status } = actionStateMachine(status, Action.accept, true))
      expect(status).toBe(Status.accepted)
      ;({ status } = actionStateMachine(status, Action.confirm, false))
      expect(status).toBe(Status.confirmed)
    })

    it('transitions through waitlist path: draft → submitted → waitlisted → accepted', () => {
      let { status } = actionStateMachine(Status.draft, Action.submit, false)
      expect(status).toBe(Status.submitted)
      ;({ status } = actionStateMachine(status, Action.waitlist, true))
      expect(status).toBe(Status.waitlisted)
      ;({ status } = actionStateMachine(status, Action.accept, true))
      expect(status).toBe(Status.accepted)
    })
  })
})
