/**
 * @vitest-environment jsdom
 *
 * Behavioural tests for the test-notification feedback mapping in
 * `PushNotificationSettingsView` (src/components/pwa/PushNotificationSettings.tsx).
 * The `testFeedback` helper is exercised through the rendered view so we assert
 * on what a speaker actually sees: the actionable copy driven by the dominant
 * push-service rejection, plus the muted technical detail line.
 */
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PushNotificationSettingsView,
  type PushTestResult,
} from '@/components/pwa/PushNotificationSettings'
import { DEFAULT_PUSH_PREFERENCES } from '@/lib/push/types'

afterEach(cleanup)

function renderWithResult(result: PushTestResult) {
  render(
    <PushNotificationSettingsView
      status="enabled"
      preferences={DEFAULT_PUSH_PREFERENCES}
      onToggleMaster={vi.fn()}
      onToggleCategory={vi.fn()}
      onSendTest={vi.fn()}
      sendTestResult={result}
    />,
  )
}

describe('PushNotificationSettingsView test-send feedback', () => {
  it('403 (all failed): shows the re-subscribe hint and the detail line', () => {
    renderWithResult({
      sent: 0,
      gone: 0,
      total: 2,
      configured: true,
      failures: [
        { statusCode: 403, message: 'HTTP 403 — VapidPkHashMismatch' },
      ],
    })
    expect(screen.getByText(/HTTP 403/)).toBeInTheDocument()
    expect(
      screen.getByText(/turn notifications off and on again/i),
    ).toBeInTheDocument()
    // Muted technical detail line, with the HTTP prefix stripped.
    expect(screen.getByText('403 — VapidPkHashMismatch')).toBeInTheDocument()
  })

  it('400 is treated like 403 (older-key re-subscribe advice)', () => {
    renderWithResult({
      sent: 0,
      gone: 0,
      total: 1,
      configured: true,
      failures: [{ statusCode: 400, message: 'HTTP 400 — bad key' }],
    })
    expect(screen.getByText(/HTTP 400/)).toBeInTheDocument()
    expect(screen.getByText(/re-subscribe/i)).toBeInTheDocument()
  })

  it('401: blames the server VAPID configuration, not the device', () => {
    renderWithResult({
      sent: 0,
      gone: 0,
      total: 1,
      configured: true,
      failures: [{ statusCode: 401, message: 'HTTP 401 — Unauthorized' }],
    })
    expect(screen.getByText(/HTTP 401/)).toBeInTheDocument()
    expect(screen.getByText(/VAPID configuration/i)).toBeInTheDocument()
  })

  it('429: advises retrying in a minute', () => {
    renderWithResult({
      sent: 0,
      gone: 0,
      total: 1,
      configured: true,
      failures: [{ statusCode: 429, message: 'HTTP 429 — slow down' }],
    })
    expect(screen.getByText(/HTTP 429/)).toBeInTheDocument()
    expect(screen.getByText(/try again in a minute/i)).toBeInTheDocument()
  })

  it('undefined status: falls back to the composed message', () => {
    renderWithResult({
      sent: 0,
      gone: 0,
      total: 1,
      configured: true,
      failures: [{ statusCode: undefined, message: 'internal error' }],
    })
    expect(
      screen.getByText(/Delivery failed \(internal error\)/i),
    ).toBeInTheDocument()
  })

  it('failure with no message at all: says network error', () => {
    renderWithResult({
      sent: 0,
      gone: 0,
      total: 1,
      configured: true,
      failures: [{}],
    })
    expect(
      screen.getByText(/Delivery failed \(network error\)/i),
    ).toBeInTheDocument()
  })

  it('partial success: success count PLUS a secondary re-subscribe line', () => {
    renderWithResult({
      sent: 1,
      gone: 0,
      total: 2,
      configured: true,
      failures: [
        { statusCode: 403, message: 'HTTP 403 — VapidPkHashMismatch' },
      ],
    })
    expect(screen.getByText(/Sent to 1 device/i)).toBeInTheDocument()
    expect(
      screen.getByText(/turn notifications off and on again/i),
    ).toBeInTheDocument()
    expect(screen.getByText('403 — VapidPkHashMismatch')).toBeInTheDocument()
  })

  it('all failed AND some pruned: the rejection copy KEEPS the expired-subscriptions note', () => {
    renderWithResult({
      sent: 0,
      gone: 1,
      total: 3,
      configured: true,
      failures: [
        { statusCode: 403, message: 'HTTP 403 — VapidPkHashMismatch' },
      ],
    })
    // The actionable rejection copy is still shown …
    expect(
      screen.getByText(/turn notifications off and on again/i),
    ).toBeInTheDocument()
    // … and the pruning note is no longer dropped (regression #534).
    expect(
      screen.getByText(/Removed 1 expired subscription\b/i),
    ).toBeInTheDocument()
    expect(screen.getByText('403 — VapidPkHashMismatch')).toBeInTheDocument()
  })

  it('partial success AND some pruned: success count, pruning note, and rejection copy', () => {
    renderWithResult({
      sent: 1,
      gone: 2,
      total: 4,
      configured: true,
      failures: [
        { statusCode: 403, message: 'HTTP 403 — VapidPkHashMismatch' },
      ],
    })
    expect(screen.getByText(/Sent to 1 device/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Removed 2 expired subscriptions/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/turn notifications off and on again/i),
    ).toBeInTheDocument()
  })

  it('every device failed with NO diagnostics: generic retry hint, no detail line', () => {
    renderWithResult({
      sent: 0,
      gone: 0,
      total: 2,
      configured: true,
      failures: [],
    })
    expect(
      screen.getByText(/Could not deliver to your devices/i),
    ).toBeInTheDocument()
  })

  it('all devices were expired and pruned: reports the pruning, not a rejection', () => {
    renderWithResult({
      sent: 0,
      gone: 2,
      total: 2,
      configured: true,
      failures: [],
    })
    expect(
      screen.getByText(/Removed 2 expired subscriptions/i),
    ).toBeInTheDocument()
  })

  it('full success: green confirmation, no failure copy', () => {
    renderWithResult({
      sent: 2,
      gone: 0,
      total: 2,
      configured: true,
      failures: [],
    })
    expect(screen.getByText(/Sent to 2 devices/i)).toBeInTheDocument()
    expect(screen.queryByText(/re-subscribe/i)).not.toBeInTheDocument()
  })
})
