import {
  binaryMetrics,
  confusionMatrix,
  mean,
  percentile,
  photoAdviceMetrics,
  stability,
} from './metrics'
import { SURFACE_QUESTION_SET } from './questions'
import {
  categories,
  languages,
  moderationKeys,
  type ConversationItem,
  type DataItem,
  type ModerationItem,
  type ModerationKey,
  type Surface,
  type WallPhotoItem,
} from './schema'
import type {
  ConversationResponse,
  ModerationResponse,
  RawResult,
  WallPhotoResponse,
} from './transport'

export interface SurfaceRun {
  surface: Surface
  items: DataItem[]
  results: RawResult[]
  calibrations?: {
    shape: 'caption' | 'no_caption'
    latencyMs: number
    cost: number | null
    model: string
    inputTokens?: number
    minimumInputTokens?: number
  }[]
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
function moderationReport(
  run: SurfaceRun,
  repeats: number,
  heldOut = false,
): string {
  const scores: ModerationScore[] = []
  for (const item of run.items) {
    if (!('labels' in item) || !('text' in item)) continue
    const results = completeResults(run, item.id, repeats)
    const answers = results.flatMap((result) =>
      result.answers && 'abusive' in result.answers ? [result.answers] : [],
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
          'FPR',
          'Negatives',
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
            percent(metrics.falsePositiveRate),
            metrics.fp + metrics.tn,
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
  if (heldOut) lines.push(gateRows(run, scores, repeats))
  return lines.join('\n\n')
}

/**
 * Held-out runs only: one gate-file row per question at the enforcement
 * threshold, UNROUNDED, ready for src/lib/content-judgement/gates.json
 * (4 false positives in 399 negatives is 1.0025%, which fails a 1% bar that
 * a rounded "1.0%" would appear to meet).
 *
 * Only for what production actually sends: feedback comments, judged ONCE
 * per comment. A mean over repeats can hide single-call false positives, and
 * a caption-only call is not the Wall Post request (caption and photo in one
 * call, prefixed questions), so neither is evidence for a gate.
 */
function gateRows(
  run: SurfaceRun,
  scores: ModerationScore[],
  repeats: number,
): string {
  const heading = '### Gate rows at 0.9 (unrounded)'
  if (run.surface !== 'feedback-comment')
    return `${heading}\n\nNone: ${run.surface} is not the request production sends, so it is not evidence for a gate.`
  if (repeats !== 1)
    return `${heading}\n\nNone: production judges each comment once, so gate rows need \`--repeats 1\`.`
  const builds = [
    ...new Set(
      run.results
        .filter((result) => result.answers !== null)
        .map((result) => result.model),
    ),
  ]
  const rows = moderationKeys.map((key) => {
    const metrics = binaryMetrics(
      scores.map((score) => ({
        expected: score.item.labels[key],
        probability: score.probabilities[key],
      })),
      0.9,
    )
    return {
      question: key,
      surface: 'feedbackComment',
      build: builds.length === 1 ? builds[0] : 'MIXED: do not copy',
      questionSet: SURFACE_QUESTION_SET[run.surface],
      falsePositiveRate: metrics.falsePositiveRate,
      recall: metrics.recall,
      negatives: metrics.fp + metrics.tn,
      date: new Date().toISOString().slice(0, 10),
    }
  })
  return [
    heading,
    'Copy into gates.json only if every bar holds on these exact values.',
    '```json',
    JSON.stringify(rows, null, 2),
    '```',
  ].join('\n')
}

interface WallPhotoScore {
  item: WallPhotoItem
  photo: Record<ModerationKey, number>
  caption?: Record<ModerationKey, number>
}

function wallPhotoReport(run: SurfaceRun, repeats: number): string {
  const scores: WallPhotoScore[] = []
  for (const item of run.items) {
    if (!('image' in item)) continue
    const answers: WallPhotoResponse['answers'][] = completeResults(
      run,
      item.id,
      repeats,
    ).flatMap((result) =>
      result.answers && 'photo_abusive' in result.answers
        ? [result.answers]
        : [],
    )
    if (answers.length !== repeats) continue
    const photo = Object.fromEntries(
      moderationKeys.map((key) => [
        key,
        mean(answers.map((answer) => answer[`photo_${key}`].noul)),
      ]),
    ) as Record<ModerationKey, number>
    const caption =
      item.labels.caption &&
      answers.every((answer) =>
        moderationKeys.every((key) => answer[`caption_${key}`] !== undefined),
      )
        ? (Object.fromEntries(
            moderationKeys.map((key) => [
              key,
              mean(answers.map((answer) => answer[`caption_${key}`]!.noul)),
            ]),
          ) as Record<ModerationKey, number>)
        : undefined
    scores.push({ item, photo, caption })
  }
  const lines = [
    '## wall-photo',
    `Scored ${scores.length}/${run.items.length} items; excluded ${run.items.length - scores.length} with incomplete/failed repeats.`,
    `image_not_received errors: ${run.results.filter((result) => result.error === 'image_not_received').length}.`,
  ]
  for (const part of ['caption', 'photo'] as const) {
    const subset = scores.filter((score) => score[part] !== undefined)
    lines.push(
      `### ${part}`,
      table(
        [
          'Question',
          'Threshold',
          'N',
          'Positives',
          'Precision',
          'Recall',
          'TP',
          'FP',
          'FN',
          'TN',
        ],
        moderationKeys.flatMap((key) =>
          [0.5, 0.9].map((threshold) => {
            const metrics = binaryMetrics(
              subset.map((score) => ({
                expected: score.item.labels[part]![key],
                probability: score[part]![key],
              })),
              threshold,
            )
            const positives = metrics.tp + metrics.fn
            return [
              `${part}_${key}`,
              threshold,
              subset.length,
              positives,
              percent(metrics.precision),
              positives
                ? percent(metrics.recall)
                : 'not measurable on the public set',
              metrics.tp,
              metrics.fp,
              metrics.fn,
              metrics.tn,
            ]
          }),
        ),
      ),
    )
  }
  const advice = photoAdviceMetrics(
    scores.map((score) => ({
      labels: score.item.labels.photo,
      probabilities: score.photo,
      tags: score.item.tags,
    })),
  )
  lines.push(
    '### Photo advice bar',
    `Photo advice bar on supported public questions at 0.5: ${advice.status}. Requires recall >= 95% for every photo question with at least 5 positives and combined benign/borderline FPR <= 5%. Questions without positives are not measurable on the public set; they do not pass.`,
    table(
      ['Question', 'Positives', 'Recall at 0.5', 'Advice status'],
      advice.questions.map((question) => [
        `photo_${question.key}`,
        question.positives,
        question.positives
          ? percent(question.recall)
          : 'not measurable on the public set',
        question.positives === 0
          ? 'not measurable on the public set'
          : question.positives < 5
            ? 'insufficient support (requires 5 positives)'
            : question.recall >= 0.95
              ? 'pass'
              : 'fail',
      ]),
    ),
    table(
      ['Photo slice', 'Threshold', 'N', 'Flagged', 'FPR'],
      ['benign', 'borderline', 'benign or borderline'].flatMap((tag) => {
        const subset = scores.filter((score) =>
          tag === 'benign or borderline'
            ? score.item.tags.some(
                (value) => value === 'benign' || value === 'borderline',
              )
            : score.item.tags.includes(tag as 'benign' | 'borderline'),
        )
        return [0.5, 0.9].map((threshold) => {
          const flagged = subset.filter((score) =>
            moderationKeys.some((key) => score.photo[key] >= threshold),
          ).length
          return [
            tag,
            threshold,
            subset.length,
            flagged,
            fraction(flagged, subset.length),
          ]
        })
      }),
    ),
  )
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
  { heldOut = false }: { heldOut?: boolean } = {},
): string {
  const results = runs.flatMap((run) => run.results)
  const failed = results.filter((result) => result.answers === null)
  const errors = [...new Set(failed.map((result) => result.error))]
  const calibrations = runs.flatMap((run) => run.calibrations ?? [])
  const calls = [...results, ...calibrations]
  return (
    [
      '# Jev offline evaluation',
      ...(heldOut
        ? [
            'Data: a private held-out set, read from a local path. Only these numbers are committed; the items and raw results stay outside the repository.',
          ]
        : []),
      `Question sets: ${runs.map((run) => `${run.surface} ${SURFACE_QUESTION_SET[run.surface]}`).join(', ') || 'none'}. Requested model: ${JSON.stringify(model)}. Repeats: ${repeats}. Created: ${new Date().toISOString()}.`,
      `Calls: ${calls.length}; successful: ${calls.length - failed.length}; failed: ${failed.length}. Known returned cost: $${calls.reduce((total, result) => total + (result.cost ?? 0), 0).toFixed(6)}. Cost missing for ${calls.filter((result) => result.cost === null).length} calls; failed/retried requests may incur additional unreported charges.`,
      `End-to-end request latency (includes retries/backoff and failed calls): p50 ${percentile(
        calls.map((result) => result.latencyMs),
        50,
      ).toFixed(0)} ms; p95 ${percentile(
        calls.map((result) => result.latencyMs),
        95,
      ).toFixed(0)} ms.`,
      ...(calibrations.length
        ? [
            `Calibration calls: ${calibrations.length}; included in calls, cost, and latency, excluded from scoring.`,
            ...calibrations
              .filter((calibration) => calibration.inputTokens !== undefined)
              .map(
                (calibration) =>
                  `Wall-photo calibration (${calibration.shape}) input tokens T0: ${calibration.inputTokens}; minimum accepted image input tokens: ${calibration.minimumInputTokens}.`,
              ),
          ]
        : []),
      `Returned models: ${[...new Set([...results.filter((result) => result.answers !== null), ...calibrations].map((result) => result.model))].map((value) => JSON.stringify(value)).join(', ') || 'none'}.`,
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
          : run.surface === 'wall-photo'
            ? wallPhotoReport(run, repeats)
            : moderationReport(run, repeats, heldOut),
      ),
      heldOut
        ? 'A held-out set is evidence for exactly the model build and question sets above. Copy its numbers to src/lib/content-judgement/gates.json only for those.'
        : 'These deliberately sampled public cases are not representative prevalence estimates or a guarantee of safe deployment. Use held-out examples and human review for deployment decisions.',
    ].join('\n\n') + '\n'
  )
}
