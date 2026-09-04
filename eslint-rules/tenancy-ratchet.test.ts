// CommonJS module (run by `pnpm run lint:tenancy` via node); imported here
// through esModuleInterop, the same way no-unscoped-groq.test.ts loads the rule.
import ratchet from './tenancy-ratchet'
import baseline from './no-unscoped-groq.baseline.json'

type Message = { ruleId: string | null }

const { compareCounts, countRuleMessages, RULE_ID } = ratchet as unknown as {
  compareCounts: (
    baseline: Record<string, number>,
    current: Record<string, number>,
  ) => {
    increases: { file: string; before: number; after: number }[]
    decreases: { file: string; before: number; after: number }[]
  }
  countRuleMessages: (result: {
    messages?: Message[]
    suppressedMessages?: Message[]
  }) => number
  RULE_ID: string
}

describe('tenancy ratchet comparison', () => {
  it('fails a file that gains a warning', () => {
    const { increases, decreases } = compareCounts({ 'a.ts': 2 }, { 'a.ts': 3 })
    expect(increases).toEqual([{ file: 'a.ts', before: 2, after: 3 }])
    expect(decreases).toEqual([])
  })

  it('passes a file that loses a warning', () => {
    const { increases, decreases } = compareCounts({ 'a.ts': 2 }, { 'a.ts': 1 })
    expect(increases).toEqual([])
    expect(decreases).toEqual([{ file: 'a.ts', before: 2, after: 1 }])
  })

  it('fails a NEW file that carries warnings (no baseline entry means zero)', () => {
    const { increases } = compareCounts({}, { 'new.ts': 1 })
    expect(increases).toEqual([{ file: 'new.ts', before: 0, after: 1 }])
  })

  it('passes a deleted or fully fixed file without demanding action', () => {
    const { increases, decreases } = compareCounts({ 'gone.ts': 3 }, {})
    expect(increases).toEqual([])
    expect(decreases).toEqual([{ file: 'gone.ts', before: 3, after: 0 }])
  })

  // The reason the baseline is keyed by PATH rather than being one repo-wide
  // total: moving an unscoped query from one file to another leaves the total
  // unchanged, and a total-based gate would wave it through.
  it('catches a query MOVED between files even though the total is unchanged', () => {
    const before = { 'a.ts': 2, 'b.ts': 1 }
    const after = { 'a.ts': 1, 'b.ts': 2 }
    const sum = (c: Record<string, number>) =>
      Object.values(c).reduce((n, v) => n + v, 0)
    expect(sum(after)).toBe(sum(before))

    const { increases } = compareCounts(before, after)
    expect(increases).toEqual([{ file: 'b.ts', before: 1, after: 2 }])
  })

  it('reports nothing when every file matches its baseline', () => {
    const counts = { 'a.ts': 2, 'b.ts': 1 }
    expect(compareCounts(counts, { ...counts })).toEqual({
      increases: [],
      decreases: [],
    })
  })
})

// #870: `/* eslint-disable tenancy/no-unscoped-groq */` at the top of a file
// moves every warning from `messages` to `suppressedMessages`. Counting only
// `messages` took src/lib/speaker/sanity.ts from 11 to 0 and the ratchet
// reported it as `Fixed`, exit 0.
describe('per-file warning count', () => {
  const rule = { ruleId: RULE_ID }
  const other = { ruleId: 'no-console' }

  it('counts warnings suppressed by an eslint-disable comment', () => {
    expect(
      countRuleMessages({ messages: [], suppressedMessages: [rule, rule] }),
    ).toBe(2)
  })

  it('counts the same whether or not the file is disabled', () => {
    const reported = { messages: [rule, rule], suppressedMessages: [] }
    const disabled = { messages: [], suppressedMessages: [rule, rule] }
    expect(countRuleMessages(disabled)).toBe(countRuleMessages(reported))
  })

  it('ignores other rules on both sides', () => {
    expect(
      countRuleMessages({
        messages: [other, rule],
        suppressedMessages: [other],
      }),
    ).toBe(1)
  })

  it('tolerates a result with no suppressedMessages field', () => {
    expect(countRuleMessages({ messages: [rule] })).toBe(1)
  })
})

describe('committed baseline', () => {
  it('is internally consistent and names the rule it freezes', () => {
    expect(baseline.rule).toBe(RULE_ID)
    expect(baseline.total).toBe(
      Object.values(baseline.files as Record<string, number>).reduce(
        (n, v) => n + v,
        0,
      ),
    )
  })
})
