import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
} from '@/lib/branding/theme'
import { DEFAULT_BACKGROUND_PATTERN } from '@/lib/conference/backgroundPattern'
import { sanitizeSvgUpload } from '@/lib/svg/upload'
import { DEFAULT_LOGOMARK_SVG } from '@/lib/pwa/default-mark'
import { ICON_SPECS, renderIconPng } from '@/lib/pwa/icons'
import {
  HOUSE_BACKGROUND_PATTERN,
  HOUSE_SPONSORSHIP_COPY,
  HOUSE_THEME,
  TARGETS,
  hasStoredTheme,
  mergeSponsorshipCopy,
  planNotes,
  planSets,
  resolveTargets,
  type ConferenceIdentityDoc,
  type TargetSpec,
} from './plan'
import {
  LEGACY_BERGEN_LOGOMARK_SVG,
  LEGACY_BERGEN_LOGO_SVG,
} from './legacy-brand'

const bergen: TargetSpec = {
  host: '2025.cloudnativebergen.dev',
  label: 'Bergen 2025',
  restoreLegacyLogo: true,
}
const norway: TargetSpec = {
  host: '2026.cloudnativedays.no',
  label: 'Norway 2026',
  restoreLegacyLogo: false,
}

function doc(over: Partial<ConferenceIdentityDoc> = {}): ConferenceIdentityDoc {
  return { _id: 'conf-1', domains: ['2025.cloudnativebergen.dev'], ...over }
}

/** Apply a plan to a document, the way the Sanity patch would. */
function applyPlan(
  input: ConferenceIdentityDoc,
  spec: TargetSpec,
): ConferenceIdentityDoc {
  const next: Record<string, unknown> = { ...input }
  for (const planned of planSets(input, spec))
    next[planned.path] = planned.value
  return next as unknown as ConferenceIdentityDoc
}

describe('house values', () => {
  // TRIPWIRE, not a coupling. The migration hardcodes these literals on purpose
  // so that running it AFTER the defaults are neutralised cannot write Konf's
  // palette onto a Cloud Native Days site. If this test fails, the platform
  // defaults have moved: that means this migration had to run BEFORE that
  // change. Do NOT "fix" it by following the new constant — either the
  // migration has already been applied (delete it and this assertion) or it
  // still needs to run against the old values.
  it('are exactly what the platform falls back to today', () => {
    expect(HOUSE_THEME.primaryColor).toBe(DEFAULT_PRIMARY_COLOR)
    expect(HOUSE_THEME.accentColor).toBe(DEFAULT_ACCENT_COLOR)
    expect(HOUSE_BACKGROUND_PATTERN).toBe(DEFAULT_BACKGROUND_PATTERN)
  })

  it('matches the hex the live PWA manifests serve', () => {
    // https://2026.cloudnativedays.no/manifest.webmanifest and both Bergen
    // editions all serve "theme_color":"#1D4ED8" — the unthemed fallback.
    expect(HOUSE_THEME.primaryColor).toBe('#1D4ED8')
    expect(HOUSE_THEME.accentColor).toBe('#06B6D4')
  })
})

describe('TARGETS', () => {
  it('names three distinct editions and only restores the logo for Bergen', () => {
    expect(TARGETS).toHaveLength(3)
    expect(new Set(TARGETS.map((t) => t.host)).size).toBe(3)
    expect(
      TARGETS.filter((t) => t.restoreLegacyLogo).map((t) => t.host),
    ).toEqual(['2025.cloudnativebergen.dev', '2024.cloudnativebergen.dev'])
  })
})

describe('resolveTargets', () => {
  const docs = [
    doc({ _id: 'norway-2026', domains: ['2026.cloudnativedays.no'] }),
    doc({ _id: 'bergen-2025', domains: ['2025.cloudnativebergen.dev'] }),
    doc({ _id: 'bergen-2024', domains: ['2024.cloudnativebergen.dev'] }),
  ]

  it('matches each target to exactly one conference', () => {
    const { resolved, errors } = resolveTargets(docs)
    expect(errors).toEqual([])
    expect(resolved.map((r) => r.doc._id)).toEqual([
      'norway-2026',
      'bergen-2025',
      'bergen-2024',
    ])
  })

  it('matches through a wildcard domains[] entry, like the router does', () => {
    const { resolved, errors } = resolveTargets(
      [doc({ _id: 'wild', domains: ['*.cloudnativebergen.dev'] })],
      [bergen],
    )
    expect(errors).toEqual([])
    expect(resolved[0].doc._id).toBe('wild')
  })

  it('ignores case and surrounding whitespace in stored entries', () => {
    const { errors } = resolveTargets(
      [doc({ domains: ['  2025.CloudNativeBergen.dev '] })],
      [bergen],
    )
    expect(errors).toEqual([])
  })

  it('fails loudly when a target has no conference', () => {
    const { resolved, errors } = resolveTargets([], [bergen])
    expect(resolved).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('2025.cloudnativebergen.dev')
  })

  it('fails loudly rather than picking one of several claimants', () => {
    const { resolved, errors } = resolveTargets(
      [
        doc({ _id: 'a', domains: ['2025.cloudnativebergen.dev'] }),
        doc({ _id: 'b', domains: ['*.cloudnativebergen.dev'] }),
      ],
      [bergen],
    )
    expect(resolved).toEqual([])
    expect(errors[0]).toContain('ambiguous')
  })

  it('fails loudly when one document would be patched as two editions', () => {
    const { errors } = resolveTargets(
      [
        doc({
          _id: 'both',
          domains: ['2025.cloudnativebergen.dev', '2024.cloudnativebergen.dev'],
        }),
      ],
      TARGETS.filter((t) => t.restoreLegacyLogo),
    )
    expect(errors.some((e) => e.includes('as two editions'))).toBe(true)
  })

  it('does not match a conference on an unrelated domain', () => {
    const { errors } = resolveTargets(
      [doc({ domains: ['cloudnativebergen.dev', 'localhost:3000'] })],
      [bergen],
    )
    // An apex entry does not serve the `2025.` subdomain.
    expect(errors).toHaveLength(1)
  })
})

describe('planSets — what gets written', () => {
  it('writes the full identity for an unconfigured Bergen edition', () => {
    const sets = planSets(doc(), bergen)
    expect(sets.map((s) => s.path)).toEqual([
      'theme',
      'backgroundPattern',
      'logoBright',
      'logomarkBright',
      'sponsorshipCustomization',
    ])
    expect(sets[0].value).toEqual({
      primaryColor: '#1D4ED8',
      accentColor: '#06B6D4',
    })
    expect(sets[1].value).toBe('cloud-native')
    expect(sets[2].value).toBe(LEGACY_BERGEN_LOGO_SVG)
    expect(sets[3].value).toBe(LEGACY_BERGEN_LOGOMARK_SVG)
  })

  it('never stamps the Bergen mark on an edition with its own logo', () => {
    const sets = planSets(doc(), norway)
    expect(sets.map((s) => s.path)).not.toContain('logoBright')
    expect(sets.map((s) => s.path)).not.toContain('logomarkBright')
  })

  it('is idempotent — a second pass writes nothing', () => {
    const once = applyPlan(doc(), bergen)
    expect(planSets(once, bergen)).toEqual([])
  })

  it('leaves a stored theme alone', () => {
    const sets = planSets(
      doc({ theme: { primaryColor: '#FF0000', accentColor: '#00FF00' } }),
      bergen,
    )
    expect(sets.map((s) => s.path)).not.toContain('theme')
  })

  it('leaves a schema-invalid HALF theme alone rather than completing it', () => {
    // A half theme renders as fully unthemed, so completing it here would
    // change the site — exactly what this migration must not do.
    const half = doc({ theme: { primaryColor: '#FF0000' } })
    expect(hasStoredTheme(half)).toBe(true)
    expect(planSets(half, bergen).map((s) => s.path)).not.toContain('theme')
  })

  it('leaves a deliberately non-default background pattern alone', () => {
    const sets = planSets(doc({ backgroundPattern: 'none' }), bergen)
    expect(sets.map((s) => s.path)).not.toContain('backgroundPattern')
  })

  it('leaves an already-uploaded logo alone', () => {
    const sets = planSets(
      doc({ logoBright: '<svg/>', logomarkBright: '<svg/>' }),
      bergen,
    )
    expect(sets.map((s) => s.path)).not.toContain('logoBright')
    expect(sets.map((s) => s.path)).not.toContain('logomarkBright')
  })

  it('treats a blank string as absent', () => {
    const sets = planSets(doc({ backgroundPattern: '   ' }), bergen)
    expect(sets.map((s) => s.path)).toContain('backgroundPattern')
  })

  // Raised in review: "absent" was implemented as "not a non-empty string",
  // which classified every non-string value as absent. A field holding the
  // wrong TYPE still holds something a human put there, and overwriting it
  // would break the never-overwrite promise on exactly the documents where a
  // silent change is hardest to notice.
  it('leaves a wrong-typed stored value alone instead of overwriting it', () => {
    const sets = planSets(
      doc({
        backgroundPattern: 42 as unknown as string,
        logoBright: { _type: 'image' } as unknown as string,
      }),
      bergen,
    )
    expect(sets.map((s) => s.path)).not.toContain('backgroundPattern')
    expect(sets.map((s) => s.path)).not.toContain('logoBright')
  })
})

describe('mergeSponsorshipCopy', () => {
  it('fills every key when nothing is stored', () => {
    expect(mergeSponsorshipCopy(undefined)).toEqual({
      ...HOUSE_SPONSORSHIP_COPY,
    })
  })

  it('preserves a key the conference already customised', () => {
    // Cloud Native Days Norway 2026 stores its own prospectus heroHeadline —
    // the live /sponsor page does not render the house string.
    const merged = mergeSponsorshipCopy({ heroHeadline: 'Our own headline' })
    expect(merged?.heroHeadline).toBe('Our own headline')
    expect(merged?.packageSectionTitle).toBe('The Base Image')
  })

  it('keeps unrelated stored keys such as prospectusUrl', () => {
    const merged = mergeSponsorshipCopy({ prospectusUrl: 'https://x.test/p' })
    expect(merged?.prospectusUrl).toBe('https://x.test/p')
  })

  it('returns null once every key is present', () => {
    expect(mergeSponsorshipCopy({ ...HOUSE_SPONSORSHIP_COPY })).toBeNull()
  })
})

describe('planNotes — the manual follow-ups the dry run surfaces', () => {
  it('flags an absent homepageSections instead of materialising it', () => {
    const notes = planNotes(doc(), bergen)
    expect(notes.some((n) => n.includes('homepageSections is absent'))).toBe(
      true,
    )
    // and the plan really does not write it
    expect(planSets(doc(), bergen).map((s) => s.path)).not.toContain(
      'homepageSections' as never,
    )
  })

  it('does not flag homepageSections once the tenant has configured it', () => {
    const notes = planNotes(
      doc({ homepageSections: [{ _key: 'a', _type: 'homepageHero' }] }),
      bergen,
    )
    expect(notes.some((n) => n.includes('homepageSections is absent'))).toBe(
      false,
    )
  })

  it('flags a missing square mark on an edition we will not stamp', () => {
    const notes = planNotes(doc(), norway)
    expect(notes.some((n) => n.includes('logomarkBright is empty'))).toBe(true)
  })

  it('stays quiet about the mark when the edition already uploaded one', () => {
    const notes = planNotes(doc({ logomarkBright: '<svg/>' }), norway)
    expect(notes.some((n) => n.includes('logomarkBright is empty'))).toBe(false)
  })
})

describe('the restored legacy Bergen mark', () => {
  it('round-trips byte-for-byte through the authoritative upload sanitizer', () => {
    // i.e. these are exactly the bytes an admin upload of the same file would
    // have stored — the migration is not smuggling anything past the gate.
    for (const svg of [LEGACY_BERGEN_LOGO_SVG, LEGACY_BERGEN_LOGOMARK_SVG]) {
      const result = sanitizeSvgUpload(svg)
      expect(result.ok).toBe(true)
      expect(result.removed).toEqual([])
      expect(result.svg).toBe(svg)
    }
  })

  it('keeps the dark-mode class the deleted component used', () => {
    // The wordmark flipped slate → white via these utilities; both are still
    // emitted by the CSS build (Header.tsx passes the same pair).
    expect(LEGACY_BERGEN_LOGO_SVG).toContain(
      'class="text-brand-slate-gray dark:text-white"',
    )
    expect(LEGACY_BERGEN_LOGO_SVG).toContain('#3B82F6')
    expect(LEGACY_BERGEN_LOGO_SVG).toContain('#98CA3F')
  })

  it('rasterizes to a PWA icon byte-identical to the current fallback', () => {
    // The Bergen editions currently install with DEFAULT_LOGOMARK_SVG (the
    // route falls back when `logomarkBright` is unset). Storing the mark must
    // not change the installed icon — same path data, same gradient stops.
    for (const key of ['512', '512-maskable', 'apple-touch']) {
      const spec = ICON_SPECS[key]
      expect(spec).toBeDefined()
      const before = renderIconPng(DEFAULT_LOGOMARK_SVG, spec)
      const after = renderIconPng(LEGACY_BERGEN_LOGOMARK_SVG, spec)
      expect(after.equals(before)).toBe(true)
    }
  })
})
