/**
 * SESSION FEEDBACK TOTALS (speaker feedback spec §4.3). The one place counts
 * are added up, so the speaker section, the dashboard chip and (later) the
 * admin table, talk panel and summary can never disagree.
 *
 * - **scanned** = live `feedbackResponse` documents + `feedbackFolded`
 * - **combined** = scanned + Card Counts (`audienceFeedback`)
 *
 * Hidden comments still count: hiding removes text, not a colour (§10.3).
 */
import {
  FEEDBACK_COLOURS,
  isFeedbackColour,
  type FeedbackColour,
} from './colour'

export type ColourCounts = Record<FeedbackColour, number>

/** The `{greenCount, yellowCount, redCount}` shape of Card Counts and a fold. */
export interface StoredCounts {
  greenCount?: number | null
  yellowCount?: number | null
  redCount?: number | null
}

export interface FeedbackTotals {
  combined: ColourCounts
  scanned: ColourCounts
  cards: ColourCounts
  total: number
  scannedTotal: number
  cardsTotal: number
  /** Whole percent of combined answers that are green; null with none. */
  lovedItPercent: number | null
}

/** A hand-typed or missing count, as a whole number of answers. */
export const storedCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0

const fromStored = (stored: StoredCounts | null | undefined): ColourCounts => ({
  green: storedCount(stored?.greenCount),
  yellow: storedCount(stored?.yellowCount),
  red: storedCount(stored?.redCount),
})

const sum = (c: ColourCounts) => c.green + c.yellow + c.red

/**
 * `part` of `total` as a whole percent that never rounds a mixed result to
 * "all" or "none": 199 of 200 is 99 %, 1 of 201 is 1 %.
 */
export function sharePercent(part: number, total: number): number {
  if (part <= 0) return 0
  if (part >= total) return 100
  return Math.min(99, Math.max(1, Math.round((part / total) * 100)))
}

export function feedbackTotals({
  live,
  folded,
  cards,
}: {
  /** Live `feedbackResponse` documents per colour. */
  live: Partial<ColourCounts> | null | undefined
  folded?: StoredCounts | null
  cards?: StoredCounts | null
}): FeedbackTotals {
  const fold = fromStored(folded)
  const cardCounts = fromStored(cards)
  const scanned = {} as ColourCounts
  const combined = {} as ColourCounts
  for (const colour of FEEDBACK_COLOURS) {
    scanned[colour] = storedCount(live?.[colour]) + fold[colour]
    combined[colour] = scanned[colour] + cardCounts[colour]
  }
  const total = sum(combined)
  return {
    combined,
    scanned,
    cards: cardCounts,
    total,
    scannedTotal: sum(scanned),
    cardsTotal: sum(cardCounts),
    lovedItPercent: total === 0 ? null : sharePercent(combined.green, total),
  }
}

/** Live responses per colour, from `{colour}` rows. */
export function countColours(
  rows: readonly { colour?: unknown }[],
): ColourCounts {
  const counts: ColourCounts = { green: 0, yellow: 0, red: 0 }
  for (const row of rows) if (isFeedbackColour(row.colour)) counts[row.colour]++
  return counts
}

/** A talk's stored counts: Card Counts and the fold (§4.2). */
export interface TalkCounts {
  audienceFeedback?: StoredCounts | null
  feedbackFolded?: StoredCounts | null
}

/** {@link feedbackTotals} of one talk and its live response rows. */
export const talkTotals = (
  talk: TalkCounts,
  rows: readonly { colour?: unknown }[],
): FeedbackTotals =>
  feedbackTotals({
    live: countColours(rows),
    folded: talk.feedbackFolded,
    cards: talk.audienceFeedback,
  })

/**
 * Several sessions' totals as one, e.g. a conference's (§10.1): scanned and
 * Card Counts added colour by colour, then through {@link feedbackTotals},
 * so the share is computed the one way.
 */
export function combineTotals(list: readonly FeedbackTotals[]): FeedbackTotals {
  const scanned: ColourCounts = { green: 0, yellow: 0, red: 0 }
  const cards: ColourCounts = { green: 0, yellow: 0, red: 0 }
  for (const t of list) {
    for (const colour of FEEDBACK_COLOURS) {
      scanned[colour] += t.scanned[colour]
      cards[colour] += t.cards[colour]
    }
  }
  return feedbackTotals({
    live: scanned,
    cards: {
      greenCount: cards.green,
      yellowCount: cards.yellow,
      redCount: cards.red,
    },
  })
}
