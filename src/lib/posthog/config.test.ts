import { describe, it, expect } from 'vitest'
import {
  ANALYTICS_CONFIG_ELEMENT_ID,
  POSTHOG_INGEST_PATH,
  buildPosthogOptions,
  isAnalyticsExcludedPath,
  keepAnalyticsEvent,
  landingUtm,
  parseTenantAnalyticsConfig,
  posthogRewrites,
  optInUtmBridge,
  withConference,
  withoutExcludedEarlierPages,
} from './config'

const TOKEN = 'phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQvbq5gh'

describe('parseTenantAnalyticsConfig', () => {
  it('accepts a valid token and conference id', () => {
    expect(
      parseTenantAnalyticsConfig({ token: TOKEN, conference: 'conf-2026' }),
    ).toEqual({ token: TOKEN, conference: 'conf-2026' })
  })

  it('rejects a missing element, a malformed token or a blank conference', () => {
    expect(parseTenantAnalyticsConfig(null)).toBeNull()
    expect(
      parseTenantAnalyticsConfig({ token: 'phx_notpublic', conference: 'x' }),
    ).toBeNull()
    expect(parseTenantAnalyticsConfig({ token: TOKEN, conference: ' ' })).toBe(
      null,
    )
  })
})

describe('isAnalyticsExcludedPath', () => {
  it('excludes the admin routes and the speaker portal', () => {
    expect(isAnalyticsExcludedPath('/admin')).toBe(true)
    expect(isAnalyticsExcludedPath('/admin/settings')).toBe(true)
    expect(isAnalyticsExcludedPath('/cfp/list')).toBe(true)
    expect(isAnalyticsExcludedPath('/cfp/submit')).toBe(true)
    expect(isAnalyticsExcludedPath('/cfp/admin/proposals')).toBe(true)
    // The speaker notifications page lives outside /cfp but behind the same
    // speaker-only layout.
    expect(isAnalyticsExcludedPath('/notifications')).toBe(true)
    expect(isAnalyticsExcludedPath('/notifications/settings')).toBe(true)
  })

  it('keeps the public pages, including the CFP landing page', () => {
    expect(isAnalyticsExcludedPath('/')).toBe(false)
    expect(isAnalyticsExcludedPath('/cfp')).toBe(false)
    expect(isAnalyticsExcludedPath('/tickets')).toBe(false)
    expect(isAnalyticsExcludedPath('/speaker/jane-doe')).toBe(false)
    // Prefix, not substring: a page that merely starts with the letters.
    expect(isAnalyticsExcludedPath('/administration')).toBe(false)
    expect(isAnalyticsExcludedPath('/cfpx')).toBe(false)
    expect(isAnalyticsExcludedPath('/notificationsx')).toBe(false)
  })
})

describe('keepAnalyticsEvent (before_send)', () => {
  it('drops events captured on an excluded path and keeps the rest', () => {
    const on = (pathname: string, url?: string) => ({
      event: '$pageview',
      properties: {
        $pathname: pathname,
        ...(url ? { $current_url: url } : {}),
      },
    })
    expect(keepAnalyticsEvent(on('/admin/settings'))).toBe(false)
    expect(keepAnalyticsEvent(on('/'))).toBe(true)
  })

  it('falls back to $current_url when $pathname is absent', () => {
    expect(
      keepAnalyticsEvent({
        event: '$autocapture',
        properties: { $current_url: 'https://x.test/cfp/list?x=1' },
      }),
    ).toBe(false)
    expect(
      keepAnalyticsEvent({
        event: '$autocapture',
        properties: { $current_url: 'https://x.test/cfp' },
      }),
    ).toBe(true)
  })

  it('judges an event that names no page by where the browser is now', () => {
    expect(keepAnalyticsEvent({ event: '$opt_in', properties: {} })).toBe(true)
    expect(
      keepAnalyticsEvent({ event: '$opt_in', properties: {} }, '/admin'),
    ).toBe(false)
    expect(keepAnalyticsEvent({ event: '$opt_in', properties: {} }, '/')).toBe(
      true,
    )
  })
})

describe('landingUtm', () => {
  it('extracts only the non-empty utm_* parameters', () => {
    expect(
      landingUtm('?utm_source=bluesky&utm_campaign=cfp-open&utm_content=&x=1'),
    ).toEqual({ utm_source: 'bluesky', utm_campaign: 'cfp-open' })
  })

  it('returns an empty object for a plain landing', () => {
    expect(landingUtm('')).toEqual({})
    expect(landingUtm('?ref=x')).toEqual({})
  })
})

describe('buildPosthogOptions', () => {
  const options = buildPosthogOptions({ token: TOKEN, conference: 'conf-1' })

  it('sends through the rewrite and points the UI at the EU cloud', () => {
    expect(options.api_host).toBe(POSTHOG_INGEST_PATH)
    expect(options.ui_host).toBe('https://eu.posthog.com')
    expect(options.defaults).toBe('2026-05-30')
  })

  it('runs hybrid consent: cookieless until accepted, opted out by default', () => {
    expect(options.cookieless_mode).toBe('on_reject')
    expect(options.opt_out_capturing_by_default).toBe(true)
    expect(options.person_profiles).toBe('identified_only')
  })

  it('keeps the choice for one year, per site domain', () => {
    // A cookie expires (365 days by default); the SDK's localStorage flag
    // would not. Host-only so sibling editions do not share the answer.
    expect(options.opt_out_capturing_persistence_type).toBe('cookie')
    expect(options.cross_subdomain_cookie).toBe(false)
    expect(options.cookie_expiration ?? 365).toBe(365)
  })

  it('loads no replay and no surveys', () => {
    expect(options.disable_session_recording).toBe(true)
    expect(options.disable_surveys).toBe(true)
  })

  it('allowlists autocapture to CTA clicks only', () => {
    expect(options.autocapture).toEqual({
      dom_event_allowlist: ['click'],
      css_selector_allowlist: ['[data-ph-capture-attribute-cta]'],
    })
  })

  it('registers the conference as a super property once loaded', () => {
    const register = vi.fn()
    options.loaded?.({ register } as never)
    expect(register).toHaveBeenCalledWith({ conference: 'conf-1' })
  })

  it('filters excluded paths through before_send', () => {
    const beforeSend = options.before_send
    expect(typeof beforeSend).toBe('function')
    if (typeof beforeSend !== 'function') return
    expect(
      beforeSend({
        event: '$pageview',
        properties: { $pathname: '/admin' },
      } as never),
    ).toBeNull()
  })

  it('stamps the conference on every event that leaves', () => {
    // The SDK captures $opt_in and a fresh $pageview inside
    // opt_in_capturing(), after resetting persistence and before the bridge
    // can re-register — so the super property alone is not enough.
    const beforeSend = options.before_send
    if (typeof beforeSend !== 'function') throw new Error('before_send')
    const sent = beforeSend({
      event: '$pageview',
      properties: { $pathname: '/' },
    } as never) as { properties?: Record<string, unknown> } | null
    expect(sent?.properties?.conference).toBe('conf-1')
  })
})

describe('withoutExcludedEarlierPages', () => {
  it('drops the previous-pageview metadata when that page was excluded', () => {
    const scrubbed = withoutExcludedEarlierPages({
      event: '$pageview',
      properties: {
        $pathname: '/program',
        $prev_pageview_pathname: '/admin/settings',
        $prev_pageview_duration: 12,
        $prev_pageview_max_scroll: 400,
      },
    })
    expect(scrubbed.properties).toEqual({ $pathname: '/program' })
  })

  it('drops the session entry when the session started on an excluded page', () => {
    // The session id rotates inside capture(), before before_send drops the
    // admin event, so the entry can name an admin path (idle > 30 min there).
    const scrubbed = withoutExcludedEarlierPages({
      event: '$pageview',
      properties: {
        $pathname: '/program',
        $session_entry_pathname: '/admin/settings',
        $session_entry_url: 'https://x.test/admin/settings',
        $session_entry_referrer: 'https://x.test/',
        $prev_pageview_pathname: '/',
      },
    })
    expect(scrubbed.properties).toEqual({
      $pathname: '/program',
      $prev_pageview_pathname: '/',
    })
  })

  it('keeps it when the previous page was public', () => {
    const event = {
      event: '$pageview',
      properties: { $pathname: '/program', $prev_pageview_pathname: '/' },
    }
    expect(withoutExcludedEarlierPages(event)).toBe(event)
  })

  it('runs inside before_send', () => {
    const beforeSend = buildPosthogOptions({
      token: TOKEN,
      conference: 'conf-1',
    }).before_send
    if (typeof beforeSend !== 'function') throw new Error('before_send')
    const sent = beforeSend({
      event: '$pageview',
      properties: {
        $pathname: '/program',
        $prev_pageview_pathname: '/cfp/list',
      },
    } as never) as { properties?: Record<string, unknown> } | null
    expect(sent?.properties).toEqual({
      $pathname: '/program',
      conference: 'conf-1',
    })
  })
})

describe('withConference', () => {
  it('adds the conference when missing and leaves an existing one alone', () => {
    expect(
      withConference({ event: 'x', properties: {} }, 'c1').properties,
    ).toEqual({ conference: 'c1' })
    expect(
      withConference({ event: 'x', properties: undefined }, 'c1').properties,
    ).toEqual({ conference: 'c1' })
    expect(
      withConference({ event: 'x', properties: { conference: 'c0' } }, 'c1')
        .properties?.conference,
    ).toBe('c0')
  })
})

describe('the ingestion rewrites', () => {
  it('proxy the EU ingestion and asset hosts behind the non-obvious path', () => {
    const rewrites = posthogRewrites()
    expect(rewrites).toEqual([
      {
        source: `${POSTHOG_INGEST_PATH}/static/:path*`,
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: `${POSTHOG_INGEST_PATH}/:path*`,
        destination: 'https://eu.i.posthog.com/:path*',
      },
    ])
  })

  it('does not advertise itself', () => {
    expect(POSTHOG_INGEST_PATH).not.toMatch(/posthog|ingest|analytics|track/i)
    expect(ANALYTICS_CONFIG_ELEMENT_ID).toBeTruthy()
  })
})

describe('optInUtmBridge', () => {
  const LANDING = { utm_campaign: 'cfp-open', utm_content: 't1' }

  it('leaves every event before $opt_in alone', () => {
    // A cookieless visitor attributes through the landing pageview reading the
    // address bar; stamping later events would change that (#1000 finding 2).
    const bridge = optInUtmBridge(LANDING)
    const event = { event: '$autocapture', properties: { $pathname: '/' } }
    expect(bridge(event)).toBe(event)
  })

  it('stamps $opt_in and every later untagged event of this page load', () => {
    const bridge = optInUtmBridge(LANDING)
    expect(
      bridge({ event: '$opt_in', properties: { utm_campaign: null } })
        .properties,
    ).toEqual(LANDING)
    expect(bridge({ event: '$pageview', properties: {} }).properties).toEqual(
      LANDING,
    )
  })

  it('never overrides an event that carries its own utm_*', () => {
    const bridge = optInUtmBridge(LANDING)
    bridge({ event: '$opt_in' })
    const tagged = { event: '$pageview', properties: { utm_source: 'news' } }
    expect(bridge(tagged)).toBe(tagged)
  })

  it('never stamps a cookieless event, even after an Accept', () => {
    // Accept, then Decline on the privacy page: the SDK is cookieless again.
    const bridge = optInUtmBridge(LANDING)
    bridge({ event: '$opt_in' })
    const event = { event: '$pageview', properties: { $cookieless_mode: true } }
    expect(bridge(event)).toBe(event)
  })

  it('does nothing for an untagged landing', () => {
    const bridge = optInUtmBridge({})
    bridge({ event: '$opt_in' })
    const event = { event: '$pageview', properties: {} }
    expect(bridge(event)).toBe(event)
  })

  it('runs inside before_send', () => {
    const beforeSend = buildPosthogOptions(
      { token: TOKEN, conference: 'conf-1' },
      LANDING,
    ).before_send
    if (typeof beforeSend !== 'function') throw new Error('before_send')
    const send = (event: string) =>
      (
        beforeSend({ event, properties: { $pathname: '/' } } as never) as {
          properties?: Record<string, unknown>
        } | null
      )?.properties
    expect(send('$pageview')?.utm_campaign).toBeUndefined()
    expect(send('$opt_in')?.utm_campaign).toBe('cfp-open')
    expect(send('$pageview')).toMatchObject({
      utm_campaign: 'cfp-open',
      conference: 'conf-1',
    })
  })
})
