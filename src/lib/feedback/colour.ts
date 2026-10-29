/** A Feedback Colour (speaker feedback spec §2): Loved it, It was OK, Not for me. */
export const FEEDBACK_COLOURS = ['green', 'yellow', 'red'] as const

export type FeedbackColour = (typeof FEEDBACK_COLOURS)[number]

/** What each colour says on screen (§2). */
export const FEEDBACK_COLOUR_LABELS: Record<FeedbackColour, string> = {
  green: 'Loved it',
  yellow: 'It was OK',
  red: 'Not for me',
}

export function isFeedbackColour(value: unknown): value is FeedbackColour {
  return FEEDBACK_COLOURS.includes(value as FeedbackColour)
}
