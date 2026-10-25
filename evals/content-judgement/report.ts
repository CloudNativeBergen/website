import {
  binaryMetrics,
  confusionMatrix,
  mean,
  percentile,
  stability,
} from './metrics'
import { QUESTION_SET_VERSION } from './questions'
import {
  categories,
  languages,
  moderationKeys,
  type ConversationItem,
  type DataItem,
  type ModerationItem,
  type ModerationKey,
  type Surface,
} from './schema'
import type {
  ConversationResponse,
  ModerationResponse,
  RawResult,
} from './transport'

export interface SurfaceRun {
  surface: Surface
  items: DataItem[]
  results: RawResult[]
}
const thresholds = [0.5, 0.7, 0.9]
const percent = (value: number) => `${(value * 100).toFixed(1)}%`
const fraction = (yes: number, total: number) =>
  total ? percent(yes / total) : 'N/A'
const table = (headers: string[], rows: (string | number)[][]) =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')

function completeResults(
  run: SurfaceRun,
  id: string,
  repeats: number,
): RawResult[] {
  const results = run.results.filter(
    (result) => result.id === id && result.answers !== null,
  )
  return results.length === repeats &&
    new Set(results.map((result) => result.repeat)).size === repeats
    ? results
    : []
}

interface ModerationScore {
  item: ModerationItem
  probabilities: Record<ModerationKey, number>
  repeats: ModerationResponse['answers'][]
}
function moderationReport(run: SurfaceRun, repeats: number): string {
  const scores: ModerationScore[] = []
  for (const item of run.items) {
    if (!('labels' in item)) continue
    const results = completeResults(run, item.id, repeats)
    const answers = results.flatMap((result) =>
      result.answers && !('category' in result.answers) ? [result.answers] : [],
    )
    if (answers.length !== repeats) continue
    const probabilities = Object.fromEntries(
      moderationKeys.map((key) => [
        key,
        mean(answers.map((answer) => answer[key].noul)),
      ]),
    ) as Record<ModerationKey, number>
    scores.push({ item, probabilities, repeats: answers })
  }
  const lines = [
    `## ${run.surface}`,
    `Scored ${scores.length}/${run.items.length} items; excluded ${run.items.length - scores.length} with incomplete/failed repeats.`,
  ]
  for (const key of [...moderationKeys, 'flag'] as const) {
    const probability = (score: ModerationScore) =>
      key === 'flag'
        ? Math.max(...moderationKeys.map((name) => score.probabilities[name]))
        : score.probabilities[key]
    const expected = (score: ModerationScore) =>
      key === 'flag'
        ? Object.values(score.item.labels).some(Boolean)
        : score.item.labels[key]
    const sample = (score: ModerationScore) => ({
      expected: expected(score),
      probability: probability(score),
    })
    const positives = scores.filter(
      (score) => score.item.tags.includes('evasion') && expected(score),
    )
    lines.push(
      `### ${key}`,
      table(
        [
          'Threshold',
          'N',
          'Precision',
          'Recall',
          'F1',
          'TP',
          'FP',
          'FN',
          'TN',
          'Evasion recall (n positives)',
          'harsh_fair FPR (n)',
          'borderline FPR (n)',
        ],
        thresholds.map((threshold) => {
          const metrics = binaryMetrics(scores.map(sample), threshold)
          const fpr = (tag: 'harsh_fair' | 'borderline') => {
            const subset = scores.filter(
              (score) => score.item.tags.includes(tag) && !expected(score),
            )
            return `${subset.length ? percent(binaryMetrics(subset.map(sample), threshold).falsePositiveRate) : 'N/A'} (${subset.length})`
          }
          return [
            threshold,
            scores.length,
            percent(metrics.precision),
            percent(metrics.recall),
            percent(metrics.f1),
            metrics.tp,
            metrics.fp,
            metrics.fn,
            metrics.tn,
            `${positives.length ? percent(binaryMetrics(positives.map(sample), threshold).recall) : 'N/A'} (${positives.length})`,
            fpr('harsh_fair'),
            fpr('borderline'),
          ]
        }),
      ),
    )
    lines.push(
      table(
        [
          'Language',
          'Threshold',
          'N',
          'Precision',
          'Recall',
          'F1',
          'TP',
          'FP',
          'FN',
          'TN',
        ],
        languages.flatMap((lang) =>
          thresholds.map((threshold) => {
            const subset = scores.filter((score) => score.item.lang === lang)
            const metrics = binaryMetrics(subset.map(sample), threshold)
            return [
              lang,
              threshold,
              subset.length,
              percent(metrics.precision),
              percent(metrics.recall),
              percent(metrics.f1),
              metrics.tp,
              metrics.fp,
              metrics.fn,
              metrics.tn,
            ]
          }),
        ),
      ),
    )
    const repeatAnswers = scores.map((score) =>
      score.repeats.map((answer) =>
        key === 'flag'
          ? moderationKeys.some((name) => answer[name].noul >= 0.5)
          : answer[key].noul >= 0.5,
      ),
    )
    lines.push(
      `Repeat stability at 0.5: ${scores.length ? percent(stability(repeatAnswers)) : 'N/A'} (${scores.length} items).`,
    )
  }
  return lines.join('\n\n')
}

interface ConversationScore {
  item: ConversationItem
  predicted: string
  confidence: number
  choices: string[]
}
function conversationReport(run: SurfaceRun, repeats: number): string {
  const scores: ConversationScore[] = []
  for (const item of run.items) {
    if (!('category' in item)) continue
    const results = completeResults(run, item.id, repeats)
    const answers: ConversationResponse['answers']['category'][] =
      results.flatMap((result) =>
        result.answers && 'category' in result.answers
          ? [result.answers.category]
          : [],
      )
    if (answers.length !== repeats) continue
    const votes = categories.map(
      (category) =>
        answers.filter((answer) => answer.choice === category).length,
    )
    scores.push({
      item,
      predicted: categories[votes.indexOf(Math.max(...votes))],
      confidence: mean(answers.map((answer) => answer.confidence)),
      choices: answers.map((answer) => answer.choice),
    })
  }
  const correct = (score: ConversationScore) =>
    score.predicted === score.item.category
  const accuracy = (subset: ConversationScore[]) =>
    fraction(subset.filter(correct).length, subset.length)
  const matrix = confusionMatrix(
    scores.map((score) => ({
      expected: score.item.category,
      predicted: score.predicted,
    })),
    categories,
  )
  const lines = [
    '## conversation-opening',
    `Scored ${scores.length}/${run.items.length} items; excluded ${run.items.length - scores.length} with incomplete/failed repeats. Accuracy: ${accuracy(scores)}.`,
    table(
      ['Category', 'Support', 'Precision', 'Recall'],
      categories.map((category) => {
        const metrics = binaryMetrics(
          scores.map((score) => ({
            expected: score.item.category === category,
            probability: score.predicted === category ? 1 : 0,
          })),
          0.5,
        )
        return [
          category,
          metrics.tp + metrics.fn,
          percent(metrics.precision),
          percent(metrics.recall),
        ]
      }),
    ),
    'Confusion matrix: rows = gold; columns = prediction.',
    table(
      ['Gold \\ prediction', ...categories],
      categories.map((category) => [
        category,
        ...categories.map((predicted) => matrix[category][predicted]),
      ]),
    ),
    table(
      ['Slice', 'N', 'Accuracy'],
      [
        ...['speaker', 'organizer'].map((openedBy) => {
          const subset = scores.filter(
            (score) => score.item.openedBy === openedBy,
          )
          return [openedBy, subset.length, accuracy(subset)]
        }),
        ...languages.map((lang) => {
          const subset = scores.filter((score) => score.item.lang === lang)
          return [lang, subset.length, accuracy(subset)]
        }),
        ...['ambiguous'].map((tag) => {
          const subset = scores.filter((score) => score.item.tags.includes(tag))
          return [tag, subset.length, accuracy(subset)]
        }),
      ],
    ),
    table(
      ['Outcome', 'N', 'Mean confidence'],
      [true, false].map((isCorrect) => {
        const subset = scores.filter((score) => correct(score) === isCorrect)
        return [
          isCorrect ? 'Correct' : 'Wrong',
          subset.length,
          subset.length
            ? mean(subset.map((score) => score.confidence)).toFixed(3)
            : 'N/A',
        ]
      }),
    ),
    `Repeat stability of top choice: ${scores.length ? percent(stability(scores.map((score) => score.choices))) : 'N/A'} (${scores.length} items).`,
  ]
  return lines.join('\n\n')
}

export function buildReport(
  runs: SurfaceRun[],
  model: string,
  repeats: number,
): string {
  const results = runs.flatMap((run) => run.results)
  const failed = results.filter((result) => result.answers === null)
  const errors = [...new Set(failed.map((result) => result.error))]
  return (
    [
      '# Jev offline evaluation',
      `Question set: ${QUESTION_SET_VERSION}. Requested model: ${JSON.stringify(model)}. Repeats: ${repeats}. Created: ${new Date().toISOString()}.`,
      `Calls: ${results.length}; successful: ${results.length - failed.length}; failed: ${failed.length}. Known returned cost: $${results.reduce((total, result) => total + (result.cost ?? 0), 0).toFixed(6)}. Cost missing for ${results.filter((result) => result.cost === null).length} calls; failed/retried requests may incur additional unreported charges.`,
      `End-to-end request latency (includes retries/backoff and failed calls): p50 ${percentile(
        results.map((result) => result.latencyMs),
        50,
      ).toFixed(0)} ms; p95 ${percentile(
        results.map((result) => result.latencyMs),
        95,
      ).toFixed(0)} ms.`,
      `Returned models: ${[...new Set(results.filter((result) => result.answers !== null).map((result) => result.model))].map((value) => JSON.stringify(value)).join(', ') || 'none'}.`,
      ...(errors.length
        ? [
            table(
              ['Error category', 'Count'],
              errors.map((error) => [
                error ?? 'unknown',
                failed.filter((result) => result.error === error).length,
              ]),
            ),
          ]
        : []),
      'Only items with every repeat successful are scored. Inspect failures before comparing runs: exclusions can bias scores. Moderation uses the mean probability per question, then thresholds with >=. The flag metric is any mean question probability >= threshold against any true label. Evasion recall uses gold positives; slice FPR uses gold negatives. Undefined ratios are 0; empty slices show N/A where applicable. Conversation uses majority top-choice vote; ties follow category order in questions.ts. Confidence is the mean reported confidence across repeats, grouped by the aggregate outcome. Single-repeat stability is trivially 100%.',
      ...runs.map((run) =>
        run.surface === 'conversation-opening'
          ? conversationReport(run, repeats)
          : moderationReport(run, repeats),
      ),
      'These deliberately sampled public cases are not representative prevalence estimates or a guarantee of safe deployment. Use held-out examples and human review for deployment decisions.',
    ].join('\n\n') + '\n'
  )
}
