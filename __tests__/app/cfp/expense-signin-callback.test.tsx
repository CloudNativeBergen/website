/**
 * @vitest-environment node
 *
 * Signing in from /cfp/expense?conferenceId=… must bring the speaker back to
 * the same edition, through a relative, encoded callback.
 */
import { describe, it, expect, vi } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`)
})

vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: (url: string) => redirectMock(url),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null) }))
vi.mock('@/lib/travel-support/sanity', () => ({
  getTravelSupport: vi.fn(),
  resolveTravelSupportConferenceId: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))
vi.mock('@/components/travel-support/TravelSupportPageClient', () => ({
  TravelSupportPageClient: () => null,
}))

import TravelExpensePage from '@/app/(cfp)/cfp/expense/page'

async function callbackFor(conferenceId?: string | string[]) {
  await expect(
    TravelExpensePage({ searchParams: Promise.resolve({ conferenceId }) }),
  ).rejects.toThrow('REDIRECT')
  const url = new URL(redirectMock.mock.lastCall![0], 'https://conf')
  return url.searchParams.get('callbackUrl')
}

describe('travel expense sign-in redirect', () => {
  it('keeps the requested conference', async () => {
    expect(await callbackFor('conf-2024')).toBe(
      '/cfp/expense?conferenceId=conf-2024',
    )
  })

  it('encodes hostile values and stays on the site', async () => {
    expect(await callbackFor('x&next=https://evil.example')).toBe(
      '/cfp/expense?conferenceId=x%26next%3Dhttps%3A%2F%2Fevil.example',
    )
  })

  it('falls back to the bare path', async () => {
    expect(await callbackFor()).toBe('/cfp/expense')
  })
})
