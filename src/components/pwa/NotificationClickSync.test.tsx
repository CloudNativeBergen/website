/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { Session } from 'next-auth'

let mockSession: Session | null = null
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: mockSession,
    status: mockSession ? 'authenticated' : 'unauthenticated',
  }),
}))

const markReadMutate = vi.fn()
const invalidateUnread = vi.fn()
const invalidateList = vi.fn()
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      notification: {
        unreadCount: { invalidate: invalidateUnread },
        list: { invalidate: invalidateList },
      },
    }),
    notification: {
      markReadByLink: {
        useMutation: () => ({ mutate: markReadMutate }),
      },
    },
  },
}))

import { NotificationClickSync } from './NotificationClickSync'

/** A fresh EventTarget standing in for navigator.serviceWorker. */
function installServiceWorker() {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: new EventTarget(),
    configurable: true,
    writable: true,
  })
}

function postFromSW(data: unknown) {
  const event = new MessageEvent('message', { data })
  ;(navigator.serviceWorker as unknown as EventTarget).dispatchEvent(event)
}

function signedIn(): Session {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: { name: 'Jane' },
    speaker: { _id: 'sp-1', name: 'Jane', isOrganizer: false },
  } as unknown as Session
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSession = signedIn()
  installServiceWorker()
})

afterEach(() => {
  cleanup()
})

describe('NotificationClickSync', () => {
  it('renders nothing', () => {
    const { container } = render(<NotificationClickSync />)
    expect(container).toBeEmptyDOMElement()
  })

  it('marks read by the clicked notification url on a notification-click message', () => {
    render(<NotificationClickSync />)
    postFromSW({ type: 'notification-click', url: '/cfp/proposal/1' })
    expect(markReadMutate).toHaveBeenCalledWith({ links: ['/cfp/proposal/1'] })
  })

  it('ignores messages that are not notification clicks', () => {
    render(<NotificationClickSync />)
    postFromSW({ type: 'SKIP_WAITING' })
    postFromSW({ type: 'notification-click' }) // missing url
    postFromSW('a raw string')
    expect(markReadMutate).not.toHaveBeenCalled()
  })

  it('does not register / fire when signed out', () => {
    mockSession = null
    render(<NotificationClickSync />)
    postFromSW({ type: 'notification-click', url: '/cfp/proposal/1' })
    expect(markReadMutate).not.toHaveBeenCalled()
  })
})
