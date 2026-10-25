import { describe, expect, it } from 'vitest'
import { buildReport } from './report'
import { loadData } from './schema'
import { parseOptions } from './run'
import type { RawResult } from './transport'

describe('report aggregation', () => {
  it('thresholds mean probabilities, excludes incomplete items, and totals returned usage', () => {
    const items = loadData('wall-caption')
      .slice(0, 2)
      .map((item) => ({
        ...item,
        labels: {
          abusive: true,
          sexual: false,
          spam: false,
          personal_info: false,
        },
      }))
    const results: RawResult[] = [0.4, 1].map((noul, index) => ({
      id: items[0].id,
      repeat: index + 1,
      model: 'test',
      latencyMs: 100 + index * 100,
      cost: 0.01,
      answers: {
        abusive: { type: 'noul', noul },
        sexual: { type: 'noul', noul: 0 },
        spam: { type: 'noul', noul: 0 },
        personal_info: { type: 'noul', noul: 0 },
      },
    }))
    const report = buildReport(
      [{ surface: 'wall-caption', items, results }],
      'test',
      2,
    )
    expect(report).toContain('Scored 1/2 items; excluded 1')
    expect(report).toContain(
      '| 0.7 | 1 | 100.0% | 100.0% | 100.0% | 1 | 0 | 0 | 0 |',
    )
    expect(report).toContain('Repeat stability at 0.5: 0.0% (1 items)')
    expect(report).toContain('$0.020000')
    expect(report).toContain('p95 200 ms')
  })
  it('uses conversation votes, category order for ties, and expected-row confusion', () => {
    const item = {
      ...loadData('conversation-opening')[0],
      category: 'talk_details' as const,
      tags: ['ambiguous'],
    }
    const results: RawResult[] = ['proposal_status', 'talk_details'].map(
      (choice, index) => ({
        id: item.id,
        repeat: index + 1,
        model: 'test',
        latencyMs: 1,
        cost: null,
        answers: {
          category: {
            type: 'choice',
            choice: choice as 'proposal_status' | 'talk_details',
            confidence: 0.8,
            probabilities: {
              talk_details: 0.5,
              proposal_status: 0.5,
              account_and_site: 0,
              schedule: 0,
              travel_and_visa: 0,
              tickets: 0,
              other: 0,
            },
          },
        },
      }),
    )
    const report = buildReport(
      [{ surface: 'conversation-opening', items: [item], results }],
      'test',
      2,
    )
    expect(report).toContain('Accuracy: 100.0%')
    expect(report).toContain('| talk_details | 1 | 0 | 0 | 0 | 0 | 0 | 0 |')
    expect(report).toContain('| ambiguous | 1 | 100.0% |')
    expect(report).toContain('| Correct | 1 | 0.800 |')
    expect(report).toContain('Repeat stability of top choice: 0.0%')
  })
})

describe('CLI options', () => {
  it('defaults to all surfaces with three repeats and four concurrent calls', () => {
    expect(parseOptions([])).toMatchObject({
      surface: 'all',
      repeats: 3,
      concurrency: 4,
      model: 'typesafe/jev-1.14',
      dryRun: false,
    })
    expect(
      parseOptions([
        '--model',
        'vendor/model',
        '--surface',
        'wall-caption',
        '--limit',
        '2',
        '--dry-run',
      ]).out,
    ).toMatch(/vendor-model-\d{4}-\d{2}-\d{2}$/)
  })
  it.each([
    ['--repeats', '0'],
    ['--concurrency', '1.5'],
    ['--limit', '-1'],
    ['--surface', 'unknown'],
    ['--model'],
    ['--unknown'],
  ])('rejects invalid options %j', (...args) => {
    expect(() => parseOptions(args)).toThrow()
  })
})
