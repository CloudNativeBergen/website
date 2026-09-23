/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stripUtmFromAddressBar, withoutUtm } from './strip-utm'

const BASE = 'https://2026.cloudnativedays.no'

describe('withoutUtm', () => {
  it('removes all five utm_* keys and nothing else', () => {
    expect(
      withoutUtm(
        `${BASE}/?utm_source=x&utm_medium=y&utm_campaign=c1&utm_content=k1&utm_term=t&keep=1#h`,
      ),
    ).toBe(`${BASE}/?keep=1#h`)
  })

  it('keeps every other parameter in its original order and spelling', () => {
    expect(
      withoutUtm(`${BASE}/program?a=1&utm_campaign=c&b=x%20y&flag&c=a+b#t=2`),
    ).toBe(`${BASE}/program?a=1&b=x%20y&flag&c=a+b#t=2`)
  })

  it('drops the question mark when only utm_* was present', () => {
    expect(withoutUtm(`${BASE}/cfp?utm_campaign=c`)).toBe(`${BASE}/cfp`)
    expect(withoutUtm(`${BASE}/?utm_campaign=c#h`)).toBe(`${BASE}/#h`)
  })

  it('removes a repeated or empty utm key', () => {
    expect(
      withoutUtm(`${BASE}/?utm_campaign=a&keep=1&utm_campaign=b&utm_content=`),
    ).toBe(`${BASE}/?keep=1`)
  })

  it('matches keys exactly: look-alikes and other campaign ids stay', () => {
    expect(
      withoutUtm(`${BASE}/?UTM_SOURCE=x&utm_id=7&utm_sourcex=1&gclid=g`),
    ).toBeNull()
  })

  it('recognises a percent-encoded key', () => {
    expect(withoutUtm(`${BASE}/?utm%5Fcampaign=c&keep=1`)).toBe(
      `${BASE}/?keep=1`,
    )
  })

  it('returns null when there is nothing to strip', () => {
    expect(withoutUtm(`${BASE}/`)).toBeNull()
    expect(withoutUtm(`${BASE}/?keep=1#utm_campaign=c`)).toBeNull()
    expect(withoutUtm('not a url')).toBeNull()
  })
})

describe('stripUtmFromAddressBar', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('rewrites the current entry in place and keeps its state', () => {
    window.history.replaceState(
      { key: 'next' },
      '',
      '/?utm_campaign=c&keep=1#h',
    )
    const lengthBefore = window.history.length
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')

    expect(stripUtmFromAddressBar(window)).toBe(true)

    expect(window.location.search).toBe('?keep=1')
    expect(window.location.hash).toBe('#h')
    expect(window.history.state).toEqual({ key: 'next' })
    expect(replace).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    expect(window.history.length).toBe(lengthBefore)
  })

  it('does not touch history when the URL is already clean', () => {
    window.history.replaceState(null, '', '/?keep=1')
    const replace = vi.spyOn(window.history, 'replaceState')
    expect(stripUtmFromAddressBar(window)).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('stripUtmFromAddressBar under the Next.js app router', () => {
  // The router's patch, as in next/dist/client/components/app-router.js: a
  // state carrying `__NA` is passed through without the router learning the
  // new URL; anything else updates the router's URL first.
  let routerUrl: string | null = null
  const original = window.history.replaceState.bind(window.history)
  beforeEach(() => {
    routerUrl = null
    window.history.replaceState(
      { __NA: true, custom: 1 },
      '',
      '/?utm_campaign=c&keep=1',
    )
    window.history.replaceState = function (data, unused, url) {
      if (data?.__NA || data?._N) return original(data, unused, url)
      const next = { ...(data ?? {}), __NA: window.history.state?.__NA }
      if (url) routerUrl = String(url)
      return original(next, unused, url)
    }
  })
  afterEach(() => {
    window.history.replaceState = original
    window.history.replaceState(null, '', '/')
  })

  it('lets the router see the stripped URL and keeps every other state key', () => {
    expect(stripUtmFromAddressBar(window)).toBe(true)
    expect(routerUrl).toBe(`${window.location.origin}/?keep=1`)
    expect(window.history.state).toEqual({ __NA: true, custom: 1 })
  })
})
