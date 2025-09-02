/**
 * Main tRPC App Router
 * This is the central router that combines all feature routers
 */

import { router } from './trpc'
import { sponsorRouter } from './routers/sponsor'
import { featuredRouter } from './routers/featured'
import { speakersRouter } from './routers/speakers'
import { proposalsRouter } from './routers/proposals'
import { travelSupportRouter } from './routers/travelSupport'

export const appRouter = router({
  sponsor: sponsorRouter,
  featured: featuredRouter,
  speakers: speakersRouter,
  proposals: proposalsRouter,
  travelSupport: travelSupportRouter,
  // Future routers can be added here:
  // admin: adminRouter,
})

export type AppRouter = typeof appRouter
