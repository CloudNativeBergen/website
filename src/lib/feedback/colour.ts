/** A Feedback Colour (speaker feedback spec §2): Loved it, It was OK, Not for me. */
export const FEEDBACK_COLOURS = ['green', 'yellow', 'red'] as const

export type FeedbackColour = (typeof FEEDBACK_COLOURS)[number]

export function isFeedbackColour(value: unknown): value is FeedbackColour {
  return FEEDBACK_COLOURS.includes(value as FeedbackColour)
}
