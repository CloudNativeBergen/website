/**
 * Main tRPC App Router
 * This is the central router that combines all feature routers
 */

import { router } from './trpc'
import { sponsorRouter } from './routers/sponsor'
import { featuredRouter } from './routers/featured'
import { speakersRouter } from './routers/speakers'
import { proposalsRouter } from './routers/proposals'

export const appRouter = router({
  sponsor: sponsorRouter,
  featured: featuredRouter,
  speakers: speakersRouter,
  proposals: proposalsRouter,
  // Future routers can be added here:
  // admin: adminRouter,
})

export type AppRouter = typeof appRouter
