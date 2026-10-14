/**
 * What a person is told when their seat decision (#1344) lost the race every
 * time it tried (`busy`): nothing was written, and trying again is the remedy.
 * Kept out of `seats.ts`, which the router tests mock as a whole, so the
 * routers and their tests share the one text.
 */
export const SEATS_BUSY =
  'Many people are signing up for this workshop right now. Nothing was saved. Try again in a moment.'
