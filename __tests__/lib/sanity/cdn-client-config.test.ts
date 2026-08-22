/**
 * Configuration guard for the three Sanity clients.
 *
 * Sanity meters `api.sanity.io` and `apicdn.sanity.io` as SEPARATE quotas, and
 * this project sits near its live-API limit. `clientReadCached` is what moves a
 * read onto the CDN quota, so the properties that make it CDN-eligible are
 * load-bearing and are asserted here rather than left to review.
 *
 * The subtle one is `perspective`. Verified against @sanity/client 7.26, the
 * routing decision is:
 *
 *     useCdn = (options.useCdn ?? config.useCdn) && canUseCdn
 *
 * with a later branch that sets `useCdn = false` when `perspective` is
 * `'drafts'`, `'previewDrafts'`, or a non-empty array. A token is never
 * consulted. So setting a perspective ANYWHERE in this module would silently
 * route every read on it back to the live API — no error, no type change, just
 * the quota this PR is trying to relieve filling up again. The repo sets no
 * perspective today; this pins that.
 *
 * SCOPE — READ THIS BEFORE TRUSTING THE FILE. `next-sanity` is aliased
 * suite-wide to `__tests__/mocks/sanity-client.ts`, so these are NOT real
 * clients and this file proves nothing about @sanity/client. The mock's
 * `config()` echoes back exactly the object `src/lib/sanity/client.ts` passed,
 * so what is asserted here is precisely and only OUR CONFIGURATION INTENT.
 *
 * The library half of the claim — that `useCdn: true` plus a token really does
 * reach `apicdn.sanity.io` with an `Authorization` header, and that
 * `perspective: 'drafts'` really does fall back to `api.sanity.io` — was
 * verified out-of-band against the installed @sanity/client 7.26 by
 * intercepting `https.request` and reading the URL each config produced. That
 * evidence is in the pull request, not in this suite, and a test here could not
 * reproduce it without unaliasing the package.
 */

import { describe, expect, it } from 'vitest'
import {
  clientReadCached,
  clientReadUncached,
  clientWrite,
} from '@/lib/sanity/client'

describe('Sanity client configuration', () => {
  it('routes clientReadCached to the CDN and clientReadUncached to the live API', () => {
    expect(clientReadCached.config().useCdn).toBe(true)
    expect(clientReadUncached.config().useCdn).toBe(false)
  })

  it('sets no perspective on any client, which would disable CDN routing', () => {
    // `undefined` specifically: `'published'` would be CDN-safe today but is
    // still a behavioural change nobody has asked for, and an array or
    // `'drafts'` would disable the CDN outright.
    expect(clientReadCached.config().perspective).toBeUndefined()
    expect(clientReadUncached.config().perspective).toBeUndefined()
    expect(clientWrite.config().perspective).toBeUndefined()
  })

  it('keeps every client authenticated', () => {
    // The `production` dataset is private: an unauthenticated read returns HTTP
    // 200 with a null/empty result rather than an error, so a dropped token
    // empties pages SILENTLY. Moving a read to the CDN must never be confused
    // with making it anonymous — the CDN caches authenticated responses,
    // segmented per token.
    for (const client of [clientReadCached, clientReadUncached, clientWrite]) {
      expect(typeof client.config().token).toBe('string')
      expect(client.config().token).not.toBe('')
    }
  })

  it('gives each client a distinct request tag prefix for quota attribution', () => {
    // There is no usage API on this project (`/usage`, `/quotas`, `/metrics`
    // all 404), so the `tag` query parameter is the only way to attribute
    // API vs API-CDN traffic to a code path in manage.sanity.io.
    const prefixes = [
      clientReadCached.config().requestTagPrefix,
      clientReadUncached.config().requestTagPrefix,
      clientWrite.config().requestTagPrefix,
    ]

    expect(prefixes).toEqual(['web.read.cdn', 'web.read.live', 'web.write'])
    expect(new Set(prefixes).size).toBe(3)
    // @sanity/client rejects anything outside this at request time, and a
    // per-call tag is appended as `<prefix>.<tag>`, so the prefix must stay
    // well within the 75-character limit.
    for (const prefix of prefixes) {
      expect(prefix).toMatch(/^[a-z0-9._-]{1,40}$/i)
    }
  })
})
