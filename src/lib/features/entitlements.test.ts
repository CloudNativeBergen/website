/**
 * Unit tests for the PURE entitlement resolution (`computeEntitlements` /
 * `listEntitledFeatures`): the plan ladder for `ga` features, override-only
 * gating for `beta`/`internal`, override precedence in both directions, and
 * expiry handling. Uses the real registry seeds — `dedicated-email` is the
 * `ga`+`minPlan: 'pro'` entry and `graphql-api`/`slack-mirror` are
 * override-only (`internal`) — so the tests double as a guard on those
 * registry facts.
 */
import { describe, it, expect } from 'vitest'
import { computeEntitlements, listEntitledFeatures } from './entitlements'
import { FEATURES, effectivePlan } from './registry'
import type { OrganizationFeatureOverride } from '@/lib/organization/types'

const NOW = new Date('2026-07-01T12:00:00Z')
const FUTURE = '2026-12-31T00:00:00Z'
const PAST = '2026-01-01T00:00:00Z'

const grant = (
  feature: string,
  extra: Partial<OrganizationFeatureOverride> = {},
): OrganizationFeatureOverride => ({ feature, enabled: true, ...extra })

const revoke = (
  feature: string,
  extra: Partial<OrganizationFeatureOverride> = {},
): OrganizationFeatureOverride => ({ feature, enabled: false, ...extra })

describe('registry assumptions the tests below rely on', () => {
  it('dedicated-email is ga/minPlan pro; graphql-api and slack-mirror are internal', () => {
    expect(FEATURES['dedicated-email']).toMatchObject({
      readiness: 'ga',
      minPlan: 'pro',
    })
    expect(FEATURES['graphql-api'].readiness).toBe('internal')
    expect(FEATURES['slack-mirror'].readiness).toBe('internal')
  })
})

describe('effectivePlan', () => {
  it('defaults absent or invalid stored values to community', () => {
    expect(effectivePlan(undefined)).toBe('community')
    expect(effectivePlan(null)).toBe('community')
    expect(effectivePlan('premium')).toBe('community')
    expect(effectivePlan('enterprise')).toBe('enterprise')
  })
})

describe('computeEntitlements — plan ladder for ga features', () => {
  it('community does not reach a minPlan pro feature', () => {
    expect(
      computeEntitlements('community', [], NOW).has('dedicated-email'),
    ).toBe(false)
  })

  it('pro and enterprise satisfy minPlan pro', () => {
    expect(computeEntitlements('pro', [], NOW).has('dedicated-email')).toBe(
      true,
    )
    expect(
      computeEntitlements('enterprise', [], NOW).has('dedicated-email'),
    ).toBe(true)
  })

  it('an absent plan resolves as community', () => {
    expect(computeEntitlements(undefined, [], NOW).has('dedicated-email')).toBe(
      false,
    )
  })
})

describe('computeEntitlements — beta/internal require an explicit override', () => {
  it('no plan enables an internal feature by itself', () => {
    for (const plan of ['community', 'pro', 'enterprise'] as const) {
      const enabled = computeEntitlements(plan, [], NOW)
      expect(enabled.has('graphql-api')).toBe(false)
      expect(enabled.has('slack-mirror')).toBe(false)
    }
  })

  it('an enabled override grants an internal feature regardless of plan', () => {
    const enabled = computeEntitlements(
      'community',
      [grant('graphql-api')],
      NOW,
    )
    expect(enabled.has('graphql-api')).toBe(true)
  })
})

describe('computeEntitlements — overrides always win', () => {
  it('a disable override revokes a plan-granted ga feature', () => {
    const enabled = computeEntitlements(
      'enterprise',
      [revoke('dedicated-email')],
      NOW,
    )
    expect(enabled.has('dedicated-email')).toBe(false)
  })

  it('a later override for the same feature supersedes an earlier one', () => {
    const enabled = computeEntitlements(
      'community',
      [grant('graphql-api'), revoke('graphql-api')],
      NOW,
    )
    expect(enabled.has('graphql-api')).toBe(false)
  })
})

describe('computeEntitlements — expiry', () => {
  it('an expired grant is ignored', () => {
    const enabled = computeEntitlements(
      'community',
      [grant('graphql-api', { expiresAt: PAST })],
      NOW,
    )
    expect(enabled.has('graphql-api')).toBe(false)
  })

  it('an expired DISABLE override is also ignored (the plan grant returns)', () => {
    const enabled = computeEntitlements(
      'pro',
      [revoke('dedicated-email', { expiresAt: PAST })],
      NOW,
    )
    expect(enabled.has('dedicated-email')).toBe(true)
  })

  it('a future-dated override is active', () => {
    const enabled = computeEntitlements(
      'community',
      [grant('slack-mirror', { expiresAt: FUTURE })],
      NOW,
    )
    expect(enabled.has('slack-mirror')).toBe(true)
  })

  it('an unparsable expiresAt fails closed (treated as expired)', () => {
    const enabled = computeEntitlements(
      'community',
      [grant('graphql-api', { expiresAt: 'not-a-date' })],
      NOW,
    )
    expect(enabled.has('graphql-api')).toBe(false)
  })
})

describe('computeEntitlements — unknown feature ids', () => {
  it('a stale override for a removed feature is inert', () => {
    const enabled = computeEntitlements(
      'community',
      [grant('no-such-feature')],
      NOW,
    )
    expect(enabled.size).toBe(computeEntitlements('community', [], NOW).size)
  })
})

describe('listEntitledFeatures', () => {
  it('flags override-granted features and keeps plan-granted ones unflagged', () => {
    const rows = listEntitledFeatures('pro', [grant('graphql-api')], NOW)
    const byId = Object.fromEntries(rows.map((r) => [r.feature.id, r]))
    expect(byId['dedicated-email'].viaOverride).toBe(false)
    expect(byId['graphql-api'].viaOverride).toBe(true)
  })

  it('omits disabled features entirely', () => {
    const rows = listEntitledFeatures(
      'enterprise',
      [revoke('dedicated-email')],
      NOW,
    )
    expect(rows.find((r) => r.feature.id === 'dedicated-email')).toBeUndefined()
  })
})
