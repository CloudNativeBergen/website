/**
 * Sponsor card variants, in a module with NO `'use client'` directive.
 *
 * The studio page is a server component and indexes this array to rotate
 * variants across sponsors. A value exported from a `'use client'` module is
 * turned into a client reference on the server (its `.length` is undefined),
 * which silently collapsed every card to the default variant. Keep this file
 * directive-free; `variants.test.ts` locks it.
 */
export const SPONSOR_CARD_VARIANTS = [
  'code-heroes',
  'cloud-wizards',
  'tech-ninjas',
  'deploy-legends',
  'kubernetes-masters',
  'devops-rockstars',
] as const
export type SponsorCardVariant = (typeof SPONSOR_CARD_VARIANTS)[number]
