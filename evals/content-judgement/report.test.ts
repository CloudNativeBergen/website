import { describe, expect, it } from 'vitest'
import { buildReport } from './report'
import { loadData, moderationKeys, type WallPhotoItem } from './schema'
import { parseOptions } from './run'
import type { RawResult, WallPhotoResponse } from './transport'

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

describe('wall-photo report', () => {
  const labels = {
    abusive: false,
    sexual: false,
    spam: false,
    personal_info: false,
  }
  const item = (id: string, caption = false): WallPhotoItem => ({
    id,
    ...(caption ? { caption: 'Synthetic caption', lang: 'en' as const } : {}),
    image: { kind: 'generated', generator: 'slide-1' },
    labels: {
      photo: { ...labels },
      ...(caption ? { caption: { ...labels, abusive: true } } : {}),
    },
    tags: caption ? ['benign', 'caption_flag'] : ['borderline', 'no_caption'],
  })
  const result = (item: WallPhotoItem, photoSpam = 0): RawResult => ({
    id: item.id,
    repeat: 1,
    model: 'test',
    latencyMs: 10,
    cost: 0.01,
    answers: Object.fromEntries([
      ...moderationKeys.map((key) => [
        `photo_${key}`,
        { type: 'noul', noul: key === 'spam' ? photoSpam : 0 },
      ]),
      ...(item.caption
        ? moderationKeys.map((key) => [
            `caption_${key}`,
            { type: 'noul', noul: key === 'abusive' ? 1 : 0 },
          ])
        : []),
    ]) as WallPhotoResponse['answers'],
  })

  it('separates caption scoring, counts errors and calibration, and marks zero-positive questions unmeasurable', () => {
    const items = [item('wp-001', true), item('wp-002'), item('wp-003')]
    const report = buildReport(
      [
        {
          surface: 'wall-photo',
          items,
          calibrations: [
            { shape: 'caption', model: 'test', latencyMs: 5, cost: 0.002 },
          ],
          results: [
            result(items[0]),
            result(items[1], 0.5),
            {
              id: items[2].id,
              repeat: 1,
              model: 'test',
              latencyMs: 10,
              cost: 0.01,
              answers: null,
              error: 'image_not_received',
            },
          ],
        },
      ],
      'test',
      1,
    )
    expect(report).toContain('Scored 2/3 items; excluded 1')
    expect(report).toContain('Calls: 4; successful: 3; failed: 1')
    expect(report).toContain('Calibration calls: 1')
    expect(report).toContain('$0.032000')
    expect(report).toContain('image_not_received errors: 1')
    expect(report).toContain(
      '| caption_abusive | 0.5 | 1 | 1 | 100.0% | 100.0% |',
    )
    expect(report).toContain(
      '| photo_abusive | 0.5 | 2 | 0 | 0.0% | not measurable on the public set |',
    )
    expect(report).toContain(
      '| photo_sexual | 0 | not measurable on the public set | not measurable on the public set |',
    )
    expect(report).toContain('| benign | 0.5 | 1 | 0 | 0.0% |')
    expect(report).toContain('| borderline | 0.5 | 1 | 1 | 100.0% |')
    expect(report).toContain('| benign or borderline | 0.5 | 2 | 1 | 50.0% |')
    expect(report).toContain(
      'Photo advice bar on supported public questions at 0.5: fail',
    )
  })

  it('scores each photo question from its own answer', () => {
    // One positive per question, scored 0.9 on its own question and 0.1
    // elsewhere, so reading the wrong answer drops that row to 0% recall.
    const items = moderationKeys.map((key, index) => ({
      ...item(`wp-00${index + 1}`),
      labels: { photo: { ...labels, [key]: true } },
      tags: [key === 'spam' || key === 'personal_info' ? key : 'no_caption'],
    })) as WallPhotoItem[]
    const report = buildReport(
      [
        {
          surface: 'wall-photo',
          items,
          results: items.map((photoItem, index) => ({
            id: photoItem.id,
            repeat: 1,
            model: 'test',
            latencyMs: 10,
            cost: 0.01,
            answers: Object.fromEntries(
              moderationKeys.map((key, keyIndex) => [
                `photo_${key}`,
                { type: 'noul', noul: keyIndex === index ? 0.9 : 0.1 },
              ]),
            ) as WallPhotoResponse['answers'],
          })),
        },
      ],
      'test',
      1,
    )
    for (const key of moderationKeys)
      expect(report).toContain(
        `| photo_${key} | 0.5 | 4 | 1 | 100.0% | 100.0% | 1 | 0 | 0 | 3 |`,
      )
  })

  it('passes only supported photo questions and thresholds mean repeat probabilities', () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      item(`wp-${String(index + 1).padStart(3, '0')}`),
    )
    for (const positive of items.slice(0, 5)) {
      positive.labels.photo.spam = true
      positive.tags = ['spam', 'no_caption']
    }
    const results = items.flatMap((entry) => {
      const first = result(entry, entry.labels.photo.spam ? 0.4 : 0)
      const second = result(entry, entry.labels.photo.spam ? 1 : 0)
      return [first, { ...second, repeat: 2 }]
    })
    const report = buildReport(
      [{ surface: 'wall-photo', items, results }],
      'test',
      2,
    )
    expect(report).toContain(
      '| photo_spam | 0.5 | 6 | 5 | 100.0% | 100.0% | 5 | 0 | 0 | 1 |',
    )
    expect(report).toContain(
      '| photo_spam | 0.9 | 6 | 5 | 0.0% | 0.0% | 0 | 0 | 5 | 1 |',
    )
    expect(report).toContain('| photo_spam | 5 | 100.0% | pass |')
    expect(report).toContain(
      'Photo advice bar on supported public questions at 0.5: pass',
    )
    expect(report).toContain(
      '| photo_abusive | 0 | not measurable on the public set | not measurable on the public set |',
    )
  })
})

describe('held-out gate rows', () => {
  it('are unrounded: 4 false positives in 399 negatives is above 1%', async () => {
    const { parseGateFile } =
      await import('../../src/lib/content-judgement/gates')
    const labels = (abusive: boolean) => ({
      abusive,
      sexual: false,
      spam: false,
      personal_info: false,
    })
    const items = Array.from({ length: 403 }, (_, index) => ({
      id: `fc-${String(index + 1).padStart(3, '0')}`,
      text: 'synthetic',
      lang: 'en' as const,
      labels: labels(index >= 399),
      tags: [index >= 399 ? ('abusive' as const) : ('benign' as const)],
    }))
    const results: RawResult[] = items.map((item, index) => ({
      id: item.id,
      repeat: 1,
      model: 'typesafe/jev-1.14-20261014',
      latencyMs: 1,
      cost: 0,
      answers: {
        // Four benign items flagged at 0.95; every positive caught.
        abusive: {
          type: 'noul',
          noul: index < 4 || index >= 399 ? 0.95 : 0.01,
        },
        sexual: { type: 'noul', noul: 0 },
        spam: { type: 'noul', noul: 0 },
        personal_info: { type: 'noul', noul: 0 },
      },
    }))
    const report = buildReport(
      [{ surface: 'feedback-comment', items, results }],
      'typesafe/jev-1.14',
      1,
      { heldOut: true },
    )
    // The table rounds; the gate rows must not.
    expect(report).toContain('| 1.0% |')
    const json =
      /### Gate rows at 0\.9 \(unrounded\)[\s\S]*?```json\n([\s\S]*?)\n```/.exec(
        report,
      )?.[1]
    const rows = parseGateFile(JSON.parse(json ?? 'null'))
    const abusive = rows.find((row) => row.question === 'abusive')!
    expect(abusive).toMatchObject({
      surface: 'feedbackComment',
      build: 'typesafe/jev-1.14-20261014',
      questionSet: 'v2',
      negatives: 399,
      recall: 1,
    })
    expect(abusive.falsePositiveRate).toBe(4 / 399)
    expect(abusive.falsePositiveRate).toBeGreaterThan(0.01)
  })

  it('are absent from public reports', () => {
    const items = loadData('feedback-comment').slice(0, 1)
    const report = buildReport(
      [{ surface: 'feedback-comment', items, results: [] }],
      'm',
      1,
    )
    expect(report).not.toContain('Gate rows')
  })
})
