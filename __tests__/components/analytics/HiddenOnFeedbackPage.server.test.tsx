/**
 * @vitest-environment node
 *
 * The gate's per-document latch must never engage on the SERVER: one server
 * process renders every visitor's pages, so a latch there would hide Pirsch
 * and the install prompt from everyone once anyone opened `/f/<code>`.
 */
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }))

import { HiddenOnFeedbackPage } from '@/components/analytics/HiddenOnFeedbackPage'

describe('HiddenOnFeedbackPage on the server', () => {
  it('renders the next visitor’s page normally after someone opened /f', () => {
    h.pathname = '/f/k7m2qx'
    expect(
      renderToString(<HiddenOnFeedbackPage>pirsch</HiddenOnFeedbackPage>),
    ).toBe('')
    h.pathname = '/program'
    expect(
      renderToString(<HiddenOnFeedbackPage>pirsch</HiddenOnFeedbackPage>),
    ).toBe('pirsch')
  })
})
