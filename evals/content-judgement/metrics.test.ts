import { describe, it, expect } from 'vitest'
import {
  binaryMetrics,
  confusionMatrix,
  mean,
  percentile,
  stability,
} from './metrics'

describe('binaryMetrics', () => {
  it('counts predictions at the threshold and calculates precision, recall and F1', () => {
    const samples = [
      { expected: true, probability: 0.9 },
      { expected: true, probability: 0.7 },
      { expected: false, probability: 0.8 },
      { expected: true, probability: 0.6 },
      { expected: false, probability: 0.1 },
      { expected: false, probability: 0.3 },
    ]

    expect(binaryMetrics(samples, 0.7)).toEqual({
      tp: 2,
      fp: 1,
      fn: 1,
      tn: 2,
      precision: 2 / 3,
      recall: 2 / 3,
      f1: 2 / 3,
      falsePositiveRate: 1 / 3,
    })
    expect(binaryMetrics(samples, 0.9)).toEqual({
      tp: 1,
      fp: 0,
      fn: 2,
      tn: 3,
      precision: 1,
      recall: 1 / 3,
      f1: 0.5,
      falsePositiveRate: 0,
    })
  })

  it('returns zero for undefined ratios instead of NaN or a perfect score', () => {
    expect(binaryMetrics([], 0.5)).toEqual({
      tp: 0,
      fp: 0,
      fn: 0,
      tn: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      falsePositiveRate: 0,
    })
    expect(
      binaryMetrics([{ expected: false, probability: 0.1 }], 0.5),
    ).toMatchObject({ tn: 1, precision: 0, recall: 0, f1: 0 })
    expect(
      binaryMetrics([{ expected: true, probability: 0.1 }], 0.5),
    ).toMatchObject({ fn: 1, precision: 0, recall: 0, f1: 0 })
    expect(
      binaryMetrics([{ expected: false, probability: 0.8 }], 0.5),
    ).toMatchObject({ fp: 1, recall: 0, falsePositiveRate: 1 })
  })
})

describe('confusionMatrix', () => {
  it('uses expected rows and predicted columns, including unused categories', () => {
    expect(
      confusionMatrix(
        [
          { expected: 'talk_details', predicted: 'talk_details' },
          { expected: 'schedule', predicted: 'talk_details' },
          { expected: 'schedule', predicted: 'talk_details' },
          { expected: 'schedule', predicted: 'schedule' },
        ],
        ['talk_details', 'schedule', 'other'],
      ),
    ).toEqual({
      talk_details: { talk_details: 1, schedule: 0, other: 0 },
      schedule: { talk_details: 2, schedule: 1, other: 0 },
      other: { talk_details: 0, schedule: 0, other: 0 },
    })
  })

  it('rejects categories outside the declared evaluation vocabulary', () => {
    expect(() =>
      confusionMatrix([{ expected: 'typo', predicted: 'other' }], ['other']),
    ).toThrow('unknown category')
  })
})

describe('stability', () => {
  it('measures agreement within each item rather than across different items', () => {
    expect(
      stability([
        [true, true, true],
        [false, false, false],
        [true, false],
      ]),
    ).toBe(2 / 3)
    expect(
      stability([
        ['tickets', 'tickets'],
        ['other', 'schedule'],
      ]),
    ).toBe(0.5)
  })

  it('treats a single answer as stable and missing answers as unstable', () => {
    expect(stability([['other'], []])).toBe(0.5)
    expect(stability([])).toBe(0)
  })
})

describe('summary statistics', () => {
  it('averages repeat probabilities without mutating the input', () => {
    const values = [0.2, 0.8, 0.5]
    expect(mean(values)).toBe(0.5)
    expect(values).toEqual([0.2, 0.8, 0.5])
    expect(mean([])).toBe(0)
  })

  it('uses nearest rank for latency percentiles without sorting the input', () => {
    const values = [100, 10, 80, 30, 50]
    expect(percentile(values, 50)).toBe(50)
    expect(percentile(values, 95)).toBe(100)
    expect(percentile(values, 0)).toBe(10)
    expect(percentile(values, 100)).toBe(100)
    expect(percentile([], 95)).toBe(0)
    expect(values).toEqual([100, 10, 80, 30, 50])
    expect(() => percentile(values, 101)).toThrow('between 0 and 100')
  })
})
