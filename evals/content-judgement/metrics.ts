export interface BinarySample {
  expected: boolean
  probability: number
}

export interface BinaryMetrics {
  tp: number
  fp: number
  fn: number
  tn: number
  precision: number
  recall: number
  f1: number
  falsePositiveRate: number
}

const ratio = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator

/** An answer equal to the threshold is positive. Undefined ratios are zero. */
export function binaryMetrics(
  samples: readonly BinarySample[],
  threshold: number,
): BinaryMetrics {
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0

  for (const { expected, probability } of samples) {
    const predicted = probability >= threshold
    if (expected && predicted) tp++
    else if (predicted) fp++
    else if (expected) fn++
    else tn++
  }

  return {
    tp,
    fp,
    fn,
    tn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    f1: ratio(2 * tp, 2 * tp + fp + fn),
    falsePositiveRate: ratio(fp, fp + tn),
  }
}

export interface CategoryPair {
  expected: string
  predicted: string
}

/** Rows are expected categories; columns are predicted categories. */
export function confusionMatrix(
  pairs: readonly CategoryPair[],
  categories: readonly string[],
): Record<string, Record<string, number>> {
  const categorySet = new Set(categories)
  const matrix: Record<string, Record<string, number>> = Object.fromEntries(
    categories.map((expected) => [
      expected,
      Object.fromEntries(categories.map((predicted) => [predicted, 0])),
    ]),
  )

  for (const { expected, predicted } of pairs) {
    if (!categorySet.has(expected) || !categorySet.has(predicted)) {
      throw new Error('Confusion matrix received an unknown category')
    }
    matrix[expected][predicted]++
  }
  return matrix
}

/** Share of items whose repeat answers all agree; no answers is unstable. */
export function stability<T>(repeats: readonly (readonly T[])[]): number {
  return ratio(
    repeats.filter(
      (answers) =>
        answers.length > 0 && answers.every((answer) => answer === answers[0]),
    ).length,
    repeats.length,
  )
}

export function mean(values: readonly number[]): number {
  return ratio(
    values.reduce((total, value) => total + value, 0),
    values.length,
  )
}

/** Nearest-rank percentile, using a percentage from 0 through 100. */
export function percentile(values: readonly number[], percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('Percentile must be between 0 and 100')
  }
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1)]
}
