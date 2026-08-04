import { describe, it, expect } from 'vitest'
import { DEFAULT_BACKGROUND_PATTERN } from '@/lib/conference/backgroundPattern'
import { resolvePirschCode } from '@/lib/analytics'
import {
  HOUSE_INFO_PROSE,
  HOUSE_PIRSCH_CODE,
  HOUSE_SOCIAL_HASHTAG,
  SOCIAL_HASHTAG_HOST,
  TARGETS,
  planNotes,
  planSets,
  renderInfoProse,
  resolveTargets,
  type ConferenceDefaultsDoc,
} from './plan'

const BERGEN_2025 = SOCIAL_HASHTAG_HOST
const NORWAY_2026 = '2026.cloudnativedays.no'

function doc(over: Partial<ConferenceDefaultsDoc> = {}): ConferenceDefaultsDoc {
  return {
    _id: 'conf-1',
    domains: [BERGEN_2025],
    city: 'Bergen',
    ...over,
  }
}

/** Apply a plan to a document, the way the Sanity patch would. */
function applyPlan(
  input: ConferenceDefaultsDoc,
  host: string,
): ConferenceDefaultsDoc {
  const next: Record<string, unknown> = { ...input }
  for (const planned of planSets(input, host))
    next[planned.path] = planned.value
  return next as unknown as ConferenceDefaultsDoc
}

describe('house values', () => {
  it('writes a code the runtime resolver actually accepts', () => {
    // If the shape validator and the backfilled value ever disagree, the three
    // sites would store a code that silently renders no script — the exact
    // failure this migration exists to prevent.
    expect(resolvePirschCode(HOUSE_PIRSCH_CODE)).toBe(HOUSE_PIRSCH_CODE)
  })

  it('is pinned as a literal, not read from the code it replaces', () => {
    // The literal is the whole point (see the module header). This assertion is
    // a reminder, not a coupling: it must never be rewritten to import from
    // `src/app/layout.tsx`.
    expect(HOUSE_PIRSCH_CODE).toBe('Jc72d7tD73Ai9raeYVPeXJ0OhEJrrvaK')
  })

  it('captures the Bergen prose the /info page used to hardcode', () => {
    expect(HOUSE_INFO_PROSE.venueTravelInfo).toContain('Flesland')
    expect(HOUSE_INFO_PROSE.venueTravelInfo).toContain('Bybanen')
    expect(HOUSE_INFO_PROSE.speakerDinnerInfo).toContain('Ulriken')
    expect(HOUSE_INFO_PROSE.localRecommendations).toContain('Bryggen')
    expect(HOUSE_INFO_PROSE.localRecommendations).toContain('visitbergen.com')
  })

  it('is a companion to 046, which must also still be pending', () => {
    // 046 pins `backgroundPattern`; this file pins the rest. Both are
    // prerequisites of the same deploy, so assert the neutralisation that makes
    // them mandatory actually shipped.
    expect(DEFAULT_BACKGROUND_PATTERN).toBe('none')
  })
})

describe('renderInfoProse', () => {
  it('substitutes every occurrence of the city placeholder', () => {
    const rendered = renderInfoProse(HOUSE_INFO_PROSE.venueTravelInfo, 'Bergen')
    expect(rendered).toContain('the city center of Bergen')
    expect(rendered).toContain('Bergen airport Flesland')
    expect(rendered).not.toContain('{{city}}')
  })

  it('returns the template unchanged when it needs no city', () => {
    expect(renderInfoProse(HOUSE_INFO_PROSE.speakerDinnerInfo, null)).toBe(
      HOUSE_INFO_PROSE.speakerDinnerInfo,
    )
  })

  it('refuses to render a city-dependent template without a city', () => {
    expect(renderInfoProse(HOUSE_INFO_PROSE.venueTravelInfo, '  ')).toBeNull()
    expect(
      renderInfoProse(HOUSE_INFO_PROSE.localRecommendations, null),
    ).toBeNull()
  })
})

describe('planSets', () => {
  it('writes every absent field for Bergen 2025, hashtag included', () => {
    const paths = planSets(doc(), BERGEN_2025).map((p) => p.path)
    expect(paths).toEqual([
      'analyticsPirschCode',
      'venueTravelInfo',
      'speakerDinnerInfo',
      'localRecommendations',
      'socialHashtag',
    ])
  })

  it('never writes the hashtag to another edition', () => {
    const paths = planSets(doc({ domains: [NORWAY_2026] }), NORWAY_2026).map(
      (p) => p.path,
    )
    expect(paths).not.toContain('socialHashtag')
  })

  it('writes the Bergen hashtag verbatim', () => {
    const planned = planSets(doc(), BERGEN_2025).find(
      (p) => p.path === 'socialHashtag',
    )
    expect(planned?.value).toBe(HOUSE_SOCIAL_HASHTAG)
  })

  it('interpolates the document’s own city, not a hardcoded one', () => {
    const planned = planSets(doc({ city: 'Trondheim' }), BERGEN_2025).find(
      (p) => p.path === 'venueTravelInfo',
    )
    expect(planned?.value).toContain('the city center of Trondheim')
    expect(planned?.value).not.toContain('{{city}}')
  })

  it('skips the city-dependent answers when no city is stored', () => {
    const paths = planSets(doc({ city: null }), BERGEN_2025).map((p) => p.path)
    expect(paths).toContain('speakerDinnerInfo')
    expect(paths).not.toContain('venueTravelInfo')
    expect(paths).not.toContain('localRecommendations')
  })

  it('never overwrites a stored value', () => {
    const stored = doc({
      analyticsPirschCode: 'TENANTOWNCODE1234',
      venueTravelInfo: 'Take the tram.',
      socialHashtag: '#somethingelse',
    })
    const paths = planSets(stored, BERGEN_2025).map((p) => p.path)
    expect(paths).toEqual(['speakerDinnerInfo', 'localRecommendations'])
  })

  it('treats a whitespace-only string as absent', () => {
    const paths = planSets(
      doc({ analyticsPirschCode: '   ' }),
      BERGEN_2025,
    ).map((p) => p.path)
    expect(paths).toContain('analyticsPirschCode')
  })

  it('is idempotent — re-running its own output plans nothing', () => {
    const once = applyPlan(doc(), BERGEN_2025)
    expect(planSets(once, BERGEN_2025)).toEqual([])
  })
})

describe('planNotes', () => {
  it('warns the operator when a city-less document skipped two answers', () => {
    expect(planNotes(doc({ city: null }))).toHaveLength(1)
    expect(planNotes(doc({ city: null }))[0]).toContain('SKIPPED')
  })

  it('says nothing when everything could be written', () => {
    expect(planNotes(doc())).toEqual([])
  })
})

describe('targeting', () => {
  it('reuses 046’s three targets rather than restating them', () => {
    expect(TARGETS).toHaveLength(3)
    expect(TARGETS.map((t) => t.host)).toContain(SOCIAL_HASHTAG_HOST)
  })

  it('aborts rather than guessing when a target is unmatched', () => {
    const { resolved, errors } = resolveTargets([
      { _id: 'conf-1', title: 'Only one', domains: [BERGEN_2025] },
    ])
    expect(resolved).toHaveLength(1)
    expect(errors.length).toBeGreaterThan(0)
  })
})
