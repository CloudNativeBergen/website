import { describe, it, expect, vi } from 'vitest'
import { applyConsentChoice, type ConsentClient } from './consent'

function client(status: 'granted' | 'denied' | 'pending' = 'pending') {
  return {
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    register: vi.fn(),
    register_for_session: vi.fn(),
    get_explicit_consent_status: vi.fn(() => status),
  } satisfies ConsentClient
}

describe('applyConsentChoice', () => {
  it('accept: opts in, then bridges the conference and the landing UTMs', () => {
    const ph = client()
    applyConsentChoice(ph, 'accept', {
      conference: 'conf-1',
      landingUtm: { utm_campaign: 'cfp-open', utm_content: 'task-3' },
    })
    expect(ph.opt_in_capturing).toHaveBeenCalledTimes(1)
    // The SDK's own `$opt_in` event fires inside that call, before any
    // re-register can run, so the conference rides along explicitly.
    expect(ph.opt_in_capturing).toHaveBeenCalledWith({
      captureProperties: { conference: 'conf-1' },
    })
    // Order matters: opt-in swaps persistence and drops the pre-consent super
    // properties, so the re-register must come AFTER it (#1000 finding 4).
    const optInOrder = ph.opt_in_capturing.mock.invocationCallOrder[0]
    expect(ph.register.mock.invocationCallOrder[0]).toBeGreaterThan(optInOrder)
    expect(ph.register).toHaveBeenCalledWith({ conference: 'conf-1' })
    expect(ph.register_for_session).toHaveBeenCalledWith({
      utm_campaign: 'cfp-open',
      utm_content: 'task-3',
    })
  })

  it('accept without landing UTMs registers nothing for the session', () => {
    const ph = client()
    applyConsentChoice(ph, 'accept', { conference: 'conf-1', landingUtm: {} })
    expect(ph.register).toHaveBeenCalledWith({ conference: 'conf-1' })
    expect(ph.register_for_session).not.toHaveBeenCalled()
  })

  it('decline: opts out, then restores the conference property', () => {
    // Revoking an earlier Accept resets persistence and drops the super
    // properties with it; the declined visitor must stay in the conference.
    const ph = client('granted')
    applyConsentChoice(ph, 'decline', {
      conference: 'conf-1',
      landingUtm: { utm_campaign: 'x' },
    })
    expect(ph.opt_out_capturing).toHaveBeenCalledTimes(1)
    expect(ph.opt_in_capturing).not.toHaveBeenCalled()
    expect(ph.register.mock.invocationCallOrder[0]).toBeGreaterThan(
      ph.opt_out_capturing.mock.invocationCallOrder[0],
    )
    expect(ph.register).toHaveBeenCalledWith({ conference: 'conf-1' })
    // No UTM replay: a declined visitor attributes through the server session.
    expect(ph.register_for_session).not.toHaveBeenCalled()
  })
})
