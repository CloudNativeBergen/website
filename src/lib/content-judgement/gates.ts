import { z } from 'zod'
import committed from './gates.json'
import { moderationKeys } from './questions'

/**
 * The held-out gate file (Content judgement spec §10.2): one row per question
 * that has been measured on a held-out set written by people (§11.2), as
 * numbers only. A row is evidence for exactly one surface, model build and
 * question set; a new build or question set needs a new row.
 *
 * Empty until H1 (#1589) commits the first numbers. J7 combines these rows
 * with the agreement tally to decide which questions can be enforced; a row
 * here is necessary, never sufficient.
 */

const questionKey = z.enum([
  ...moderationKeys,
  ...moderationKeys.map((key) => `caption_${key}` as const),
  ...moderationKeys.map((key) => `photo_${key}` as const),
])

export const gateRowSchema = z
  .strictObject({
    question: questionKey,
    surface: z.enum(['feedbackComment', 'wallPost']),
    /** The dated build that answered, e.g. `typesafe/jev-1.14-20261014`. */
    build: z.string().regex(/^[a-z0-9-]+\/[a-z0-9.-]+-\d{8}$/),
    questionSet: z.string().regex(/^v\d+$/),
    /** At the enforcement threshold, 0.9. */
    falsePositiveRate: z.number().min(0).max(1),
    recall: z.number().min(0).max(1),
    /** Benign items scored; the bar needs at least 300. */
    negatives: z.number().int().nonnegative(),
    /** When the held-out run was made, `YYYY-MM-DD`. */
    date: z.iso.date(),
  })
  // A comment question is a bare key; a Wall Post's is `caption_` or `photo_`.
  .refine(
    (row) =>
      (row.surface === 'wallPost') === /^(caption|photo)_/.test(row.question),
    { message: 'question does not belong to its surface' },
  )

export type GateRow = z.infer<typeof gateRowSchema>

export function parseGateFile(value: unknown): GateRow[] {
  return z.array(gateRowSchema).parse(value)
}

/** The committed rows, validated at import so a malformed edit fails loudly. */
export const HELD_OUT_GATES: readonly GateRow[] = parseGateFile(committed)
