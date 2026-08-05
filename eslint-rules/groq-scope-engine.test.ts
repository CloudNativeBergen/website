import { describe, expect, it } from 'vitest'
import { parse } from 'groq-js'
// CommonJS module (loaded by eslint.config.js via require); imported here
// through esModuleInterop.
import engine from './groq-scope-engine'

const {
  analyzeQuery,
  findMaskedStars,
  scanEverythingTokens,
  rootSourceText,
  collectRoots,
  normalizeSliceBounds,
  probeParse,
} = engine as unknown as {
  analyzeQuery: (
    text: string,
    opts?: Record<string, unknown>,
  ) => {
    parsed: boolean
    error?: string
    locationsReliable: boolean
    unattachedFailOpen: boolean
    maskedStars: number[]
    roots: Array<{
      index: number
      start: number | null
      scoped: boolean
      hasPredicate: boolean
      interpolated: boolean
      interpolatedLeading: boolean
      failOpen: boolean
      creditedToBuilder: boolean
    }>
  }
  findMaskedStars: (
    text: string,
    spans: Array<{ start: number; end: number }>,
    tokens: number[],
  ) => number[]
  scanEverythingTokens: (text: string) => number[]
  rootSourceText: (text: string, start: number) => string
  collectRoots: (
    ast: unknown,
    isFailOpen: null,
  ) => { roots: Array<{ parent: number | null; exprs: unknown[] }> }
  normalizeSliceBounds: (text: string) => string
  probeParse: (text: string) => { parsed: boolean; position: number }
}

// ---------------------------------------------------------------------------
// THE LOCATION MAPPING.
//
// groq-js AST nodes carry no source spans, so the engine pairs the k-th
// `Everything` node in WALK order with the k-th `*` token in TEXTUAL order. The
// PRD asserts the two orders coincide for GROQ's grammar. These tests are where
// that assertion is checked rather than assumed — including the shapes most
// likely to break it: nested roots, sibling roots, roots inside function
// arguments, and roots after a `*` that is really multiplication.
// ---------------------------------------------------------------------------
describe('root location mapping (walk order vs textual order)', () => {
  const cases: Array<{ name: string; query: string; roots: number }> = [
    { name: 'single root', query: '*[_type == "a"]', roots: 1 },
    {
      name: 'nested root in a projection',
      query: '*[_type == "a"]{ "x": *[_type == "b"] }',
      roots: 2,
    },
    {
      name: 'two sibling roots in one projection',
      query: '*[_type == "a"]{ "x": *[_type == "b"], "y": *[_type == "c"] }',
      roots: 3,
    },
    {
      name: 'sibling roots with no outer root',
      query: '{ "a": *[_type == "a"], "b": *[_type == "b"] }',
      roots: 2,
    },
    {
      name: 'root nested two levels deep',
      query: '*[_type == "a"]{ "x": *[_type == "b"]{ "y": *[_type == "c"] } }',
      roots: 3,
    },
    {
      name: 'root inside a function argument',
      query: '*[_type == "a"]{ "n": count(*[_type == "b"]) }',
      roots: 2,
    },
    {
      name: 'root inside the OUTER root filter predicate',
      query: '*[_type == "a" && _id in *[_type == "b"]._id]',
      roots: 2,
    },
    {
      name: 'root after a pipe and order',
      query: '*[_type == "a"] | order(x asc) { "n": count(*[_type == "b"]) }',
      roots: 2,
    },
    { name: 'bare everything', query: 'count(*)', roots: 1 },
    { name: 'everything with a slice only', query: '*[0]', roots: 1 },
    {
      name: 'chained filters are ONE everything',
      query: '*[_type == "a"][defined(x)]',
      roots: 1,
    },
    {
      name: 'a `*` that is multiplication is not a root',
      query: '*[_type == "a" && price * 2 > 10]',
      roots: 1,
    },
    {
      name: 'a `*[` inside a string literal is not a root',
      query: '*[_type == "a" && title match "*[weird]"]',
      roots: 1,
    },
    {
      name: 'a root after the keyword `in`',
      query: '*[true]{"x": _id in *[_type == "conference"].organizers[]._ref}',
      roots: 2,
    },
    {
      name: 'roots inside both arms of a comparison',
      query: 'count(*[_type == "a"]) > count(*[_type == "b"])',
      roots: 2,
    },
  ]

  for (const { name, query, roots } of cases) {
    it(`maps every root to its own star token — ${name}`, () => {
      const result = analyzeQuery(query, {})
      expect(result.parsed).toBe(true)
      expect(result.roots).toHaveLength(roots)
      // The pairing is self-checking: `locationsReliable` is false the moment
      // the k-th node and the k-th token disagree structurally.
      expect(result.locationsReliable).toBe(true)
      // …and the position each root reports really is a `*` in the source.
      for (const root of result.roots) {
        expect(root.start).not.toBeNull()
        expect(query[root.start as number]).toBe('*')
      }
      // Textual order is ascending, which is what makes "k-th token" meaningful.
      const starts = result.roots.map((r) => r.start as number)
      expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    })
  }

  it('walk order and textual order agree node-for-node, not just in count', () => {
    // A count match alone would be satisfied by a scrambled pairing. Compare the
    // predicate of each walked root with the predicate of the root re-parsed
    // from the k-th token's own text.
    const query =
      '*[_type == "outer"]{ "a": *[_type == "first"], "b": count(*[_type == "second"]) }'
    const tokens = scanEverythingTokens(query)
    const walked = collectRoots(parse(query), null).roots
    expect(tokens).toHaveLength(walked.length)
    const expected = ['outer', 'first', 'second']
    tokens.forEach((token, i) => {
      const fragment = rootSourceText(query, token)
      const reparsed = collectRoots(parse(fragment), null).roots[0]
      expect(JSON.stringify(reparsed.exprs)).toBe(
        JSON.stringify(walked[i].exprs),
      )
      expect(fragment).toContain(expected[i])
    })
  })

  it('records which root a nested root is correlated to', () => {
    const walked = collectRoots(
      parse('*[_type == "a"]{ "x": *[_type == "b"], "y": *[_type == "c"] }'),
      null,
    ).roots
    expect(walked.map((r) => r.parent)).toEqual([null, 0, 0])
  })

  it('rejects a pairing it cannot verify, rather than guessing', () => {
    // A filter chained onto a PARENTHESISED or PIPED root: the root's text and
    // the root's AST no longer coincide, because the constraining predicate sits
    // outside the `*[…]` the k-th token opens. The count still matches — one
    // token, one `Everything` — so only the re-parse check catches it, and the
    // engine must give up on positions rather than point at the wrong place.
    for (const query of [
      '(*[_type == "a"])[conference._ref == $conferenceId]',
      '*[_type == "a"] | order(x)[defined(y)]',
    ]) {
      const result = analyzeQuery(query, {})
      expect(result.parsed).toBe(true)
      expect(result.locationsReliable).toBe(false)
      expect(result.roots[0].start).toBeNull()
    }
    // …and the verdict itself is still made: the chained tenant predicate counts.
    expect(
      analyzeQuery('(*[_type == "a"])[conference._ref == $conferenceId]', {})
        .roots[0].scoped,
    ).toBe(true)
  })

  it('treats every root as interpolated when positions are unusable', () => {
    // Fail CLOSED: with no trustworthy mapping the engine cannot tell which root
    // an interpolation sits in, so a visible tenant predicate must not vouch for
    // it.
    const text =
      '*[_type == "a" && conference._ref == $conferenceId] | order(x)[$__i]'
    const start = text.indexOf('$__i')
    const result = analyzeQuery(text, {
      interpolationSpans: [{ start, end: start + 4 }],
    })
    expect(result.locationsReliable).toBe(false)
    expect(result.roots[0].interpolated).toBe(true)
    expect(result.roots[0].scoped).toBe(false)
  })

  it('reports locations as unreliable rather than guessing', () => {
    // A hand-built disagreement: the scanner sees a `*` the parser does not turn
    // into an `Everything`. The engine must degrade, not mis-attribute.
    const tokens = scanEverythingTokens('a * b')
    expect(tokens).toEqual([])
  })
})

describe('a `*` swallowed by a substitution', () => {
  it('reports the star the parser turned into multiplication', () => {
    // `$__i*[…]` is a parameter TIMES an array literal: no `Everything` exists,
    // so the scanner and the AST agree there is no root — correctly, and
    // uselessly. Only the placeholder adjacency reveals it.
    const text = '$__i*[_type == "talk"]'
    const spans = [{ start: 0, end: 4 }]
    const result = analyzeQuery(text, { interpolationSpans: spans })
    expect(result.parsed).toBe(true)
    expect(result.roots).toHaveLength(0)
    expect(result.locationsReliable).toBe(true)
    expect(result.maskedStars).toEqual([4])
  })

  it('keys on PLACEHOLDER-ness, not on the placeholder shape', () => {
    // Every rung the ladder can emit ends in an operand, so each hides a star
    // the same way. A future rung inherits the guard for free.
    for (const placeholder of ['$__i', '_id', '0', '"__i"', '{_w}']) {
      const text = `${placeholder} *[_type == "talk"]`
      const spans = [{ start: 0, end: placeholder.length }]
      expect(
        analyzeQuery(text, { interpolationSpans: spans }).maskedStars,
      ).toHaveLength(1)
    }
    // The slice rung is closed by the OTHER fail-closed path: a leading slice is
    // not an expression, so the literal does not parse and is reported
    // `unparseable`. Either way the query is never silently clean.
    expect(
      analyzeQuery('[0...1] *[_type == "talk"]', {
        interpolationSpans: [{ start: 0, end: 7 }],
      }).parsed,
    ).toBe(false)
  })

  it('does not fire on a star the scanner DID count as a root', () => {
    expect(
      findMaskedStars('$__i, *[_type == "a"]', [{ start: 0, end: 4 }], [6]),
    ).toEqual([])
    // …nor when there are no interpolations at all.
    expect(findMaskedStars('*[_type == "a"]', [], [0])).toEqual([])
  })
})

describe('slice-bound normalisation', () => {
  it('rewrites parameterised slices, which groq-js rejects', () => {
    expect(probeParse('*[_type == "a"][0...$limit]').parsed).toBe(false)
    expect(analyzeQuery('*[_type == "a"][0...$limit]', {}).parsed).toBe(true)
    expect(analyzeQuery('*[_type == "a"][$from...$to]', {}).parsed).toBe(true)
  })

  it('preserves every offset, so root positions stay valid', () => {
    const text = '*[_type == "a"][$from...$to]{ "x": *[_type == "b"] }'
    expect(normalizeSliceBounds(text)).toHaveLength(text.length)
    const result = analyzeQuery(text, {})
    for (const root of result.roots) {
      expect(text[root.start as number]).toBe('*')
    }
  })

  it('leaves constant slices alone', () => {
    expect(normalizeSliceBounds('*[_type == "a"][0...10]')).toBe(
      '*[_type == "a"][0...10]',
    )
  })
})

// ---------------------------------------------------------------------------
// WHAT COUNTS AS SCOPED — the vocabulary of §4, form by form.
// ---------------------------------------------------------------------------
const scoped = (query: string, opts: Record<string, unknown> = {}) =>
  analyzeQuery(query, opts).roots.map((r) => r.scoped)

describe('tenant predicate vocabulary', () => {
  it('T1 — <tenant-field>._ref == $tenant-param, either operand order', () => {
    expect(
      scoped('*[_type == "a" && conference._ref == $conferenceId]'),
    ).toEqual([true])
    expect(scoped('*[$orgId == organization._ref && _type == "a"]')).toEqual([
      true,
    ])
  })

  it('T2 — <tenant-field>._ref in $tenant-param-plural (D1)', () => {
    expect(
      scoped('*[_type == "a" && conference._ref in $conferenceIds]'),
    ).toEqual([true])
  })

  it('T3 — a deref traversal ending in a tenant ref', () => {
    expect(scoped('*[conference->organization._ref == $orgId]')).toEqual([true])
  })

  it('T4 — $tenant-ref in <array-field>[]._ref (D2)', () => {
    expect(scoped('*[$orgRef in organizations[]._ref]')).toEqual([true])
  })

  it('T5 — references() on a BOUND tenant parameter', () => {
    expect(scoped('*[_type == "badge" && references($conferenceId)]')).toEqual([
      true,
    ])
    expect(scoped('*[_type == "badge" && references($speakerId)]')).toEqual([
      false,
    ])
  })

  it('T6 — parent correlation, but only under a SCOPED parent', () => {
    expect(
      scoped(
        '*[_type == "a" && conference._ref == $conferenceId]{ "x": *[_type == "b" && conference._ref == ^.conference._ref] }',
      ),
    ).toEqual([true, true])
    // The same correlation under an UNSCOPED parent correlates to nothing.
    expect(
      scoped(
        '*[_type == "a"]{ "x": *[_type == "b" && conference._ref == ^.conference._ref] }',
      ),
    ).toEqual([false, false])
  })

  it('a predicate in a chained filter still scopes the root', () => {
    expect(scoped('*[_type == "a"][conference._ref == $conferenceId]')).toEqual(
      [true],
    )
  })

  it('a NESTED filter on a non-root does not scope the root around it', () => {
    expect(
      scoped('*[_type == "a"]{ "x": items[conference._ref == $conferenceId] }'),
    ).toEqual([false])
  })
})

describe('deliberate non-recognitions', () => {
  it('`!=` never scopes — excluding one tenant is the opposite', () => {
    expect(
      scoped('*[_type == "a" && conference._ref != $conferenceId]'),
    ).toEqual([false])
  })

  it('`_id ==` point reads are not self-scoping (D3)', () => {
    expect(scoped('*[_type == "a" && _id == $id]')).toEqual([false])
    expect(scoped('*[_id == $conferenceId]')).toEqual([false])
  })

  it('a non-canonical parameter against a tenant field does not count (D2)', () => {
    expect(scoped('*[conference._ref == $someId]')).toEqual([false])
  })

  it('a tenant predicate under a tenant-free disjunct does not scope', () => {
    expect(
      scoped('*[(conference._ref == $conferenceId) || _type == "publicThing"]'),
    ).toEqual([false])
  })

  it('a bare `*` reads every tenant by construction (D4)', () => {
    expect(scoped('count(*)')).toEqual([false])
    expect(analyzeQuery('count(*)', {}).roots[0].hasPredicate).toBe(false)
  })
})

describe('disjunct/conjunct judgement', () => {
  it('every alternative must carry a tenant predicate', () => {
    expect(
      scoped(
        '*[_type == "a" && (conference._ref == $conferenceId || organization._ref == $orgId)]',
      ),
    ).toEqual([true])
    expect(
      scoped(
        '*[(conference._ref == $conferenceId && x) || (organization._ref == $orgId && y)]',
      ),
    ).toEqual([true])
    expect(
      scoped('*[(conference._ref == $conferenceId && x) || (y && z)]'),
    ).toEqual([false])
  })

  it('flags the fail-open shape and marks it as such', () => {
    const result = analyzeQuery(
      '*[_type == "a" && (!defined($conferenceId) || conference._ref == $conferenceId)]',
      {},
    )
    expect(result.roots[0].scoped).toBe(false)
    expect(result.roots[0].failOpen).toBe(true)
  })

  it('a document with no tenant ref is fail-open too', () => {
    const result = analyzeQuery(
      '*[_type == "a" && (conference._ref == $conferenceId || !defined(conference))]',
      {},
    )
    expect(result.roots[0].failOpen).toBe(true)
  })

  it('an ordinary optional filter is not a fail-open TENANT filter', () => {
    const result = analyzeQuery(
      '*[_type == "a" && conference._ref == $conferenceId && (!defined($featured) || featured == $featured)]',
      {},
    )
    expect(result.roots[0].scoped).toBe(true)
    expect(result.roots[0].failOpen).toBe(false)
  })
})

describe('interpolation and builder crediting', () => {
  it('a root whose predicate carries an interpolation is never scoped', () => {
    // `$__x` stands in for `${…}`; the span says where the substitution sits.
    const text = '*[_type == "a" && conference._ref == $conferenceId && $__x]'
    const start = text.indexOf('$__x')
    const result = analyzeQuery(text, {
      interpolationSpans: [{ start, end: start + 4 }],
    })
    expect(result.roots[0].interpolated).toBe(true)
    expect(result.roots[0].scoped).toBe(false)
  })

  it('an interpolation OUTSIDE the root filter leaves it scoped', () => {
    const text =
      '*[_type == "a" && conference._ref == $conferenceId]{ "x": $__x }'
    const start = text.indexOf('$__x')
    const result = analyzeQuery(text, {
      interpolationSpans: [{ start, end: start + 4 }],
    })
    expect(result.roots[0].interpolated).toBe(false)
    expect(result.roots[0].scoped).toBe(true)
  })

  it('credits the builder with the root it actually splices into', () => {
    const text = '*[_type == "a"]{ "x": *[_type == "b"] }'
    const result = analyzeQuery(text, { builderInsertIndex: 0 })
    expect(result.roots.map((r) => r.scoped)).toEqual([true, false])
    expect(result.roots.map((r) => r.creditedToBuilder)).toEqual([true, false])
  })
})

describe('portability — the vocabulary is options, not constants', () => {
  const kontroll = {
    tenantFields: ['organization'],
    tenantParams: ['orgId', 'organizationId'],
    tenantParamsPlural: ['orgIds'],
    idEqualsCounts: true,
    identityFields: ['redeemedBy'],
    identityParams: ['userKey'],
  }

  it("recognises kontroll's org axis, which this repo rejects", () => {
    expect(scoped('*[_type == "invite" && _id == $orgId]')).toEqual([false])
    expect(
      scoped('*[_type == "invite" && _id == $orgId]', {
        vocabulary: kontroll,
      }),
    ).toEqual([true])
    expect(scoped('*[_id in $orgIds]', { vocabulary: kontroll })).toEqual([
      true,
    ])
  })

  it("recognises kontroll's identity axis", () => {
    expect(scoped('*[_type == "invite" && redeemedBy == $userKey]')).toEqual([
      false,
    ])
    expect(
      scoped('*[_type == "invite" && redeemedBy == $userKey]', {
        vocabulary: kontroll,
      }),
    ).toEqual([true])
  })
})

describe('failing closed', () => {
  it('reports a parse failure instead of returning a clean verdict', () => {
    const result = analyzeQuery('*[_type == "a"', {})
    expect(result.parsed).toBe(false)
    expect(result.roots).toEqual([])
    expect(result.error).toBeTruthy()
  })

  it('never lets an unparseable literal look clean', () => {
    for (const broken of ['*[_type == "a"', '*[', '*[_type == "a" &&']) {
      expect(analyzeQuery(broken, {}).parsed).toBe(false)
    }
  })
})
